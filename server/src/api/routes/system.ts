import fs from 'node:fs';
import { Router } from 'express';
import { log } from '../../infra/logger.js';
import { pickDirectory, pickFile } from '../../infra/picker.js';
import { syncActive, diffSync } from '../../core/sync.js';
import { applyFix } from '../../core/fix.js';
import type { RouteCtx } from '../route-ctx.js';
import {
  SERVER_VERSION,
} from '../route-helpers.js';

export function mountSystemRoutes(r: Router, ctx: RouteCtx): void {
  const { cfg, library, touch, touchConfig } = ctx;
  // ---- 全局设置（UI-03 设置） ----
  r.get('/settings', (_req, res) => {
    res.json({ defaultSync: cfg.data.defaultSync });
  });
  r.put('/settings', (req, res) => {
    const body = req.body ?? {};
    if (body.defaultSync === 'symlink' || body.defaultSync === 'copy') cfg.data.defaultSync = body.defaultSync;
    cfg.save();
    touchConfig();
    res.json({ defaultSync: cfg.data.defaultSync });
  });

  // ---- filesystem ----
  // 调起系统原生选择器；path 为 null 表示用户取消。
  // 选择器会阻塞最多 120s，故使用异步 exec 避免占满事件循环。
  r.post('/filesystem/pick', async (_req, res) => {
    try { res.json({ path: await pickDirectory() }); }
    catch (e) { res.status(500).json({ error: (e as Error).message }); }
  });
  r.post('/filesystem/pick-file', async (_req, res) => {
    try { res.json({ path: await pickFile() }); }
    catch (e) { res.status(500).json({ error: (e as Error).message }); }
  });

  // 就地修复：按 diagnose 项 key 分发（Health 视图调用）
  r.post('/fix', (req, res) => {
    const { key } = req.body ?? {};
    if (!key) return res.status(400).json({ error: 'key required' });
    try {
      const lib = library();
      const result = applyFix(cfg, { lib }, String(key));
      touch();
      log.info('http', 'Diagnostic item fixed in place', { key: String(key) });
      res.json(result);
    } catch (e) {
      log.error('http', `Diagnostic fix failed: ${(e as Error).message}`, { key: String(key) });
      res.status(500).json({ error: (e as Error).message });
    }
  });

  // ---- sync ----
  r.get('/sync/status', (_req, res) => {
    const lib = library();
    res.json(diffSync(cfg, lib.skills));
  });
  r.post('/sync', (req, res) => {
    try {
      const lib = library();
      const only = Array.isArray(req.body?.agents) ? req.body.agents : undefined;
      // 用户显式触发的同步：允许回收本工具多部署的软链
      const results = syncActive(cfg, lib.skills, only, 'route:manual', { prune: true });
      const created = results.reduce((n, r) => n + r.created.length, 0);
      const removed = results.reduce((n, r) => n + r.removed.length, 0);
      log.info('http', 'Manual sync', { agents: results.length, created, removed });
      res.json(results);
    } catch (e) {
      log.error('http', `Manual sync failed: ${(e as Error).message}`);
      res.status(500).json({ error: (e as Error).message });
    }
  });

  // ---- logs（开源后用户复制/下载上报问题） ----
  r.get('/logs', (req, res) => {
    const tail = Math.max(1, Math.min(Number(req.query.tail) || 200, 1000));
    const logPath = log.getPath();
    let lines: string[] = [];
    let size = 0;
    try {
      if (fs.existsSync(logPath)) {
        size = fs.statSync(logPath).size;
        lines = fs.readFileSync(logPath, 'utf-8').split('\n').filter(Boolean).slice(-tail);
      }
    } catch (e) {
      log.error('http', `Failed to read log file: ${(e as Error).message}`);
      return res.status(500).json({ error: (e as Error).message });
    }
    res.json({ path: logPath, size, lines, version: SERVER_VERSION });
  });
  r.get('/logs/download', (_req, res) => {
    const logPath = log.getPath();
    if (!fs.existsSync(logPath)) return res.status(404).json({ error: 'no log file' });
    res.download(logPath, 'flint.log');
  });
}
