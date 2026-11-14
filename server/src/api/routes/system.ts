import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express, { Router } from 'express';
import { ConfigStore } from '../../infra/config-store.js';
import { log } from '../../infra/logger.js';
import { pickDirectory, pickFile } from '../../infra/picker.js';
import {
  listAgents, agentSkillRows, agentOwnSkillRow, allAgentDefs, findAgentDef, resolveGlobalDir, effectiveAgentKey,
  setPrimary, pruneAliasStrategies, expandTilde,
} from '../../core/agents.js';
import { scanAll, detectLayoutAbs, scanDir, resolveLayout, invalidateScanCache } from '../../core/scanner.js';
import { previewRegister, idIssue, type RegisterPreviewInput } from '../../core/register.js';
import { cloneSourceRepo, gitUrlIssue } from '../../core/source-clone.js';
import { npxInstall, npxUpdate, npxPkgIssue, normalizeInstaller, parseArgs, parseNpxCommand } from '../../core/npx-install.js';
import { sseHead, sseSend, sseEnd, createLineEmitter, createProgressReporter } from '../sse.js';
import * as presets from '../../core/presets.js';
import * as active from '../../core/active.js';
import { syncActive, diffSync, deployOne, copySkill } from '../../core/sync.js';
import { collectCandidates } from '../../core/integrate.js';
import { addProject, syncProject, projectSkillRows, projectAddable, deployedAgents, pushProjectToRepo, takeoverProjectSkill, writeIndex, INDEX_NAME } from '../../core/projects.js';
import { readSkill } from '../../core/skill.js';
import { bodyText, firstHitContext, type BodyCache } from '../../core/skillindex.js';
import { detectStale, refreshSkill } from '../../core/source-update.js';
import { pullRepo, repoStatus } from '../../core/repo-sync.js';
import { importDirs, previewImportDirs } from '../../core/import.js';
import { previewCollect, collectAgentSkill, previewCollectSource, collectFromSource, projectCollectSource } from '../../core/collect.js';
import { migrateTagsToFrontmatter } from '../../core/repo-tags.js';
import { takeover } from '../../core/takeover.js';
import { applyFix } from '../../core/fix.js';
import { diagnose } from '../../core/diagnose.js';
import { cachedContentHealthMap, inspectSkill } from '../../core/content.js';
import { invalidateTextCache } from '../../core/text-cache.js';
import { mergeSkill } from '../../core/merge.js';
import { Repo, ForeignSource, CustomAgent, SyncMode } from '../../config/types.js';
import { agentCards, projectCards } from '../../domain/cards.js';
import { t } from '../../i18n/index.js';
import type { MsgKey } from '../../i18n/en.js';
import type { RouteCtx } from '../route-ctx.js';
import {
  SERVER_VERSION,
} from '../route-helpers.js';

export function mountSystemRoutes(r: Router, ctx: RouteCtx): void {
  const { cfg, library, touch, touchConfig, warehouses } = ctx;
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
