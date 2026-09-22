import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { ConfigStore } from './infra/config-store.js';
import { makeRouter } from './api/routes.js';
import { CONFIG_PATH } from './config/defaults.js';
import { CopyWatcher } from './core/watcher.js';
import { scanAll } from './core/scanner.js';
import { syncActive } from './core/sync.js';
import { log } from './infra/logger.js';
import { resolveLocale, withLocale } from './i18n/index.js';

const PORT = Number(process.env.PORT ?? 8787);
const app = express();
const cfg = new ConfigStore();

/**
 * 前端构建产物目录：生产 / npx 运行时页面的来源。
 * `server/src` 与 `server/dist` 都在 `server/` 下两层，`../../client/dist` 在开发态与发布态一致；
 * `FLINT_CLIENT_DIST` 可覆盖以适应非标准布局。找不到产物时返回 undefined，
 * 此时不挂载静态托管——开发态前端由 vite dev server（5173）负责，行为不变。
 */
function resolveClientDist(): string | undefined {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = process.env.FLINT_CLIENT_DIST
    ? [process.env.FLINT_CLIENT_DIST]
    : [path.resolve(here, '../../client/dist')];
  return candidates.find((dir) => fs.existsSync(path.join(dir, 'index.html')));
}

// Per-request locale (from Accept-Language), applied to every user-facing message.
// Out of band contexts (watcher / smoke) fall back to English, keeping logs English-only.
app.use((req, res, next) => {
  withLocale(resolveLocale(req.headers['accept-language']), () => next());
});

// 自动同步已停用（agent / 项目目录不再由 watcher / touch 触发部署）：
// 预设只作一次性「应用」，由 Agent/项目页显式触发（syncActive / POST 部署）。
// `resync` 保留给自动化任务按需调用（仅补齐、不删除，prune:false）。
function resync(reason: string = 'manual') {
  const lib = scanAll(cfg.data.repos, cfg.data.foreignSources);
  try {
    return syncActive(cfg, lib.skills, undefined, reason, { prune: false });
  } catch (e) {
    log.error('sync', `Sync error: ${(e as Error).message}`, { reason });
    return [];
  }
}
// 供自动化任务触发的句柄（可通过环境变量约定，或后续注册任务模块）
export { resync };

// watcher 的变更回调不再部署（复制模式的增量同步在本模型下不再自动运行）
const watcher = new CopyWatcher();
const onChange = () => {};

app.use('/api', makeRouter(cfg, {
  // 结构性变更后仅刷新，不触发部署（自动同步链停用）
  onChanged: () => { watcher.start(cfg, onChange); },
  onConfigChanged: () => watcher.start(cfg, onChange),
}));

// ---------- 静态托管前端构建产物（仅生产 / npx 运行；开发态跳过） ----------
const clientDist = resolveClientDist();
if (clientDist) {
  app.use(express.static(clientDist));
  // SPA 兜底：未命中的请求回 index.html，让前端 hash 路由自行处理；
  // /api 必须放过，否则接口 404 会被替换成 HTML，前端拿到的是「成功但内容不对」。
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

// 兜底错误处理：express 4 只捕获同步 throw，异步错误仍需各路由 try/catch
app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const message = err instanceof Error ? err.message : String(err);
  log.error('http', 'Unhandled request error', { message });
  res.status(500).json({ error: message });
});

// 启动时也需判断开关，默认关闭
watcher.start(cfg, onChange);

const server = app.listen(PORT, () => {
  log.info('server', 'Server started', {
    port: PORT,
    config: CONFIG_PATH,
    client: clientDist ?? 'none (api only)',
    node: process.version,
    platform: `${process.platform}/${process.arch}`,
    env: process.env.NODE_ENV ?? 'development',
  });
  console.log(`[flint] server  http://localhost:${PORT}`);
  console.log(`[flint] config  ${CONFIG_PATH}`);
  console.log(`[flint] logs    ${log.getPath()}`);
  if (!clientDist) {
    console.log('[flint] client  not built — Web UI is served by the vite dev server on 5173');
  }
});

// 端口被占用：给一句能直接照做的提示后退出，不要甩 EADDRINUSE 原始堆栈（npx 用户看不懂）
server.on('error', (e: NodeJS.ErrnoException) => {
  if (e.code === 'EADDRINUSE') {
    log.error('server', `Port ${PORT} is already in use`, { port: PORT });
    console.error(`[flint] port ${PORT} is already in use. Free it, or pick another one: PORT=8788 npx flint-skills-hub`);
    process.exit(1);
  }
  throw e;
});
