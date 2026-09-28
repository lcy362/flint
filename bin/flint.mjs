#!/usr/bin/env node
/**
 * Flint CLI —— `npx flint-skills-hub` / `npx flint` 的入口。
 *
 * 启动行为与仓库根目录的 start.sh 对齐（后台驻留，CLI 自身退出）：
 *   Node 版本检查 → 端口自检 / 已有实例识别 → 后台拉起 server → 等待就绪 → 打开浏览器 → 退出。
 * 运行日志落 FLINT_LOGS（默认 ~/.flint/logs），控制台只保留必要的启动信息。
 * 排错或容器场景要前台运行时，用 --foreground。
 */
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_PORT = 8787;
const SERVER_ENTRY = path.join(ROOT, 'server', 'dist', 'index.js');
const CLIENT_DIST = process.env.FLINT_CLIENT_DIST ?? path.join(ROOT, 'client', 'dist');

// 日志目录跟随配置目录（与 server 的 logger 同一套规则），可用 FLINT_LOGS 覆盖
const CONFIG_PATH = process.env.FLINT_CONFIG ?? path.join(os.homedir(), '.flint', 'config.json');
const LOG_DIR = process.env.FLINT_LOGS ?? path.join(path.dirname(CONFIG_PATH), 'logs');
const STARTUP_LOG = path.join(LOG_DIR, 'flint.log');
const APP_LOG = path.join(LOG_DIR, 'app.log');
const PID_FILE = path.join(LOG_DIR, 'flint.pid');

const BANNER = String.raw`
████████╗     ██╗         ██╗         ███╗   ██╗  ████████╗
██╔════╝      ██║         ██║         ████╗  ██║  ╚══██╔══╝
█████╗        ██║         ██║         ██╔██╗ ██║     ██║
██╔══╝        ██║         ██║         ██║╚██╗██║     ██║
██║           ██║         ██║         ██║ ╚████║     ██║
╚═╝           ╚██████╗    ╚═╝         ╚═╝  ╚═══╝     ╚═╝
local-first personal AI skills asset manager`;

const HELP = `Flint — local-first personal AI skills asset manager

Usage:
  npx flint-skills-hub [options]
  npx flint [options]

Starts the server in the background (same model as ./start.sh), waits until it
answers, opens the browser, then exits — Flint keeps running in the background.

Options:
  -p, --port <port>   Port to listen on (default: ${DEFAULT_PORT}, or $PORT)
  -y, --yes           Force restart: stop the running instance, then start again
  -r, --restart       Alias of --yes
      --no-open       Do not open the browser automatically
  -f, --foreground    Run in the foreground (log to the console) instead of detaching
  -h, --help          Show this help
  -v, --version       Show the installed version

Environment:
  PORT                Same as --port
  FLINT_CONFIG        Config file path (default: ~/.flint/config.json)
  FLINT_CLIENT_DIST   Override the built Web UI directory
  FLINT_LOGS          Log directory (default: ${LOG_DIR})

Logs: startup=${STARTUP_LOG}  app=${APP_LOG}`;

function info(msg) { console.log(`[info]  ${msg}`); }
function warn(msg) { console.warn(`[warn]  ${msg}`); }
function fail(msg) {
  console.error(`[error] ${msg}`);
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
    foreground: false,
    help: false,
    version: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '-h' || arg === '--help') opts.help = true;
    else if (arg === '-v' || arg === '--version') opts.version = true;
    else if (arg === '-r' || arg === '--restart' || arg === '-y' || arg === '--yes') opts.restart = true;
    else if (arg === '--no-open') opts.open = false;
    else if (arg === '-f' || arg === '--foreground') opts.foreground = true;
    else if (arg === '-p' || arg === '--port') opts.port = parsePort(argv[++i]);
    else if (arg.startsWith('--port=')) opts.port = parsePort(arg.slice('--port='.length));
    else fail(`Unknown option: ${arg}\nRun with --help for usage.`);
  }
  return opts;
}

/** Node 版本门槛与 package.json 的 engines 一致，早报错胜过运行时报怪错 */
function assertNodeVersion() {
  const major = Number(process.versions.node.split('.')[0]);
  if (major < 20) fail(`Node.js ${process.version} is too old — Flint requires >= 20 (https://nodejs.org/)`);
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
          `        Restart the running instance: flint -y\n` +
          `        Or start on another port: PORT=${port + 1} npx flint-skills-hub`,
        );
      }
      reject(err);
    });
    probe.once('listening', () => probe.close(() => resolve()));
    probe.listen(port, '127.0.0.1');
  });
}

/** 任何 HTTP 响应（含 404）都说明服务已在监听 */
async function ping(port) {
  try {
    await fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(2000) });
    return true;
  } catch {
    return false;
  }
}

async function waitReady(port, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await ping(port)) return true;
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}

/**
 * 外部排查命令一律解析成绝对路径，绝不交给 PATH 查找（S4036）：
 * PATH 可能被注入，且 npx 场景下的 PATH 未必等同于用户 shell 的 PATH。
 * 找不到对应工具时返回 null，由调用方降级为空结果。
 */
function firstExisting(candidates) {
  return candidates.find((p) => fs.existsSync(p)) ?? null;
}

const LSOF_BIN = firstExisting(['/usr/sbin/lsof', '/usr/bin/lsof', '/sbin/lsof']);
const PS_BIN = firstExisting(['/bin/ps', '/usr/bin/ps']);

const NETSTAT_BIN = firstExisting([
  process.env.SystemRoot ? path.join(process.env.SystemRoot, 'System32', 'netstat.exe') : null,
  // path.win32 拼出 Windows 路径，避免在源码里写转义反斜杠
  path.win32.join('C:', 'Windows', 'System32', 'netstat.exe'),
].filter(Boolean));

/** Windows：从 netstat -ano 的输出里挑出占用该端口的 PID */
function pidsFromNetstat(port) {
  if (!NETSTAT_BIN) return [];
  const out = spawnSync(NETSTAT_BIN, ['-ano'], { encoding: 'utf8' }).stdout || '';
  const pids = new Set();
  for (const line of out.split('\n')) {
    if (!line.includes(`:${port}`) || !/TCP|UDP/.test(line)) continue;
    const pid = line.trim().split(/\s+/).pop();
    if (/^\d+$/.test(pid) && pid !== '0') pids.add(pid);
  }
  return [...pids];
}

/** 找到占用某端口的进程 PID（mac/Linux 用 lsof，Windows 用 netstat）；找不到或无权限返回空数组 */
function findPidsOnPort(port) {
  try {
    if (process.platform === 'win32') return pidsFromNetstat(port);
    if (!LSOF_BIN) return [];
    const out = spawnSync(LSOF_BIN, ['-ti', `tcp:${port}`], { encoding: 'utf8' }).stdout || '';
    return out.split('\n').map((s) => s.trim()).filter(Boolean);
  } catch {
    return [];
  }
}

/** 读取上次后台启动记录的 PID；不可用返回 null */
function recordedPid() {
  try {
    const pid = Number(fs.readFileSync(PID_FILE, 'utf8').trim());
    return Number.isInteger(pid) && pid > 0 ? pid : null;
  } catch {
    return null;
  }
}

function isAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** 进程完整命令行；Windows 与「无 ps」环境返回空串，由调用方降级处理 */
function commandOf(pid) {
  if (!PS_BIN) return '';
  const out = spawnSync(PS_BIN, ['-o', 'command=', '-p', String(pid)], { encoding: 'utf8' }).stdout || '';
  return out.trim();
}

/**
 * 判断端口占用者是不是 Flint 自己——自己人提示「已在运行」，外人一律不碰。
 * 两条线索：pid 文件（自己上次写的）与进程命令行（node .../server/dist/index.js）。
 */
function isFlintProcess(pid, ownPid) {
  const num = Number(pid);
  if (ownPid && num === ownPid) return true;
  const cmd = commandOf(num);
  if (!cmd) return false;
  return cmd.includes(SERVER_ENTRY) || cmd.includes(path.join('bin', 'flint.mjs'));
}

/**
 * 端口归属分类：none（空闲）/ self（Flint 实例）/ other（别人的进程）。
 * 拿不到命令行时无法区分 self 与 other，保守归为 other，避免误杀。
 */
function classifyPortOwner(port) {
  const pids = findPidsOnPort(port);
  if (pids.length === 0) return { kind: 'none', pids };
  const ownPid = recordedPid();
  const self = pids.filter((p) => isFlintProcess(p, ownPid));
  return self.length > 0 ? { kind: 'self', pids: self } : { kind: 'other', pids };
}

/** 阻塞式小睡，避免引入第三方依赖；仅用于等端口让位这种短等待 */
function sleepMs(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/** 先 SIGTERM，稍候再 SIGKILL——强制重启要的是结果，但给优雅退出留一次机会 */
function forceKill(pids) {
  for (const pid of pids) {
    try { process.kill(Number(pid), 'SIGTERM'); } catch { /* 可能已退 */ }
  }
  sleepMs(400);
  for (const pid of pids) {
    try { process.kill(Number(pid), 'SIGKILL'); } catch { /* 已退出 */ }
  }
}

/** 杀掉实例并等端口真的让出来，避免紧接着的启动撞上 EADDRINUSE */
function killPids(pids, port) {
  forceKill(pids);
  const deadline = Date.now() + 3000;
  while (Date.now() < deadline && findPidsOnPort(port).length > 0) {
    sleepMs(100);
  }
}

/** 各平台「打开链接」的命令与参数（Windows 需经 cmd /c start） */
function openCommand(url) {
  if (process.platform === 'darwin') return ['open', [url]];
  if (process.platform === 'win32') return ['cmd', ['/c', 'start', '', url]];
  return ['xdg-open', [url]];
}

function openBrowser(url) {
  const [cmd, args] = openCommand(url);
  try {
    spawn(cmd, args, { stdio: 'ignore', detached: true }).unref();
  } catch {
    /* 无 GUI / 无 xdg-open 的环境：忽略即可，URL 已打印 */
  }
}

/** 只在交互式终端里自动开浏览器：CI / 管道 / 服务器环境里开浏览器只会添乱 */
function maybeOpen(url, opts) {
  if (!opts.open || !process.stdout.isTTY || process.env.CI) return false;
  info(`Opening ${url}`);
  openBrowser(url);
  return true;
}

function readVersion() {
  try {
    return JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf-8')).version;
  } catch {
    return 'unknown';
  }
}

/** 启动日志的最后几行：后台进程起不来时，控制台得给出可直接看的原因 */
function tailLog(lines = 20) {
  try {
    return fs.readFileSync(STARTUP_LOG, 'utf8').split('\n').slice(-lines).join('\n').trim();
  } catch {
    return '(no log written)';
  }
}

function restartHints() {
  info('Restart (use only if you really need to):  npx flint-skills-hub -y');
  info(`Logs: ${STARTUP_LOG}    (server app log: ${APP_LOG})`);
}

/** 后台模式：detached 拉起 server，日志重定向到启动日志文件 */
function spawnDetached(port) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
  const fd = fs.openSync(STARTUP_LOG, 'a');
  const child = spawn(process.execPath, [SERVER_ENTRY], {
    cwd: ROOT,
    detached: true,
    stdio: ['ignore', fd, fd],
    env: { ...process.env, PORT: String(port) },
  });
  // fd 已被子进程继承，父进程这边可以关掉
  fs.closeSync(fd);
  child.unref();
  try {
    fs.writeFileSync(PID_FILE, String(child.pid), 'utf8');
  } catch {
    warn(`Could not write ${PID_FILE} — the stop hint below still works with the printed PID.`);
  }
  return child;
}

/** 等后台子进程就绪；中途退出或超时都返回原因，由调用方决定怎么报 */
async function waitForChild(port, child, timeoutMs = 30000) {
  let exited = false;
  child.once('exit', () => { exited = true; });
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (exited) return 'exited';
    if (await ping(port)) return 'ready';
    await new Promise((r) => setTimeout(r, 250));
  }
  return 'timeout';
}

/** 已在运行：能应答就开浏览器收工，不能应答（僵进程）就提示重启 */
async function handleAlreadyRunning(opts, pids) {
  const url = `http://localhost:${opts.port}`;
  if (await ping(opts.port)) {
    info(`Flint is already running (PID:${pids.join(',')}); the page is open — no restart needed.`);
    maybeOpen(url, opts);
    info('Keep using the running instance as-is; restarting only helps if it behaves incorrectly.');
    restartHints();
    return;
  }
  warn(`A Flint process holds port ${opts.port} (PID:${pids.join(',')}), but it does not respond (stale process).`);
  warn('Restart to recover a healthy instance:  npx flint-skills-hub -y');
  restartHints();
}

/** 后台启动主流程（默认路径，与 start.sh 一致） */
async function startBackground(opts) {
  const owner = classifyPortOwner(opts.port);
  if (owner.kind === 'self' && !opts.restart) {
    await handleAlreadyRunning(opts, owner.pids);
    return;
  }
  if (owner.kind === 'other') {
    // 归属明确（拿得到命令行）时绝不杀别人的进程；只有在无法辨认归属
    // （Windows 等无 ps 的环境）且用户显式给了 -y 时，才按「强制重启」执行。
    const identifiable = commandOf(Number(owner.pids[0])) !== '';
    if (identifiable || !opts.restart) {
      fail(
        `port ${opts.port} is in use by another process (PID:${owner.pids.join(',')}) — Flint will NOT kill it.\n` +
        `        Free the port, or start on another port: PORT=${opts.port + 1} npx flint-skills-hub`,
      );
    }
  }
  if (owner.kind !== 'none') {
    info(`Stopping ${owner.pids.length} process(es) on port ${opts.port} (PID:${owner.pids.join(',')})`);
    killPids(owner.pids, opts.port);
  }

  info(`Starting Flint on port ${opts.port} in the background ...`);
  const child = spawnDetached(opts.port);
  info('Waiting for the server to be ready ...');
  const result = await waitForChild(opts.port, child);

  const url = `http://localhost:${opts.port}`;
  if (result === 'exited') {
    fail(`The server process exited during startup. See the log: ${STARTUP_LOG}\n${tailLog()}`);
  }
  if (result === 'timeout') {
    warn(`Timed out waiting for ${url}. See the log: ${STARTUP_LOG}`);
  } else {
    info(`Web UI:  ${url}`);
  }
  maybeOpen(url, opts);

  info(`Process PID: ${child.pid}`);
  info(`Logs: startup=${STARTUP_LOG}  app=${APP_LOG}`);
  info(`Stop:  kill ${child.pid}`);
  info('Started. The CLI exits now; Flint keeps running in the background.');
}

/** 前台模式（--foreground）：同进程 listen，日志直出控制台，Ctrl+C 即停 */
async function startForeground(opts) {
  if (opts.restart) {
    const pids = findPidsOnPort(opts.port);
    if (pids.length === 0) info(`No process on port ${opts.port} — starting fresh`);
    else killPids(pids, opts.port);
  }
  await assertPortFree(opts.port);
  process.env.PORT = String(opts.port);

  // server 入口在模块顶层就 listen 了，import 即启动
  await import(pathToFileURL(SERVER_ENTRY).href);

  const url = `http://localhost:${opts.port}`;
  if (!(await waitReady(opts.port, 20000))) {
    warn(`Server did not respond within 20s — check the log at ${APP_LOG}`);
    return;
  }
  info(`Web UI:  ${url}`);
  maybeOpen(url, opts);
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

  assertNodeVersion();

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
    warn('Web UI build not found — only the API will be available.');
    warn(`        Expected: ${path.join(CLIENT_DIST, 'index.html')}`);
    warn('        Running from source? Build it first: npm run build');
  }

  console.log(BANNER);
  if (opts.foreground) await startForeground(opts);
  else await startBackground(opts);
}

// 顶层 await：.mjs 直接等待，失败时统一打印并退出（不再走 promise 链）
try {
  await main();
} catch (err) {
  console.error(`[error] ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
}
