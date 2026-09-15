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

export interface DesiredContext {
  /** 关联的预设名；未关联时为空串 */
  preset: string;
  /** 最终期望：id→Skill（= 基准 ∪ explicitOn − explicitOff） */
  desired: Map<string, Skill>;
  /** 基准（预设）成员的名字集合 */
  baselineNames: Set<string>;
  /** 名字 → 来源预设名（基准成员用；用于标注"来自预设X"） */
  presetOf: Map<string, string>;
  /** 显式开启成员的名字集合（预设之上额外 / 无预设时的全部来源） */
  onNames: Set<string>;
  /** 显式关闭成员的 id/名字（预设之上裁剪）；offNames 为名字归一化 */
  offIds: Set<string>;
  offNames: Set<string>;
}

/** 名字归一化：把 id(name@来源) 或纯名字映射为最终的技能名（目录名） */
function nameOf(id: string): string {
  const at = id.lastIndexOf('@');
  return at >= 0 ? id.slice(0, at) : id;
}

/**
 * 解析某 agent 的期望技能上下文。
 * 期望 = 基准 ∪ explicitOn − explicitOff，其中：
 * - 关联了 preset：基准 = 该预设成员 ∪ 该预设关联标签命中的 skill（PR-05）
 * - 未关联 preset：基准为空——该 Agent 只分发 explicitOn 里单独开启的技能。
 *   不存在「不绑定 = 跟随全部预设」的兜底：绑定与单独配置是两件互不替代的事，
 *   想用预设就显式关联一个，不想用就什么都不关联。
 *
 * 这里也没有「管理模式」开关：是否使用预设完全由 preset 绑定本身表达。
 * 预设同样没有启用开关——它就是「要分发什么」的决策本身。是否自动跟随变更由 Agent 决定：
 * 只有加入 activeAgents 的 Agent 会被自动同步；非活跃 Agent 保持现状，等待手动操作即时生效。
 */
export function desiredContext(cfg: ConfigStore, allSkills: Skill[], agentKey?: string): DesiredContext {
  // 别名（与主 Agent 共用同一目录的 Agent）没有独立的期望集：
  // 目录只有一份实体，期望集只能由主 Agent 的策略推导，否则两边会互相覆盖。
  const ov = agentKey ? cfg.data.agents[effectiveAgentKey(cfg.data, agentKey)] : undefined;
  const onIds = ov?.explicitOn ?? [];
  const offIds = new Set(ov?.explicitOff ?? []);
  const offNames = new Set([...offIds].map(nameOf));
  const baselineNames = new Set<string>();
  const presetOf = new Map<string, string>();

  // 只有显式关联了预设才有基准；未关联则基准为空（不跟随任何预设）
  const p = ov?.preset ? cfg.data.presets.find((x) => x.name === ov.preset) : undefined;
  if (p) {
    for (const id of p.skills) {
      const name = nameOf(id);
      baselineNames.add(name);
      if (!presetOf.has(name)) presetOf.set(name, p.name);
    }
    // 标签命中：打有该预设关联标签的 skill 一并纳入（PR-05）
    const tagSet = new Set(p.tags ?? []);
    if (tagSet.size > 0) {
      for (const s of allSkills) {
        if (effectiveTags(cfg.data, s).some((t) => tagSet.has(t))) {
          baselineNames.add(s.name);
          if (!presetOf.has(s.name)) presetOf.set(s.name, p.name);
        }
      }
    }
  }

  const desired = new Map<string, Skill>();
  const addById = (id: string) => {
    if (offIds.has(id) || offNames.has(nameOf(id))) return;
    const name = nameOf(id);
    const sk = allSkills.find((s) => s.id === id) ?? allSkills.find((s) => s.name === name);
    if (sk) desired.set(sk.id, sk);
  };
  for (const id of baselineNames) addById(id);
  for (const id of onIds) addById(id);
  return {
    preset: ov?.preset ?? '',
    desired,
    baselineNames,
    presetOf,
    onNames: new Set(onIds.map(nameOf)),
    offIds,
    offNames,
  };
}

/**
 * 计算某 agent 应生效的 skill 集合（期望集）。
 * 依赖 desiredContext 的统一解析；语义见其文档。
 */
export function computeDesired(cfg: ConfigStore, allSkills: Skill[], agentKey?: string): Map<string, Skill> {
  return desiredContext(cfg, allSkills, agentKey).desired;
}

/** 某 agent 期望部署的 skill 名字集合（供来源标注/清理判断） */
export function desiredNamesFor(cfg: ConfigStore, allSkills: Skill[], agentKey: string): Set<string> {
  return new Set([...computeDesired(cfg, allSkills, agentKey).values()].map((s) => s.name));
}

/**
 * 每条 (skill, Agent) 关系的同步策略：关系覆盖 > agent 覆盖 > 全局默认（SY-01）。
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
  if (ae.length === 0 && be.length === 0) return false;
  if (ae.length !== be.length) return false;
  const names = new Set(be.map((e) => e.name));
  for (const e of ae) {
    if (!names.has(e.name)) return false;
    const pa = path.join(a, e.name);
    const pb = path.join(b, e.name);
    let la: fs.Stats;
    let lb: fs.Stats;
    try { la = fs.lstatSync(pa); lb = fs.lstatSync(pb); } catch { return false; }
    const isDirA = la.isDirectory() && !la.isSymbolicLink();
    const isDirB = lb.isDirectory() && !lb.isSymbolicLink();
    if (isDirA !== isDirB) return false;
    if (isDirA) { if (!dirsEqual(pa, pb)) return false; continue; }
    if (la.isSymbolicLink() || lb.isSymbolicLink()) return false;
    try { if (!fs.readFileSync(pa).equals(fs.readFileSync(pb))) return false; } catch { return false; }
  }
  return true;
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
  const prune = opts.prune === true;
  const def = findAgentDef(cfg.data, agentKey);
  const result: SyncResult = { agent: agentKey, created: [], removed: [], failed: [] };
  if (!def) {
    result.failed.push({ skill: '*', reason: t('sync.unknownAgent', { agent: agentKey }) });
    return result;
  }
  // 共享目录的 agent（cline/warp 等）与其它 agent 共用 ~/.agents/skills，采用“只清理本 agent 曾部署项”逻辑
  const agentsDir = resolveGlobalDir(def, cfg.data.agents[agentKey]?.globalDir);
  if (!fs.existsSync(agentsDir)) {
    try { fs.mkdirSync(agentsDir, { recursive: true }); }
    catch (e) { result.failed.push({ skill: '*', reason: t('sync.mkdirFailed', { dir: agentsDir, msg: (e as Error).message }) }); return result; }
  }

  const seen = new Set<string>();

  for (const sk of desired.values()) {
    const target = sk.dir;
    const linkDir = path.join(agentsDir, sk.name);
    seen.add(sk.name);

    // 落盘位置已有东西时：只有「本工具自己部署的」才允许覆盖，用户自己的内容绝不删除。
    let existing: fs.Stats | undefined;
    try { existing = fs.lstatSync(linkDir); } catch { /* 不存在，正常新建 */ }
    if (existing) {
      if (existing.isSymbolicLink()) {
        // 已软链且指向正确则跳过
        try { if (fs.realpathSync(linkDir) === fs.realpathSync(target)) continue; } catch { /* 目标失效，继续重建 */ }
        let linkTarget: string | undefined;
        try { linkTarget = fs.readlinkSync(linkDir); } catch { /* 读不到就按外部处理 */ }
        if (!isManagedLinkTarget(cfg.data, linkTarget, agentsDir)) {
          // 外部工具 / 手工创建的软链，不归本工具管，误删会破坏用户环境
          result.failed.push({ skill: sk.id, reason: t('sync.externalLink', { dir: linkDir }) });
          continue;
        }
      } else if (existing.isDirectory()) {
        // 实体目录：内容与目标技能一致才视为本工具部署的副本（可安全重建）；否则是用户自有内容
        if (!dirsEqual(linkDir, target)) {
          result.failed.push({ skill: sk.id, reason: t('sync.realDirMismatch', { dir: linkDir }) });
          continue;
        }
      } else {
        result.failed.push({ skill: sk.id, reason: t('sync.fileExists', { dir: linkDir }) });
        continue;
      }
    }

    try {
      if (resolveSyncMode(cfg, agentKey, sk.name) === 'copy') {
        copySkill(linkDir, target);
      } else {
        try {
          symlinkSkill(linkDir, target);
        } catch (e) {
          // NFR-02：软链不可用（Windows 权限等）自动降级为复制
          copySkill(linkDir, target);
          (result.warnings ??= []).push(t('sync.symlinkFallback', { name: sk.name, msg: (e as Error).message }));
        }
      }
      result.created.push(sk.id);
    } catch (e) {
      log.warn('sync', `Deploy failed for ${sk.id}`, { agent: agentKey, reason: (e as Error).message });
      result.failed.push({ skill: sk.id, reason: (e as Error).message });
    }
  }

  // 回收不再需要的项：只在显式同步（prune）时进行，且只回收「本工具自己部署的」软链。
  // 真实目录（agent 自带 skill / 副本）与外部工具创建的软链都不归本工具管，误删会直接破坏用户环境。
  if (prune) {
    for (const entry of fs.readdirSync(agentsDir)) {
      if (seen.has(entry)) continue;
      const p = path.join(agentsDir, entry);
      try {
        const st = fs.lstatSync(p);
        if (!st.isSymbolicLink()) continue;
        if (!isManagedLinkTarget(cfg.data, fs.readlinkSync(p), agentsDir)) continue;
        fs.unlinkSync(p);
        result.removed.push(entry);
      } catch { /* skip */ }
    }
  }
  if (result.created.length || result.removed.length || result.failed.length) {
    log.info('sync', 'Agent sync finished', {
      agent: agentKey,
      prune,
      created: result.created.length,
      removed: result.removed.length,
      failed: result.failed.length,
    });
  }
  return result;
}

/**
 * 触发式同步：将指定（默认活跃）agent 各按自身期望 skill 集合对账落盘。
 *
 * 同一目录只部署一次：目标先折算到该目录的主 Agent 再去重。别名与主 Agent 共用同一
 * 个目录，若各自部署，两套期望集会在同一个目录里互相删除（后同步者获胜），
 * 因此别名不参与部署，只共享主 Agent 的策略与结果。
 *
 * `opts.prune` 决定是否回收多余项，语义见 deployAgent：
 * 自动触发的同步一律不传（只补齐、不删除）；只有显式操作才传 true。
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
  const results = targets.map((k) => deployAgent(cfg, k, computeDesired(cfg, allSkills, k), allSkills, opts));
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
 * 只读比对：期望 skill 集合（activate preset 成员） vs 每个活跃 agent 实际部署集合。
 * 绝不写盘，仅供诊断。extra 口径与 deployAgent 一致：仅本工具部署的软链可被一键清理，真实目录与外部软链仅提示。
 */
export function diffSync(cfg: ConfigStore, allSkills: Skill[]): SyncDiff[] {
  const out: SyncDiff[] = [];
  // 同目录只看主 Agent：别名与它共用一份目录，重复比对会得出同一结论
  const keys = [...new Set(cfg.data.activeAgents.map((k) => effectiveAgentKey(cfg.data, k)))];
  for (const key of keys) {
    const def = findAgentDef(cfg.data, key);
    if (!def) continue;
    const dir = resolveGlobalDir(def, cfg.data.agents[key]?.globalDir);
    const desiredNames = [...desiredNamesFor(cfg, allSkills, key)];
    const actual = new Set<string>();
    const brokenLink: string[] = [];
    if (fs.existsSync(dir)) {
      for (const ent of fs.readdirSync(dir)) {
        const p = path.join(dir, ent);
        let ls;
        try { ls = fs.lstatSync(p); } catch { continue; }
        if (ls.isSymbolicLink() && !fs.existsSync(p)) { brokenLink.push(ent); continue; }
        if (ls.isSymbolicLink() || ls.isDirectory()) actual.add(ent);
      }
    }
    const missing = desiredNames.filter((n) => !actual.has(n));
    const extra = [...actual].filter((n) => !desiredNames.includes(n));
    out.push({ agent: key, desiredNames, missing, extra, brokenLink });
  }
  return out;
}

export const _internal = { computeDesired, deployAgent, diffSync, expandTilde };
