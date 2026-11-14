import express, { Router } from 'express';
import { ConfigStore } from '../infra/config-store.js';
import { log } from '../infra/logger.js';
import { scanAll, invalidateScanCache } from '../core/scanner.js';
import { invalidateTextCache } from '../core/text-cache.js';
import type { RouteCtx } from './route-ctx.js';
import { mountLibraryRoutes } from './routes/library.js';
import { mountAgentRoutes } from './routes/agents.js';
import { mountProjectRoutes } from './routes/projects.js';
import { mountSystemRoutes } from './routes/system.js';

export function makeRouter(cfg: ConfigStore, opts?: { onChanged?: () => void; onConfigChanged?: () => void }): Router {
  const r = Router();
  r.use(express.json({ limit: '2mb' }));

  // 请求日志：记录 method、path、status、耗时与 body 字段名（不记值，避免敏感信息落盘）
  r.use((req, res, next) => {
    if (req.path.startsWith('/logs')) return next();
    const started = Date.now();
    res.on('finish', () => {
      const body = req.body as unknown;
      const bodyKeys = body && typeof body === 'object'
        ? Object.keys(body as Record<string, unknown>)
        : undefined;
      log.info('http', `${req.method} ${req.originalUrl.split('?')[0]}`, {
        status: res.statusCode,
        ms: Date.now() - started,
        ...(bodyKeys?.length ? { bodyKeys } : {}),
      });
    });
    next();
  });

  const ctx: RouteCtx = {
    cfg,
    library: () => scanAll(cfg.data.repos, cfg.data.foreignSources),
    touch: () => {
      invalidateScanCache();
      invalidateTextCache();
      opts?.onChanged?.();
    },
    touchConfig: () => opts?.onConfigChanged?.(),
    warehouses: () => ({ repos: cfg.data.repos, sources: cfg.data.foreignSources }),
  };

  mountLibraryRoutes(r, ctx);
  mountAgentRoutes(r, ctx);
  mountProjectRoutes(r, ctx);
  mountSystemRoutes(r, ctx);
  return r;
}
