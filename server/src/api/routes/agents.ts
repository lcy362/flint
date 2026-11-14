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
  removeSkillEntry, applyDirOverrides, applyAgentStrategy,
} from '../route-helpers.js';

export function mountAgentRoutes(r: Router, ctx: RouteCtx): void {
  const { cfg, library, touch, touchConfig, warehouses } = ctx;
  // ---- custom agents（AG-03） ----
  r.get('/agents/custom', (_req, res) => res.json(cfg.data.customAgents));
  r.post('/agents/custom', (req, res) => {
    const body = req.body as CustomAgent;
    if (!body?.key || !body?.name || !body?.globalDir) {
      return res.status(400).json({ error: 'key/name/globalDir required' });
    }
    if (cfg.data.customAgents.some((a) => a.key === body.key) || listAgents(cfg.data).some((a) => a.key === body.key)) {
      return res.status(409).json({ error: t('api.agentExists', { key: body.key }) });
    }
    cfg.data.customAgents.push({
      key: body.key,
      name: body.name,
      globalDir: body.globalDir,
      projectDir: body.projectDir || undefined,
      recursive: body.recursive === true,
    });
    cfg.save();
    res.json(cfg.data.customAgents);
  });
  r.delete('/agents/custom/:key', (req, res) => {
    cfg.data.customAgents = cfg.data.customAgents.filter((a) => a.key !== req.params.key);
    delete cfg.data.agents[req.params.key];
    cfg.data.activeAgents = cfg.data.activeAgents.filter((k) => k !== req.params.key);
    cfg.save();
    touch();
    res.json(cfg.data.customAgents);
  });

  // ---- agents / active ----
  r.get('/agents', (_req, res) => res.json(listAgents(cfg.data)));
  r.put('/agents/:key', (req, res) => {
    const key = req.params.key;
    if (!findAgentDef(cfg.data, key)) return res.status(404).json({ error: 'unknown agent' });
    const body = (req.body ?? {}) as Record<string, unknown>;

    // 1) 指定 / 取消主 Agent（AG-02）：这是「组的归属」而非该 Agent 的策略，
    //    写在自己身上并清掉同目录其它成员的指定，保证一个目录至多一个主 Agent。
    if (body.primary !== undefined) setPrimary(cfg.data, key, body.primary === true);

    // 2) 目录覆盖属于 Agent 自身：它决定「这个 Agent 解析到哪个目录」
    applyDirOverrides(cfg, key, body.globalDir, body.projectDir);

    // 3) 分发策略落到该目录的主 Agent（主 Agent 可能刚被 1) 改变，故在 helper 内重新解析）
    const target = applyAgentStrategy(cfg, key, body);
    cfg.save();
    res.json(cfg.data.agents[target] ?? {});
  });
  r.get('/agents/:key/skills', (req, res) => {
    const key = req.params.key;
    const lib = library();
    const rows = agentSkillRows(key, cfg.data, lib.skills);
    const present = new Set(rows.filter((x) => x.present).map((x) => x.name));
    // 「可添加」= 技能库里尚未出现在该目录的实际行（物理为准，不看期望集）
    const seenAddable = new Set<string>();
    const addable = lib.skills
      .filter((s) => !present.has(s.name))
      .map((s) => ({ id: s.id, name: s.name, repo: s.source }))
      .filter((a) => {
        if (seenAddable.has(a.name)) return false;
        seenAddable.add(a.name);
        return true;
      });
    res.json({ skills: agentCards(rows), addable, active: cfg.data.activeAgents.includes(key) });
  });
  // 「添加」：把单个技能部署进该 agent 目录（软链/复制，遵循其同步策略），不写 config（物理即真相）
  r.post('/agents/:key/skills', (req, res) => {
    const key = req.params.key;
    if (!findAgentDef(cfg.data, key)) return res.status(404).json({ error: 'unknown agent' });
    const { id } = req.body ?? {};
    if (!id || typeof id !== 'string') return res.status(400).json({ error: 'id (name@source) required' });
    const lib = library();
    const result = deployOne(cfg, key, id, lib.skills, { prune: false });
    log.info('http', 'Agent skill added', {
      agent: key, skill: String(id),
      created: result.created.length, failed: result.failed.map((f) => f.skill),
    });
    res.json(result);
  });
  r.post('/agents/:key/sync', (req, res) => {
    const key = req.params.key;
    // 用户显式点「同步（应用预设）」：以该 agent 绑定预设为一次性部署并允许回收多余软链
    const r_ = syncActive(cfg, library().skills, [key], 'route:agent-sync', { prune: true });
    res.json(r_[0] ?? { agent: key, created: [], removed: [], failed: [] });
  });
  // 「删除」：把这条技能从该 agent 目录移除。软链只解除链接（目标本体不动），真实目录 / 文件直接删
  r.delete('/agents/:key/skills/:skillName', (req, res) => {
    const key = req.params.key;
    const name = req.params.skillName;
    const def = findAgentDef(cfg.data, key);
    if (!def) return res.status(404).json({ error: 'unknown agent' });
    const dir = resolveGlobalDir(def, cfg.data.agents[key]?.globalDir);
    const target = path.join(dir, name);
    let st;
    try { st = fs.lstatSync(target, { throwIfNoEntry: false }); } catch { st = undefined; }
    if (!st) return res.status(404).json({ error: 'skill not found' });
    removeSkillEntry(target, st);
    log.info('http', 'Agent skill removed', { agent: key, skill: name, kind: st.isSymbolicLink() ? 'link' : 'real' });
    res.json({ ok: true, removed: name });
  });
  // 「这条技能分发到哪些目录了？」——一次问遍所有 Agent 自身目录的只读总览。
  // 技能详情「分发到智能体」弹窗要用它反查已分发清单：若改成逐个目录调 /agents/:key/skills，
  // 每个请求都会整体扫一遍技能库（N 个目录 = N 次全量扫描），纯属浪费；
  // 判定只看各目录里有没有这个同名技能，不扫仓库、也不算「可添加」。
  r.get('/skills/:name/agents', (req, res) => {
    const name = req.params.name;
    res.json({
      agents: allAgentDefs(cfg.data).map((def) => {
        const row = agentOwnSkillRow(def.key, cfg.data, name);
        return { key: def.key, present: !!row, reason: row?.reason };
      }),
    });
  });
  // 活跃 Agent 集合（AA-01 / AA-04）
  r.get('/activeAgents', (_req, res) => res.json(cfg.data.activeAgents));
  r.put('/activeAgents', (req, res) => {
    const keys = Array.isArray(req.body) ? req.body : req.body?.agents;
    const out = active.set(cfg, keys ?? []);
    touch();
    log.info('http', 'Active agent set updated', { agents: out.length });
    res.json(out);
  });

  // ---- presets ----
  r.get('/presets', (_req, res) => res.json(cfg.data.presets));
  r.post('/presets', (req, res) => {
    try {
      const name = String(req.body?.name ?? '').trim();
      if (!name) return res.status(400).json({ error: 'name required' });
      const p = presets.create(cfg, name);
      // 兼容前端一次传入 skills/tags
      if (Array.isArray(req.body?.skills)) p.skills = req.body.skills;
      if (Array.isArray(req.body?.tags)) p.tags = req.body.tags;
      cfg.save();
      touch();
      log.info('http', 'Preset created', { name, skills: p.skills.length, tags: p.tags.length });
      res.json(p);
    } catch (e) {
      log.error('http', `Preset creation failed: ${(e as Error).message}`, { name: String(req.body?.name ?? '') });
      res.status(400).json({ error: (e as Error).message });
    }
  });
  // 编辑预设：保存配置即可，**不再触发自动同步**——预设只作一次性「应用」，由 Agent/项目页显式触发。
  r.put('/presets/:name', (req, res) => {
    try {
      const p = presets.update(cfg, req.params.name, req.body ?? {});
      log.info('http', 'Preset updated', { name: req.params.name, skills: p.skills.length, tags: p.tags.length });
      res.json(p);
    } catch (e) {
      log.error('http', `Preset update failed: ${(e as Error).message}`, { name: req.params.name });
      res.status(400).json({ error: (e as Error).message });
    }
  });
  r.delete('/presets/:name', (req, res) => {
    presets.remove(cfg, req.params.name);
    touch();
    log.info('http', 'Preset deleted', { name: req.params.name });
    res.json({ ok: true });
  });

}
