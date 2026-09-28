import fs from 'node:fs';
import path from 'node:path';
import { ConfigStore } from '../config/store.js';
import { Skill } from './skill.js';
import { effectiveTags } from './tags.js';
import { findAgentDef, resolveGlobalDir, expandTilde, isManagedLinkTarget, effectiveAgentKey } from './agents.js';
import { log } from '../infra/logger.js';
import { t } from '../i18n/index.js';

export interface SyncResult {
  agent: string;
  created: string[];
  removed: string[];
  failed: { skill: string; reason: string }[];
  /** 非致命提示：如 Windows 软链无权限时自动降级为复制（NFR-02） */
  warnings?: string[];
}

/** 名字归一化：把 id(name@来源) 或纯名字映射为最终的技能名（目录名） */
function nameOf(id: string): string {
  const at = id.lastIndexOf('@');
  return at >= 0 ? id.slice(0, at) : id;
}

/**
 * 某 agent「一次性应用预设」应部署的 skill 集 = 其绑定预设的成员 ∪ 该预设关联标签命中的 skill。
 * 纯由 config 的 `preset` 绑定推导：预设置是一次性「应用」，不随来源 / 标签变更自动补回。
 * 别名沿用主 Agent 的策略（目录只有一份，应用预设只落一份实体）。
 * 未绑定预设时返回空集（不部署任何东西）。
 */
export function presetSkillSet(cfg: ConfigStore, allSkills: Skill[], agentKey: string): Map<string, Skill> {
  const ov = cfg.data.agents[effectiveAgentKey(cfg.data, agentKey)];
  const presetName = ov?.preset;
  if (!presetName) return new Map();
  const p = cfg.data.presets.find((x) => x.name === presetName);
  if (!p) return new Map();
  const out = new Map<string, Skill>();
  const addById = (id: string) => {
    const name = nameOf(id);
    const sk = allSkills.find((s) => s.id === id) ?? allSkills.find((s) => s.name === name);
    if (sk && !out.has(sk.id)) out.set(sk.id, sk);
  };
  for (const id of p.skills ?? []) addById(id);
  const tagSet = new Set(p.tags ?? []);
  if (tagSet.size > 0) {
    for (const s of allSkills) {
      if (effectiveTags(cfg.data, s).some((t) => tagSet.has(t))) out.set(s.id, s);
    }
  }
  return out;
}

/**
 * 单技能部署（「添加」入口）。
 *
 * 按 skill id（name@来源）把该技能部署进 agent 目录（软链或复制，遵循 resolveSyncMode），
 * **不写 config**（物理即真相）。遇到已存在的外部软链 / 用户自有同名实体目录时按 deployAgent
 * 的既有人身安全守卫处理（绝不覆盖用户内容）。等同以单技能集调用 deployAgent（prune:false）。
 */
export function deployOne(
  cfg: ConfigStore,
  agentKey: string,
  skillId: string,
  allSkills: Skill[],
  opts: { prune?: boolean } = {},
): SyncResult {
  const skill = allSkills.find((s) => s.id === skillId);
  if (!skill) {
    return { agent: agentKey, created: [], removed: [], failed: [{ skill: skillId, reason: t('merge.skillNotFound', { name: skillId }) }] };
  }
  return deployAgent(cfg, agentKey, new Map([[skill.id, skill]]), allSkills, opts);
}

/** 每条 (skill, Agent) 关系的同步策略：关系覆盖 > agent 覆盖 > 全局默认（SY-01）。
 * 别名沿用主 Agent 的设置——目录只有一份，同一个技能不可能对它同时软链又复制。
 */
export function resolveSyncMode(cfg: ConfigStore, agentKey: string, skillName: string): 'symlink' | 'copy' {
  const ov = cfg.data.agents[effectiveAgentKey(cfg.data, agentKey)];
  return ov?.skillSync?.[skillName] ?? ov?.sync ?? cfg.data.defaultSync;
}

/** 删除已存在的落点（含悬空软链），供重建前清理 */
function removeExisting(p: string): void {
  try {
    // 用 lstat 而不是 existsSync：悬空软链 existsSync 为 false，但仍占位，直接 symlink 会 EEXIST
    if (fs.lstatSync(p, { throwIfNoEntry: false })) fs.rmSync(p, { recursive: true, force: true });
  } catch { /* ignore */ }
}

export function symlinkSkill(linkPath: string, targetDir: string): void {
  fs.mkdirSync(path.dirname(linkPath), { recursive: true });
  removeExisting(linkPath);
  fs.symlinkSync(targetDir, linkPath, 'dir');
}

export function copySkill(linkPath: string, targetDir: string): void {
  fs.mkdirSync(path.dirname(linkPath), { recursive: true });
  removeExisting(linkPath);
  fs.cpSync(targetDir, linkPath, { recursive: true });
}

/** 目录读取失败时返回空，供比较用 */
function readDir(dir: string): fs.Dirent[] {
  try { return fs.readdirSync(dir, { withFileTypes: true }); } catch { return []; }
}

/**
 * 两个目录内容是否完全一致（递归比较文件名与文件内容）。
 * 用于判断「goal 位置已有的实体目录」是否就是本工具部署的副本：
 * 只有内容一致时才允许把它重建为软链/副本——否则那是用户自己的内容，绝不删除。
 */
export function dirsEqual(a: string, b: string): boolean {
  const ae = readDir(a);
  const be = readDir(b);
  if (ae.length === 0 || ae.length !== be.length) return false;
  const names = new Set(be.map((e) => e.name));
  for (const e of ae) {
    if (!names.has(e.name)) return false;
    if (!sameEntry(path.join(a, e.name), path.join(b, e.name))) return false;
  }
  return true;
}

/** 单个条目是否一致：软链一律视为不一致，目录递归比较，其余比内容 */
function sameEntry(pa: string, pb: string): boolean {
  let la: fs.Stats;
  let lb: fs.Stats;
  try { la = fs.lstatSync(pa); lb = fs.lstatSync(pb); } catch { return false; }
  if (la.isSymbolicLink() || lb.isSymbolicLink()) return false;
  const isDir = la.isDirectory();
  if (isDir !== lb.isDirectory()) return false;
  if (isDir) return dirsEqual(pa, pb);
  try { return fs.readFileSync(pa).equals(fs.readFileSync(pb)); } catch { return false; }
}

/** 落点检查结论：ok=可部署，skip=已就位无需动，blocked=不是本工具的东西，不能碰 */
type DeployGate = { kind: 'ok' } | { kind: 'skip' } | { kind: 'blocked'; reason: string };

/**
 * 落盘位置已有东西时：只有「本工具自己部署的」才允许覆盖，用户自己的内容绝不删除。
 * 本工具自己部署过的软链一律视为可覆盖并重建，用户自有软链 / 真实目录 / 普通文件一律拦下。
 */
function gateSymlinkEntry(cfg: ConfigStore, linkDir: string, target: string, agentsDir: string): DeployGate {
  // 已软链且指向正确则跳过
  try { if (fs.realpathSync(linkDir) === fs.realpathSync(target)) return { kind: 'skip' }; } catch { /* 目标失效，继续重建 */ }
  let linkTarget: string | undefined;
  try { linkTarget = fs.readlinkSync(linkDir); } catch { /* 读不到就按外部处理 */ }
  if (isManagedLinkTarget(cfg.data, linkTarget, agentsDir)) return { kind: 'ok' };
  // 外部工具 / 手工创建的软链，不归本工具管，误删会破坏用户环境
  return { kind: 'blocked', reason: t('sync.externalLink', { dir: linkDir }) };
}

function gateExistingEntry(cfg: ConfigStore, linkDir: string, target: string, agentsDir: string): DeployGate {
  let existing: fs.Stats | undefined;
  try { existing = fs.lstatSync(linkDir); } catch { /* 不存在，正常新建 */ }
  if (!existing) return { kind: 'ok' };
  if (existing.isSymbolicLink()) return gateSymlinkEntry(cfg, linkDir, target, agentsDir);
  if (existing.isDirectory()) {
    // 实体目录：内容与目标技能一致才视为本工具部署的副本（可安全重建）；否则是用户自有内容
    return dirsEqual(linkDir, target)
      ? { kind: 'ok' }
      : { kind: 'blocked', reason: t('sync.realDirMismatch', { dir: linkDir }) };
  }
  return { kind: 'blocked', reason: t('sync.fileExists', { dir: linkDir }) };
}

/** 建软链；平台不支持（Windows 权限等，NFR-02）时降级为复制并记一条 warning */
function placeSymlink(linkDir: string, target: string, name: string, result: SyncResult): void {
  try {
    symlinkSkill(linkDir, target);
  } catch (e) {
    copySkill(linkDir, target);
    result.warnings ??= [];
    result.warnings.push(t('sync.symlinkFallback', { name, msg: (e as Error).message }));
  }
}

/** 确保 agent 目录存在；创建失败时把原因写进结果并返回 false */
function ensureAgentsDir(agentsDir: string, result: SyncResult): boolean {
  if (fs.existsSync(agentsDir)) return true;
  try {
    fs.mkdirSync(agentsDir, { recursive: true });
    return true;
  } catch (e) {
    result.failed.push({ skill: '*', reason: t('sync.mkdirFailed', { dir: agentsDir, msg: (e as Error).message }) });
    return false;
  }
}

/** 部署单个技能：落点检查过关后，按该关系的同步策略建软链或复制 */
function deployOneSkill(
  cfg: ConfigStore,
  agentKey: string,
  agentsDir: string,
  sk: Skill,
  result: SyncResult,
): void {
  const linkDir = path.join(agentsDir, sk.name);
  const gate = gateExistingEntry(cfg, linkDir, sk.dir, agentsDir);
  if (gate.kind === 'skip') return;
  if (gate.kind === 'blocked') {
    result.failed.push({ skill: sk.id, reason: gate.reason });
    return;
  }
  try {
    if (resolveSyncMode(cfg, agentKey, sk.name) === 'copy') copySkill(linkDir, sk.dir);
    else placeSymlink(linkDir, sk.dir, sk.name, result);
    result.created.push(sk.id);
  } catch (e) {
    log.warn('sync', `Deploy failed for ${sk.id}`, { agent: agentKey, reason: (e as Error).message });
    result.failed.push({ skill: sk.id, reason: (e as Error).message });
  }
}

/**
 * 回收不再需要的项：只在显式同步（prune）时进行，且只回收「本工具自己部署的」软链。
 * 真实目录（agent 自带 skill / 副本）与外部工具创建的软链都不归本工具管，误删会直接破坏用户环境。
 */
function pruneSyncLinks(cfg: ConfigStore, agentsDir: string, keep: Set<string>, result: SyncResult): void {
  for (const entry of fs.readdirSync(agentsDir)) {
    if (keep.has(entry)) continue;
    const p = path.join(agentsDir, entry);
    try {
      const st = fs.lstatSync(p);
      if (!st.isSymbolicLink()) continue;
      if (!isManagedLinkTarget(cfg.data, fs.readlinkSync(p), agentsDir)) continue;
      fs.unlinkSync(p);
      result.removed.push(entry);
    } catch { /* 读不到状态就跳过，宁可不删 */ }
  }
}

/**
 * 部署某 agent 的期望技能集。
 *
 * `opts.prune`（默认 false）决定是否回收「已不再需要」的项：
 * - false：只补齐缺失 / 修复失效链接（自动同步走的路径）——绝不对用户环境做删除；
 * - true：额外回收本工具自己部署、且已不在期望集里的软链（仅由「预设变更 / 该 Agent 策略变更 /
 *   手动同步 / 用户点修复」这类显式操作触发）。
 *
 * 无论哪种情况，都只处理「本工具自己部署的」产物：真实目录与外部软链一律不动。
 */
export function deployAgent(
  cfg: ConfigStore,
  agentKey: string,
  desired: Map<string, Skill>,
  allSkills: Skill[],
  opts: { prune?: boolean } = {},
): SyncResult {
  const def = findAgentDef(cfg.data, agentKey);
  const result: SyncResult = { agent: agentKey, created: [], removed: [], failed: [] };
  if (!def) {
    result.failed.push({ skill: '*', reason: t('sync.unknownAgent', { agent: agentKey }) });
    return result;
  }
  // 共享目录的 agent（cline/warp 等）与其它 agent 共用 ~/.agents/skills，采用“只清理本 agent 曾部署项”逻辑
  const agentsDir = resolveGlobalDir(def, cfg.data.agents[agentKey]?.globalDir);
  if (!ensureAgentsDir(agentsDir, result)) return result;

  const seen = new Set<string>();
  for (const sk of desired.values()) {
    seen.add(sk.name);
    deployOneSkill(cfg, agentKey, agentsDir, sk, result);
  }
  if (opts.prune === true) pruneSyncLinks(cfg, agentsDir, seen, result);

  if (result.created.length || result.removed.length || result.failed.length) {
    log.info('sync', 'Agent sync finished', {
      agent: agentKey,
      prune: opts.prune === true,
      created: result.created.length,
      removed: result.removed.length,
      failed: result.failed.length,
    });
  }
  return result;
}

/**
 * 一次性「应用预设 / 手动同步」：把指定（默认活跃）agent 各自绑定预设展开的 skill 集部署进目录。
 *
 * 不同于启用/停用式自动同步：这里只在显式调用时执行一次（prune 语义见 deployAgent）——
 * preset 是「一次应用」的记忆，除非再次显式调用，否则不随来源 / 标签 / 配置文件变更自动补回。
 *
 * 同一目录只部署一次：目标先折算到该目录的主 Agent 再去重。别名与主 Agent 共用同一个目录，
 * 共享同一套 preset 策略，因此别名不重复部署。
 *
 * `opts.prune` 决定是否回收多余项：自动触发的路径一律不传（只补齐、不删除，prune:false）；
 * 用户显式应用 / 修复等操作才传 true 回收本工具部署且已不在此次的软链。
 */
export function syncActive(
  cfg: ConfigStore,
  allSkills: Skill[],
  only?: string[],
  reason: string = 'manual',
  opts: { prune?: boolean } = {},
): SyncResult[] {
  const requested = only ?? cfg.data.activeAgents;
  const targets = [
    ...new Set(requested.map((k) => (findAgentDef(cfg.data, k) ? effectiveAgentKey(cfg.data, k) : k))),
  ];
  // 应用预设：部署目标以其绑定预设展开的 skill 集为准（未绑定预设 → 空集，不部署）
  const results = targets.map((k) => syncPresetFor(cfg, allSkills, k, opts));
  const created = results.reduce((n, r) => n + r.created.length, 0);
  const removed = results.reduce((n, r) => n + r.removed.length, 0);
  const failed = results.flatMap((r) => r.failed);
  const warnings = results.flatMap((r) => r.warnings ?? []);
  if (targets.length > 0) {
    log.info('sync', `Sync finished (trigger: ${reason})`, {
      agents: targets.length, aliasesMerged: requested.length - targets.length, prune: opts.prune === true,
      created, removed,
      failed: failed.length, warnings: warnings.length,
      // 日志只记失败技能名，不落本地化 reason（日志必须始终是英文）
      failedSkills: failed.length ? failed.map((f) => f.skill) : undefined,
    });
  }
  return results;
}

/** 单个目标的「应用预设」部署：将其绑定预设展开为 skill 集后调用 deployAgent */
function syncPresetFor(cfg: ConfigStore, allSkills: Skill[], agentKey: string, opts: { prune?: boolean }): SyncResult {
  const desired = presetSkillSet(cfg, allSkills, agentKey);
  return deployAgent(cfg, agentKey, desired, allSkills, opts);
}

export interface SyncDiff {
  agent: string;
  desiredNames: string[];
  /** 期望有、实际未部署 */
  missing: string[];
  /** 实际有、期望无（注意：只有显式同步 / 一键清理才会回收，且仅限本工具部署的软链） */
  extra: string[];
  /** 期望中应部署但软链失效 */
  brokenLink: string[];
}

/**
 * 只读比对（物理为准，期望集已停用）：activeAgents 实际目录 vs（空期望）——
 * 用于诊断「残留软链」与「失效软链」。desired 一律视为空：本工具已不再维护"应装什么"，
 * 任何实际目录里由本工具部署的软链都算作 extra（可被显式一键清理判定），
 * 真实目录 / 外部软链仅作提示，绝不删。注意 missing 恒为空。
 */
export function diffSync(cfg: ConfigStore, _allSkills: Skill[]): SyncDiff[] {
  const out: SyncDiff[] = [];
  // 同目录只看主 Agent：别名与它共用一份目录，重复比对会得出同一结论
  const keys = [...new Set(cfg.data.activeAgents.map((k) => effectiveAgentKey(cfg.data, k)))];
  for (const key of keys) {
    const def = findAgentDef(cfg.data, key);
    if (!def) continue;
    const dir = resolveGlobalDir(def, cfg.data.agents[key]?.globalDir);
    const { actual, brokenLink } = scanAgentDir(dir);
    // 期望集已停用：desiredNames 恒为空，故 actual 里每一项都算 extra（供显式清理判定）
    const desiredNames: string[] = [];
    out.push({ agent: key, desiredNames, missing: [], extra: [...actual], brokenLink });
  }
  return out;
}

/** 扫一遍某 agent 的实际目录：软链 / 真实目录计入 actual，失效软链单独记出 */
function scanAgentDir(dir: string): { actual: Set<string>; brokenLink: string[] } {
  const actual = new Set<string>();
  const brokenLink: string[] = [];
  if (!fs.existsSync(dir)) return { actual, brokenLink };
  for (const ent of fs.readdirSync(dir)) {
    const p = path.join(dir, ent);
    let ls: fs.Stats;
    try { ls = fs.lstatSync(p); } catch { continue; }
    if (ls.isSymbolicLink() && !fs.existsSync(p)) { brokenLink.push(ent); continue; }
    if (ls.isSymbolicLink() || ls.isDirectory()) actual.add(ent);
  }
  return { actual, brokenLink };
}

export const _internal = { deployAgent, diffSync, expandTilde };
