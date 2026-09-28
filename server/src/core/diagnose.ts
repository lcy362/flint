import fs from 'node:fs';
import path from 'node:path';
import { ConfigStore } from '../config/store.js';
import { listAgents, expandTilde, repoSkillRoot } from './agents.js';
import { diffSync } from './sync.js';
import { Skill, hasSkill } from './skill.js';
import { Candidate } from './integrate.js';
import { CONFIG_PATH } from '../config/defaults.js';
import { log } from '../infra/logger.js';
import { t } from '../i18n/index.js';

export type DiagStatus = 'ok' | 'warn' | 'error';

export type DiagDimension =
  | 'sync' | 'dup' | 'durability'
  | 'config' | 'repo' | 'project';

export interface DiagItem {
  key: string;
  status: DiagStatus;
  message: string;
  /** 机器可读附加负载：供前端「修复/同步」按钮使用（如 sync 的 SyncDiff） */
  detail?: unknown;
}

export interface DiagGroups {
  sync: DiagItem[];
  dup: DiagItem[];
  durability: DiagItem[];
  config: DiagItem[];
  repo: DiagItem[];
  project: DiagItem[];
}

export interface DiagSummary { total: number; ok: number; warn: number; error: number }

export interface DiagnoseResult {
  config: string;
  summary: Record<DiagDimension, DiagSummary>;
  groups: DiagGroups;
  items: DiagItem[];
}

interface Deps {
  lib: { skills: Skill[] };
  candidates: Candidate[];
  desired: Map<string, Skill>;
}

const DIMS: DiagDimension[] = ['sync', 'dup', 'durability', 'config', 'repo', 'project'];

/**
 * 找出自有仓库里「落在分类子目录、因而不会被识别」的技能名。
 *
 * 自有仓库恒为扁平：只有技能根的**直接**子目录才算技能。这里沿目录树走一遍，
 * 把更深层带 SKILL.md 的目录名收集起来交给诊断提示——目的是不让用户面对
 * 「技能莫名少了」而毫无线索。深度限制 3 层，避免挂进大目录时翻整棵树。
 */
function misplacedSkillsInRepo(skillsRoot: string): string[] {
  if (!fs.existsSync(skillsRoot)) return [];
  const found: string[] = [];
  walkSkills(skillsRoot, 0, found);
  return found;
}

/** 深度优先走一遍目录树，把「落在分类子目录」的技能名收集起来（技能目录本身不再下探） */
function walkSkills(dir: string, depth: number, found: string[]): void {
  for (const name of readSubDirNames(dir)) {
    const child = path.join(dir, name);
    if (hasSkill(child)) {
      if (depth > 0) found.push(name); // 第 1 层之上才算「放错位置」
      continue;
    }
    if (depth < 3) walkSkills(child, depth + 1, found);
  }
}

/** 列出目录下的真实子目录名（跳过隐藏项、失效软链与非目录） */
function readSubDirNames(dir: string): string[] {
  let entries: fs.Dirent[];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return []; }
  const out: string[] = [];
  for (const e of entries) {
    if (e.name.startsWith('.')) continue;
    const child = path.join(dir, e.name);
    try {
      if (e.isSymbolicLink() && !fs.existsSync(child)) continue; // 失效软链
      if (fs.statSync(child).isDirectory()) out.push(e.name);
    } catch { continue; }
  }
  return out;
}

/**
 * 纯只读体检，覆盖 6 维度：sync / dup / durability / config / repo / project。
 *
 * 不含「Agent」维度：Agent 侧没有能独立成立的健康问题——
 * 已登记 Agent 只是「登记了什么」的罗列，不是问题；
 * 「活跃但目录未安装」会由 deployAgent 自动 mkdir 补齐（任何结构性变更都会重跑全部活跃 Agent），
 * 且已由 sync 维度逐个比对报为「缺 N」并能就地修复；
 * 「主 Agent 指定失效」则由 dirMembers 按目录过滤成员兜住，不会真的坏。
 * 因此不再单列一个只会产出 OK 的分组。
 */
export function diagnose(cfg: ConfigStore, deps: Deps): DiagnoseResult {
  const groups: DiagGroups = { sync: [], dup: [], durability: [], config: [], repo: [], project: [] };

  checkConfig(groups);
  checkRepos(cfg, groups);
  checkProjects(cfg, groups);
  checkSync(cfg, deps, groups);
  checkDurability(cfg, groups);
  checkDup(deps, groups);

  // ---- 扁平化 ----
  const items: DiagItem[] = [];
  for (const d of DIMS) for (const it of groups[d]) items.push(it);

  const summary = summarize(groups);
  log.info('diagnose', 'Diagnostics finished', summary);
  return { config: CONFIG_PATH, summary, groups, items };
}

/** 各维度的 ok / warn / error 计数 */
function summarize(groups: DiagGroups): Record<DiagDimension, DiagSummary> {
  const summary = {} as Record<DiagDimension, DiagSummary>;
  for (const d of DIMS) {
    const arr = groups[d];
    summary[d] = {
      total: arr.length,
      ok: arr.filter((x) => x.status === 'ok').length,
      warn: arr.filter((x) => x.status === 'warn').length,
      error: arr.filter((x) => x.status === 'error').length,
    };
  }
  return summary;
}

/** config 维度：配置文件是否存在 */
function checkConfig(groups: DiagGroups): void {
  if (fs.existsSync(CONFIG_PATH)) groups.config.push({ key: 'config', status: 'ok', message: t('diag.configOk', { path: CONFIG_PATH }) });
  else groups.config.push({ key: 'config', status: 'warn', message: t('diag.configMissing') });
}

/** repo 维度：仓库与第三方来源的存在性，以及自有仓库里「放错层级」的技能 */
function checkRepos(cfg: ConfigStore, groups: DiagGroups): void {
  if (cfg.data.repos.length === 0) groups.repo.push({ key: 'repos', status: 'warn', message: t('diag.noRepos') });
  for (const r of cfg.data.repos) {
    const home = expandTilde(r.path);
    if (!fs.existsSync(home)) {
      groups.repo.push({ key: `repo:${r.id}`, status: 'error', message: t('diag.repoMissing', { id: r.id, path: home }) });
      continue;
    }
    const p = repoSkillRoot(r);
    groups.repo.push({ key: `repo:${r.id}`, status: fs.existsSync(p) ? 'ok' : 'error', message: t('diag.repoOk', { id: r.id, path: p }) });

    // 自有仓库恒扁平：落在分类子目录里的技能不会被识别。必须显式报出，
    // 否则用户只会看到「技能少了」却找不到原因（这正是多布局时代静默丢弃的老毛病）。
    const misplaced = misplacedSkillsInRepo(p);
    if (misplaced.length > 0) {
      groups.repo.push({
        key: `repo:${r.id}:nested`,
        status: 'warn',
        message: t('diag.repoNestedSkills', {
          id: r.id,
          n: misplaced.length,
          names: misplaced.slice(0, 5).join(', '),
        }),
        detail: { names: misplaced },
      });
    }
  }
  for (const f of cfg.data.foreignSources) {
    const home = expandTilde(f.path);
    groups.repo.push({ key: `fsrc:${f.id}`, status: fs.existsSync(home) ? 'ok' : 'error', message: t('diag.fsrc', { id: f.id, path: home }) });
  }
}

/** project 维度：项目目录与 .agents/skills 是否存在 */
function checkProjects(cfg: ConfigStore, groups: DiagGroups): void {
  if (cfg.data.projects.length === 0) groups.project.push({ key: 'projects', status: 'ok', message: t('diag.noProjects') });
  for (const p of cfg.data.projects) {
    const home = expandTilde(p.path);
    if (!fs.existsSync(home)) {
      groups.project.push({ key: `project:${home}`, status: 'error', message: t('diag.projectMissing', { path: home }) });
      continue;
    }
    const ag = path.join(home, '.agents', 'skills');
    groups.project.push({ key: `project:${home}`, status: fs.existsSync(ag) ? 'ok' : 'warn', message: t('diag.projectNoAgents', { path: home }) });
  }
}

/** sync 维度：只读比对每个目录的实际投放情况 */
function checkSync(cfg: ConfigStore, deps: Deps, groups: DiagGroups): void {
  const diffs = diffSync(cfg, deps.lib.skills);
  for (const d of diffs) {
    const parts: string[] = [];
    if (d.missing.length) parts.push(t('diag.syncMissing', { n: d.missing.length }));
    if (d.extra.length) parts.push(t('diag.syncExtra', { n: d.extra.length }));
    if (d.brokenLink.length) parts.push(t('diag.syncBroken', { n: d.brokenLink.length }));
    const bad = parts.length > 0;
    groups.sync.push({
      key: `sync:${d.agent}`,
      status: bad ? 'warn' : 'ok',
      message: bad
        ? t('diag.syncBad', { agent: d.agent, n: d.desiredNames.length, parts: parts.join(' / ') })
        : t('diag.syncOk', { agent: d.agent, n: d.desiredNames.length }),
      detail: d,
    });
  }
  if (diffs.length === 0) groups.sync.push({ key: 'sync:none', status: 'ok', message: t('diag.syncNone') });
}

/**
 * durability 维度：活跃 Agent 目录里的失效软链。
 * 同目录的 Agent 共用一个目录，按目录去重，避免同一个失效软链报多次。
 */
function checkDurability(cfg: ConfigStore, groups: DiagGroups): void {
  const active = new Set(cfg.data.activeAgents);
  const scannedDirs = new Set<string>();
  let hasBroken = false;
  for (const a of listAgents(cfg.data)) {
    if (!a.installed || !active.has(a.key)) continue;
    if (!fs.existsSync(a.globalDir) || scannedDirs.has(a.globalDir)) continue;
    scannedDirs.add(a.globalDir);
    for (const ent of fs.readdirSync(a.globalDir)) {
      const p = path.join(a.globalDir, ent);
      let lstat: fs.Stats;
      try { lstat = fs.lstatSync(p); } catch { continue; }
      if (lstat.isSymbolicLink() && !fs.existsSync(p)) {
        hasBroken = true;
        groups.durability.push({ key: `broken:${ent}`, status: 'warn', message: t('diag.brokenFound', { agent: a.name, name: ent }) });
      }
    }
  }
  if (!hasBroken) groups.durability.push({ key: 'broken', status: 'ok', message: t('diag.noBroken') });
}

/** dup 维度：同名多来源汇总（完整交互交前端收编面板） */
function checkDup(deps: Deps, groups: DiagGroups): void {
  const byName = new Map<string, Candidate[]>();
  for (const c of deps.candidates) {
    const arr = byName.get(c.name) ?? [];
    arr.push(c);
    byName.set(c.name, arr);
  }
  for (const [name, arr] of byName) {
    if (arr.length > 1) groups.dup.push({ key: `dup:${name}`, status: 'warn', message: t('diag.dupFound', { name, n: arr.length }), detail: arr });
  }
  if (groups.dup.length === 0) groups.dup.push({ key: 'dup', status: 'ok', message: t('diag.noDup') });
}