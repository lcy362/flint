#!/usr/bin/env node
/**
 * Flint CLI —— `npx flint-skills-hub` / `npx flint` 的入口。
 *
 * 职责只有三件事：解析参数 → 端口自检 → 拉起 server 构建产物。
 * 业务逻辑全部在 server/dist 里，本文件不依赖任何第三方包。
 */
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_PORT = 8787;
const SERVER_ENTRY = path.join(ROOT, 'server', 'dist', 'index.js');
const CLIENT_DIST = process.env.FLINT_CLIENT_DIST ?? path.join(ROOT, 'client', 'dist');

const HELP = `Flint — local-first personal AI skills asset manager

Usage:
  npx flint-skills-hub [options]
  npx flint [options]

Options:
  -p, --port <port>   Port to listen on (default: ${DEFAULT_PORT}, or $PORT)
  -r, --restart       Force-stop whatever is already on the port, then start fresh
      --no-open       Do not open the browser automatically
  -h, --help          Show this help
  -v, --version       Show the installed version

Environment:
  PORT                Same as --port
  FLINT_CONFIG        Config file path (default: ~/.flint/config.json)
  FLINT_CLIENT_DIST   Override the built Web UI directory

Then open http://localhost:<port> in your browser.`;

function fail(msg) {
  console.error(`[flint] ${msg}`);
  process.exit(1);
}

function parsePort(raw) {
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1 || port > 65535) fail(`Invalid port: ${raw}`);
  return port;
}

function parseArgs(argv) {
  const opts = {
    port: parsePort(process.env.PORT ?? DEFAULT_PORT),
    open: true,
    restart: false,
    help: false,
    version: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '-h' || arg === '--help') opts.help = true;
    else if (arg === '-v' || arg === '--version') opts.version = true;
    else if (arg === '-r' || arg === '--restart') opts.restart = true;
    else if (arg === '--no-open') opts.open = false;
    else if (arg === '-p' || arg === '--port') opts.port = parsePort(argv[++i]);
    else if (arg.startsWith('--port=')) opts.port = parsePort(arg.slice('--port='.length));
    else fail(`Unknown option: ${arg}\nRun with --help for usage.`);
  }
  return opts;
}

/**
 * 端口自检：占用即报错退出，不做「自动换端口」——
 * 起在哪个端口上必须可预期，静默换端口会让用户以为服务没起来。
 */
function assertPortFree(port) {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        fail(
          `port ${port} is already in use.\n` +
          `        Restart the running instance: flint -r\n` +
          `        Or start on another port: PORT=${port + 1} npx flint-skills-hub`,
        );
      }
      reject(err);
    });
    probe.once('listening', () => probe.close(() => resolve()));
    probe.listen(port, '127.0.0.1');
  });
}

/** 轮询到服务能应答为止；任何 HTTP 响应（含 404）都说明已在监听 */
async function waitReady(port, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      await fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(2000) });
      return true;
    } catch {
      await new Promise((r) => setTimeout(r, 250));
    }
  }
  return false;
}

/** 找到占用某端口的进程 PID（mac/Linux 用 lsof，Windows 用 netstat）；找不到或无权限返回空数组 */
function findPidsOnPort(port) {
  try {
    if (process.platform === 'win32') {
      const out = spawnSync('netstat', ['-ano'], { encoding: 'utf8' }).stdout || '';
      const pids = new Set();
      for (const line of out.split('\n')) {
        if (line.includes(`:${port}`) && /TCP|UDP/.test(line)) {
          const pid = line.trim().split(/\s+/).pop();
          if (/^\d+$/.test(pid) && pid !== '0') pids.add(pid);
        }
      }
      return [...pids];
    }
    const out = spawnSync('lsof', ['-ti', `tcp:${port}`], { encoding: 'utf8' }).stdout || '';
    return out.split('\n').map((s) => s.trim()).filter(Boolean);
  } catch {
    return [];
  }
}

/** 阻塞式小睡，避免引入第三方依赖；仅用于等端口让位这种短等待 */
function sleepMs(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/** 先 SIGTERM，稍候再 SIGKILL——`--restart` 要的是强制，但给优雅退出留一次机会 */
function forceKill(pids) {
  for (const pid of pids) {
    try { process.kill(Number(pid), 'SIGTERM'); } catch { /* 可能已退 */ }
  }
  sleepMs(400);
  for (const pid of pids) {
    try { process.kill(Number(pid), 'SIGKILL'); } catch { /* 已退出 */ }
  }
}

/** --restart：把已占用端口的旧实例清掉（否则它仍在读旧代码 / 旧配置），再交给 main 起新的 */
function forceRestart(port) {
  const pids = findPidsOnPort(port);
  if (pids.length === 0) {
    console.log(`[flint] no process on port ${port} — starting fresh`);
    return;
  }
  console.log(`[flint] stopping ${pids.length} process(es) on port ${port} (pid=${pids.join(',')})`);
  forceKill(pids);
  // 等端口真的让出来再往下走，避免 assertPortFree 报 EADDRINUSE
  const deadline = Date.now() + 3000;
  while (Date.now() < deadline && findPidsOnPort(port).length > 0) {
    sleepMs(100);
  }
}

function openBrowser(url) {
  const [cmd, args] = process.platform === 'darwin'
    ? ['open', [url]]
    : process.platform === 'win32'
      ? ['cmd', ['/c', 'start', '', url]]
      : ['xdg-open', [url]];
  try {
    spawn(cmd, args, { stdio: 'ignore', detached: true }).unref();
  } catch {
    /* 无 GUI / 无 xdg-open 的环境：忽略即可，URL 已打印 */
  }
}

function readVersion() {
  try {
    return JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf-8')).version;
  } catch {
    return 'unknown';
  }
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    console.log(HELP);
    return;
  }
  if (opts.version) {
    console.log(readVersion());
    return;
  }

  if (!fs.existsSync(SERVER_ENTRY)) {
    fail(
      'server build not found.\n' +
      `        Expected: ${SERVER_ENTRY}\n` +
      '        Running from source? Build it first: npm install && npm run build',
    );
  }

  const hasClient = fs.existsSync(path.join(CLIENT_DIST, 'index.html'));
  if (!hasClient) {
    opts.open = false;
    console.warn('[flint] Web UI build not found — only the API will be available.');
    console.warn(`        Expected: ${path.join(CLIENT_DIST, 'index.html')}`);
    console.warn('        Running from source? Build it first: npm run build');
  }

  if (opts.restart) {
    forceRestart(opts.port);
  }

  await assertPortFree(opts.port);
  process.env.PORT = String(opts.port);

  // server 入口在模块顶层就 listen 了，import 即启动
  await import(pathToFileURL(SERVER_ENTRY).href);

  const url = `http://localhost:${opts.port}`;
  const ready = await waitReady(opts.port);
  if (!ready) {
    console.warn(`[flint] server did not respond within 20s — check the log at ~/.flint/logs/app.log`);
    return;
  }
  // 只在交互式终端里自动开浏览器：CI / 管道 / 服务器环境里开浏览器只会添乱
  if (opts.open && process.stdout.isTTY && !process.env.CI) {
    console.log(`[flint] opening ${url}`);
    openBrowser(url);
  }
}

main().catch((err) => {
  console.error(`[flint] ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
