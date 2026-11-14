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
import { removeSkillEntry } from '../route-helpers.js';

export function mountProjectRoutes(r: Router, ctx: RouteCtx): void {
  const { cfg, library, touch, touchConfig, warehouses } = ctx;
  // ---- projects (项目级 skill) ----
  r.get('/projects', (_req, res) => {
    res.json(cfg.data.projects.map((p, i) => ({ ...p, id: i, agents: deployedAgents(cfg, p.path), hasAgents: fs.existsSync(path.join(p.path, '.agents', 'skills')) })));
  });
  r.post('/projects', (req, res) => {
    try {
      const p = addProject(cfg, String(req.body?.path), Array.isArray(req.body?.tags) ? req.body.tags : []);
      const wanted = Array.isArray(req.body?.agents) ? new Set<string>(req.body.agents as string[]) : undefined;
      syncProject(cfg, p, library().skills, wanted);
      res.json(cfg.data.projects);
    } catch (e) { res.status(400).json({ error: (e as Error).message }); }
  });
  r.put('/projects/:id/tags', (req, res) => {
    const id = Number(req.params.id);
    const proj = cfg.data.projects[id];
    if (!proj) return res.status(404).json({ error: 'project not found' });
    if (Array.isArray(req.body?.tags)) proj.tags = req.body.tags;
    cfg.save();
    const syncResult = syncProject(cfg, proj.path, library().skills);
    res.json({ ...proj, agents: deployedAgents(cfg, proj.path), sync: syncResult });
  });
  r.put('/projects/:id/agents', (req, res) => {
    const id = Number(req.params.id);
    const proj = cfg.data.projects[id];
    if (!proj) return res.status(404).json({ error: 'project not found' });
    const syncResult = syncProject(cfg, proj.path, library().skills, new Set<string>(Array.isArray(req.body?.agents) ? req.body.agents : []));
    res.json({ ...proj, agents: deployedAgents(cfg, proj.path), sync: syncResult });
  });
  // 回写仓库（PJ-05）
  r.post('/projects/:id/push', (req, res) => {
    const id = Number(req.params.id);
    const proj = cfg.data.projects[id];
    if (!proj) return res.status(404).json({ error: 'project not found' });
    const { repoId, names } = req.body ?? {};
    try {
      const result = pushProjectToRepo(cfg, proj.path, repoId ? String(repoId) : undefined, Array.isArray(names) ? names : undefined);
      log.info('http', 'Project skills pushed back to repository', { repo: repoId ? String(repoId) : undefined, names: Array.isArray(names) ? names.length : undefined });
      res.json(result);
    } catch (e) {
      log.error('http', `Project push-back failed: ${(e as Error).message}`, { proj: proj.path });
      res.status(500).json({ error: (e as Error).message });
    }
  });
  r.get('/projects/:id/skills', (req, res) => {
    const id = Number(req.params.id);
    const proj = cfg.data.projects[id];
    if (!proj) return res.status(404).json({ error: 'project not found' });
    const lib = library();
    res.json({ skills: projectCards(projectSkillRows(cfg, proj, lib.skills)), addable: projectAddable(cfg, proj, lib.skills) });
  });
  // 项目技能：物理为准（期望集已停用）。GET 只读实际目录；PUT 仅刷新（原 on/off 分支已删除）；
  // 「添加」POST 部署一份副本；「删除」移除本工具部署的副本（真实目录），绝不删软链/接管项之外的东西。
  r.put('/projects/:id/skills', (req, res) => {
    const id = Number(req.params.id);
    const proj = cfg.data.projects[id];
    if (!proj) return res.status(404).json({ error: 'project not found' });
    // 显式开关/期望集已取消：PUT 仅返回当前物理列表，供前端刷新
    const lib = library();
    const rows = projectSkillRows(cfg, proj, lib.skills);
    res.json({ skills: projectCards(rows), addable: projectAddable(cfg, proj, lib.skills) });
  });
  // 「添加」：把单个技能以**副本**形式部署进项目 .agents/skills，并登记进 INDEX.md（物理为准）
  r.post('/projects/:id/skills', (req, res) => {
    const id = Number(req.params.id);
    const proj = cfg.data.projects[id];
    if (!proj) return res.status(404).json({ error: 'project not found' });
    const { id: skillId } = req.body ?? {};
    if (!skillId || typeof skillId !== 'string') return res.status(400).json({ error: 'id (name@source) required' });
    const lib = library();
    const skill = lib.skills.find((s) => s.id === skillId);
    if (!skill) return res.status(400).json({ error: t('merge.skillNotFound', { name: skillId }) });
    const agentsRoot = path.join(proj.path, '.agents', 'skills');
    fs.mkdirSync(agentsRoot, { recursive: true });
    const dest = path.join(agentsRoot, skill.name);
    const st = fs.lstatSync(dest, { throwIfNoEntry: false });
    // 软链（已被接管）不重复落副本；真实目录视为已落地（幂等）
    if (st?.isSymbolicLink() && fs.existsSync(dest)) return res.status(409).json({ error: t('sync.externalLink', { dir: dest }) });
    copySkill(dest, skill.dir);
    // 登记进 INDEX.md，使该副本可被本工具识别为「曾投放」的内容（供未来安全回收）
    const managed = fs.readdirSync(agentsRoot, { withFileTypes: true })
      .filter((e) => e.isDirectory() && !e.isSymbolicLink() && e.name !== INDEX_NAME)
      .map((e) => ({ name: e.name, title: e.name, description: readSkill(path.join(agentsRoot, e.name))?.description }));
    writeIndex(agentsRoot, managed);
    log.info('http', 'Project skill added (copy)', { project: proj.path, name: String(skillId) });
    res.json({ ok: true, copied: skill.name });
  });
  // 「删除」：把这条技能从项目 .agents/skills 移除（软链只解除链接、真实副本直接删）
  r.delete('/projects/:id/skills/:name', (req, res) => {
    const id = Number(req.params.id);
    const proj = cfg.data.projects[id];
    if (!proj) return res.status(404).json({ error: 'project not found' });
    const name = req.params.name;
    const target = path.join(proj.path, '.agents', 'skills', name);
    const st = fs.lstatSync(target, { throwIfNoEntry: false });
    if (!st) return res.status(404).json({ error: 'skill not found' });
    removeSkillEntry(target, st);
    log.info('http', 'Project skill removed', { project: id, name, kind: st.isSymbolicLink() ? 'link' : 'real' });
    res.json({ ok: true, removed: name });
  });

  // 项目「自带」技能的归集 / 接管：与 Agent 目录共用同一套核心逻辑（collect.ts / takeover.ts），
  // 因此用户看到的流程与 Agent 页完全一致（选仓库 → 预览 → 可选「同时接管」）。
  r.get('/projects/:id/collect/preview', (req, res) => {
    const id = Number(req.params.id);
    const proj = cfg.data.projects[id];
    if (!proj) return res.status(404).json({ error: 'project not found' });
    const repo = cfg.data.repos.find((x) => x.id === String(req.query.repo ?? ''));
    if (!repo) return res.status(400).json({ error: 'repo required' });
    const source = projectCollectSource(proj.path, id);
    // 复用 AgentCollectPreview 形状（agentKey 用 sourceRef 填充），前端共用同一个归集弹窗
    res.json({
      sourceRef: source.ref,
      agentKey: source.ref,
      agentName: proj.path,
      installedDir: source.dir,
      items: previewCollectSource(repo, source),
    });
  });
  r.post('/projects/:id/collect', (req, res) => {
    const id = Number(req.params.id);
    const proj = cfg.data.projects[id];
    if (!proj) return res.status(404).json({ error: 'project not found' });
    const { repoId, name, names, replaceNames } = req.body ?? {};
    const repo = cfg.data.repos.find((x) => x.id === String(repoId ?? '')) ?? cfg.data.repos[0];
    if (!repo) return res.status(400).json({ error: t('api.noRepoToCollect') });
    const wantedNames = Array.isArray(names) ? names.map(String) : undefined;
    const want = name ? [String(name)] : wantedNames;
    try {
      const result = collectFromSource(
        cfg, repo, projectCollectSource(proj.path, id), want,
        Array.isArray(replaceNames) ? replaceNames.map(String) : undefined,
      );
      touch();
      log.info('http', 'Project skills collected into repository', { project: proj.path, repo: repo.id, collected: result.collected.length, skipped: result.skipped.length });
      res.json(result);
    } catch (e) {
      log.error('http', `Project skill collection failed: ${(e as Error).message}`, { proj: proj.path });
      res.status(500).json({ error: (e as Error).message });
    }
  });
  // 项目技能「接管」：与 Agent 接管刻意不同 —— 项目里落**真实副本**而非软链。
  // 语义 = 用仓库那一版替换项目里的这条 + 登记为项目受管技能（.agents/skills 要提交 git，
  // 放绝对软链会让队友断链；细则见 takeoverProjectSkill 的注释）。
  r.post('/projects/:id/takeover', (req, res) => {
    const id = Number(req.params.id);
    const proj = cfg.data.projects[id];
    if (!proj) return res.status(404).json({ error: 'project not found' });
    const { name, repoId, confirm } = req.body ?? {};
    if (!name) return res.status(400).json({ error: 'name required' });
    try {
      const result = takeoverProjectSkill(cfg, proj, repoId ? String(repoId) : undefined, String(name), confirm === true);
      log.info('http', 'Project skill taken over (copy)', {
        project: proj.path, name: String(name), repo: repoId ? String(repoId) : undefined, taken: result.taken,
      });
      res.json(result);
    } catch (e) {
      log.error('http', `Project skill takeover failed: ${(e as Error).message}`, { proj: proj.path });
      res.status(500).json({ error: (e as Error).message });
    }
  });
  r.post('/projects/:id/sync', (req, res) => {
    const id = Number(req.params.id);
    const proj = cfg.data.projects[id];
    if (!proj) return res.status(404).json({ error: 'project not found' });
    const lib = library();
    const result = syncProject(cfg, proj.path, lib.skills);
    cfg.save();
    res.json(result);
  });
}
