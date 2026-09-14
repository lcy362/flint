import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { HubConfig, CustomAgent, AgentOverride } from '../config/types.js';
import type { Skill } from './skill.js';
import { readSkill } from './skill.js';
import type { DesiredContext } from './sync.js';

export type ToolCategory = 'coding' | 'lobster';

export interface AgentDef {
  key: string;
  name: string;
  /** 相对 home 的全局目录 */
  global: string;
  /** 项目级相对目录，可空 */
  project?: string;
  category: ToolCategory;
  family?: string;
  /** 文档化的跨产品目录复用：此目录亦被这些产品读取（无需同目录爆破即可说明） */
  alsoUsedBy?: string[];
  /** 是否读取共享 ~/.agents 或 ~/.config/agents（仅发现/部署共享） */
  shared?: 'agents' | 'config-agents';
  recursive?: boolean;
  /** 自定义 Agent（AG-03）：非内置，来自配置 */
  custom?: boolean;
}

// 对照 PRD §5.2.1（以 skills-manager 为准 + pks 补齐）
export const builtinAgents: AgentDef[] = [
  { key: 'cursor', name: 'Cursor', global: '.cursor/skills', project: '.cursor/skills', category: 'coding' },
  { key: 'claude_code', name: 'Claude Code', global: '.claude/skills', project: '.claude/skills', category: 'coding' },
  { key: 'codex', name: 'Codex CLI', global: '.codex/skills', project: '.codex/skills', category: 'coding', shared: 'agents' },
  { key: 'github_copilot', name: 'GitHub Copilot', global: '.copilot/skills', project: '.copilot/skills', category: 'coding', shared: 'agents' },
  { key: 'grok', name: 'Grok', global: '.grok/skills', project: '.grok/skills', category: 'coding' },
  { key: 'opencode', name: 'OpenCode', global: '.config/opencode/skills', project: '.opencode/skills', category: 'coding', shared: 'agents' },
  { key: 'antigravity', name: 'Antigravity', global: '.gemini/antigravity/skills', category: 'coding' },
  { key: 'gemini_cli', name: 'Gemini CLI', global: '.gemini/skills', category: 'coding' },
  { key: 'amp', name: 'Amp', global: '.config/agents/skills', category: 'coding', shared: 'config-agents' },
  { key: 'replit', name: 'Replit', global: '.config/agents/skills', category: 'coding', shared: 'config-agents' },
  { key: 'kilo_code', name: 'Kilo Code', global: '.kilocode/skills', category: 'coding' },
  { key: 'roo_code', name: 'Roo Code', global: '.roo/skills', category: 'coding' },
  { key: 'goose', name: 'Goose', global: '.config/goose/skills', category: 'coding' },
  { key: 'droid', name: 'Droid', global: '.factory/skills', category: 'coding' },
  { key: 'windsurf', name: 'Windsurf', global: '.codeium/windsurf/skills', project: '.windsurf/skills', category: 'coding' },
  { key: 'trae', name: 'TRAE IDE', global: '.trae/skills', project: '.trae/skills', category: 'coding', family: 'TRAE', alsoUsedBy: ['TraeWork', 'TraeCode CLI'] },
  { key: 'trae_cn', name: 'TRAE CN', global: '.trae-cn/skills', project: '.trae-cn/skills', category: 'coding', family: 'TRAE', alsoUsedBy: ['TraeWork(国内)', 'TraeCode CLI'] },
  { key: 'cline', name: 'Cline', global: '.agents/skills', project: '.agents/skills', category: 'coding', shared: 'agents' },
  { key: 'warp', name: 'Warp', global: '.agents/skills', project: '.agents/skills', category: 'coding', shared: 'agents' },
  { key: 'omp_agent', name: 'OMP Agent', global: '.omp/agent/skills', project: '.omp/skills', category: 'coding' },
  { key: 'pi', name: 'Pi', global: '.pi/agent/skills', project: '.pi/skills', category: 'coding', shared: 'agents' },
  { key: 'deepseek_harness', name: 'DeepSeek Harness', global: '.dsh/skills', project: '.dsh/skills', category: 'coding', shared: 'agents' },
  { key: 'qoder', name: 'Qoder', global: '.qoder/skills', project: '.qoder/skills', category: 'coding', family: 'Qoder' },
  { key: 'qwen_code', name: 'Qwen Code', global: '.qwen/skills', category: 'coding', family: 'Qoder' },
  { key: 'qoderwork', name: 'QoderWork(国际)', global: '.qoderwork/skills', project: '.qoderwork/skills', category: 'coding', family: 'Qoder' },
  { key: 'qoderworkcn', name: 'QoderWork(国内)', global: '.qoderworkcn/skills', project: '.qoderworkcn/skills', category: 'coding', family: 'Qoder' },
  { key: 'codebuddy', name: 'CodeBuddy', global: '.codebuddy/skills', project: '.codebuddy/skills', category: 'coding' },
  { key: 'zencoder', name: 'Zencoder', global: '.zencoder/skills', category: 'coding' },
  { key: 'zcode', name: 'ZCode', global: '.zcode/skills', project: '.zcode/skills', category: 'coding' },
  { key: 'openclaw', name: 'OpenClaw', global: '.openclaw/skills', category: 'lobster', family: 'Claw' },
  { key: 'qclaw', name: 'QClaw', global: '.qclaw/skills', category: 'lobster', family: 'Claw' },
  { key: 'easyclaw', name: 'EasyClaw', global: '.easyclaw/skills', category: 'lobster', family: 'Claw' },
  { key: 'autoclaw', name: 'AutoClaw', global: '.openclaw-autoclaw/skills', category: 'lobster', family: 'Claw' },
  { key: 'workbuddy', name: 'WorkBuddy', global: '.workbuddy/skills', category: 'lobster', family: 'Claw' },
  { key: 'hermes', name: 'Hermes Agent', global: '.hermes/skills', category: 'lobster', family: 'Claw', recursive: true },
  { key: 'clawdbot', name: 'Clawdbot', global: '.clawdbot/skills', project: '.clawdbot/skills', category: 'lobster', family: 'Claw' },
  { key: 'reasonix', name: 'DeepSeek Reasonix', global: '.reasonix/skills', project: '.reasonix/skills', category: 'coding' },
  { key: 'teamwork', name: 'Teamwork', global: 'teamwork/skills', project: 'teamwork/skills', category: 'lobster' },
  // 长尾：PRD §5.2.1 注释要求并入统一配置，各遵循 .xxx/skills 约定
  { key: 'kimi_code', name: 'Kimi Code', global: '.kimi/skills', project: '.kimi/skills', category: 'coding' },
  { key: 'augment', name: 'Augment', global: '.augment/skills', project: '.augment/skills', category: 'coding' },
  { key: 'bob', name: 'Bob', global: '.bob/skills', project: '.bob/skills', category: 'coding' },
  { key: 'command_code', name: 'Command Code', global: '.commandcode/skills', project: '.commandcode/skills', category: 'coding' },
  { key: 'continue', name: 'Continue', global: '.continue/skills', project: '.continue/skills', category: 'coding' },
  { key: 'cortex', name: 'Cortex', global: '.cortex/skills', project: '.cortex/skills', category: 'coding' },
  { key: 'crush', name: 'Crush', global: '.crush/skills', project: '.crush/skills', category: 'coding' },
  { key: 'iflow', name: 'iFlow', global: '.iflow/skills', project: '.iflow/skills', category: 'coding' },
  { key: 'junie', name: 'Junie', global: '.junie/skills', project: '.junie/skills', category: 'coding' },
  { key: 'kiro', name: 'Kiro', global: '.kiro/skills', project: '.kiro/skills', category: 'coding' },
  { key: 'kode', name: 'Kode', global: '.kode/skills', project: '.kode/skills', category: 'coding' },
  { key: 'mcpjam', name: 'MCPJam', global: '.mcpjam/skills', project: '.mcpjam/skills', category: 'coding' },
  { key: 'mistral_vibe', name: 'Mistral Vibe', global: '.mistral/skills', project: '.mistral/skills', category: 'coding' },
  { key: 'mux', name: 'Mux', global: '.mux/skills', project: '.mux/skills', category: 'coding' },
  { key: 'neovate', name: 'Neovate', global: '.neovate/skills', project: '.neovate/skills', category: 'coding' },
  { key: 'openhands', name: 'OpenHands', global: '.openhands/skills', project: '.openhands/skills', category: 'coding' },
  { key: 'pochi', name: 'Pochi', global: '.pochi/skills', project: '.pochi/skills', category: 'coding' },
  { key: 'adal', name: 'Adal', global: '.adal/skills', project: '.adal/skills', category: 'coding' },
  { key: 'deepagents', name: 'DeepAgents', global: '.deepagents/skills', project: '.deepagents/skills', category: 'coding' },
  { key: 'firebender', name: 'Firebender', global: '.firebender/skills', project: '.firebender/skills', category: 'coding' },
];

/** 自定义 Agent → AgentDef（global 存绝对路径，绕过 home 拼接） */
export function customToDef(c: CustomAgent): AgentDef {
  return {
    key: c.key,
    name: c.name,
    global: c.globalDir,
    project: c.projectDir,
    category: 'coding',
    recursive: c.recursive,
    custom: true,
  };
}

/** 内置清单 + 用户自定义 Agent（AG-03） */
export function allAgentDefs(cfg: HubConfig): AgentDef[] {
  return [...builtinAgents, ...cfg.customAgents.map(customToDef)];
}

export function findBuiltin(key: string): AgentDef | undefined {
  return builtinAgents.find((a) => a.key === key);
}

export function findAgentDef(cfg: HubConfig, key: string): AgentDef | undefined {
  return allAgentDefs(cfg).find((a) => a.key === key);
}

export function resolveGlobalDir(def: AgentDef, override?: string): string {
  if (override) return expandTilde(override);
  if (def.custom) return expandTilde(def.global);
  return path.join(os.homedir(), def.global);
}
export function resolveProjectDir(def: AgentDef, cwd: string, override?: string): string | undefined {
  if (!def.project) return undefined;
  if (override) return path.join(cwd, override);
  return path.join(cwd, def.project);
}

export function expandTilde(p: string): string {
  return p.startsWith('~/') || p === '~' ? path.join(os.homedir(), p.slice(2)) : p;
}

/** 自有仓库的 skill 根目录（与 scanner.scanRepo 的换算保持一致） */
function repoSkillRoots(cfg: HubConfig): string[] {
  return cfg.repos.map((r) => (r.root ? expandTilde(r.root) : path.join(expandTilde(r.path), 'skills')));
}

/** 解析真实路径；目标不存在时退回字面绝对路径 */
function realOrResolve(p: string): string {
  try {
    return fs.realpathSync(p);
  } catch {
    return path.resolve(p);
  }
}

/**
 * 判断软链目标是否由本工具部署（落在某个自有仓库的 skill 根之下）。
 *
 * 这条判断同时服务两件事：
 * - 展示：区分「本工具分发的软链」与「外部工具 / 手工创建的软链」，后者不该被标成"预设引入"；
 * - 安全：同步的清理阶段只回收本工具自己部署的软链，绝不误删外部软链。
 */
export function isManagedLinkTarget(cfg: HubConfig, target: string | undefined, baseDir?: string): boolean {
  if (!target) return false;
  // readlink 可能给出相对路径，需相对软链所在目录解析
  const link = path.isAbsolute(target) ? target : path.resolve(baseDir ?? process.cwd(), target);
  const abs = realOrResolve(link);
  return repoSkillRoots(cfg).some((root) => {
    const r = realOrResolve(root);
    return abs === r || abs.startsWith(r + path.sep);
  });
}

export interface AgentView extends AgentDef {
  globalDir: string;
  projectDirResolved?: string;
  installed: boolean;
  sync: string;
  active: boolean;
  layers?: string[];
  /**
   * 同一技能目录的主 Agent key（自身即主 Agent 时与 key 相同）。
   *
   * 目录只有一份实体，而预设 / 安装方式 / 显式开关都是按 Agent 存的，同目录的多个
   * Agent 不可能各自生效：同步按 Agent 逐个对账落盘，会互相覆盖。因此每个目录固定
   * 选一个主 Agent 作为该目录策略的唯一落点，其余 Agent 视为它的「别名」——
   * 只说明它们走的是同一个路径，策略读取与写入都以主 Agent 为准。
   */
  primaryKey: string;
  /** 与哪些 agent 解析到同一目录（自动比对，AG-02） */
  sharedWith: string[];
  /** 文档化跨产品复用 */
  alsoUsedBy?: string[];
  /**
   * 关联的预设名。关联了才有预设基准；未关联则基准为空，
   * 该 Agent 只分发单独开启的技能（不存在「未绑定即跟随全部预设」的兜底）。
   */
  preset?: string;
  /** 每 (skill, Agent) 关系的同步策略覆盖（SY-01） */
  skillSync?: Record<string, 'symlink' | 'copy'>;
  /** 手动开启的 skill id */
  explicitOn?: string[];
  explicitOff?: string[];
}

/**
 * 同一技能目录的主 Agent 挑选规则：活跃优先（只有活跃的会被自动同步，其策略才是
 * 实际持续生效的那套），其次按名称稳定排序。前端卡片、同步目标、策略读写共用它。
 */
export function primaryOf(members: { key: string; name: string; active: boolean }[]): string {
  return [...members].sort(
    (a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name)
  )[0].key;
}

/** 某 Agent 所在目录的全部成员（含自身）；未登记的 key 返回空 */
function dirMembers(cfg: HubConfig, key: string): { key: string; name: string; active: boolean }[] {
  const def = findAgentDef(cfg, key);
  if (!def) return [];
  const dir = resolveGlobalDir(def, cfg.agents[key]?.globalDir);
  return allAgentDefs(cfg)
    .map((d) => ({
      key: d.key,
      name: d.name,
      active: cfg.activeAgents.includes(d.key),
      dir: resolveGlobalDir(d, cfg.agents[d.key]?.globalDir),
    }))
    .filter((m) => m.dir === dir);
}

/**
 * 某 Agent 的分发策略落点 = 所在目录的主 Agent。
 * 别名（非主 Agent）自己那份预设 / 安装方式 / 显式开关不生效，读写一律走这里。
 */
export function effectiveAgentKey(cfg: HubConfig, key: string): string {
  const members = dirMembers(cfg, key);
  return members.length > 0 ? primaryOf(members) : key;
}

export function listAgents(cfg: HubConfig): AgentView[] {
  const views: AgentView[] = allAgentDefs(cfg).map((def) => {
    const ov = cfg.agents[def.key];
    const globalDir = resolveGlobalDir(def, ov?.globalDir);
    const installed = fs.existsSync(globalDir);
    const sync = ov?.sync ?? cfg.defaultSync;
    const active = cfg.activeAgents.includes(def.key);
    return {
      ...def,
      globalDir,
      installed,
      sync,
      active,
      layers: def.shared ? [def.shared] : undefined,
      sharedWith: [],
      primaryKey: def.key,
      ...(ov?.preset ? { preset: ov.preset } : {}),
      ...(ov?.skillSync ? { skillSync: ov.skillSync } : {}),
      ...(ov?.explicitOn ? { explicitOn: ov.explicitOn } : {}),
      ...(ov?.explicitOff ? { explicitOff: ov.explicitOff } : {}),
    };
  });
  // 按解析后的 globalDir 分组：同目录者互为 sharedWith，并统一指向该目录的主 Agent
  const byDir = new Map<string, AgentView[]>();
  for (const v of views) {
    const arr = byDir.get(v.globalDir) ?? [];
    arr.push(v);
    byDir.set(v.globalDir, arr);
  }
  for (const v of views) {
    const members = byDir.get(v.globalDir) ?? [];
    v.sharedWith = members.filter((o) => o.key !== v.key).map((o) => o.name);
    v.primaryKey = primaryOf(members);
  }
  // 策略展示以生效者为准：别名沿用主 Agent 的预设 / 安装方式 / 显式开关
  for (const v of views) {
    if (v.primaryKey === v.key) continue;
    const ov = cfg.agents[v.primaryKey];
    v.sync = ov?.sync ?? cfg.defaultSync;
    applyStrategyOverrides(v, ov);
  }
  return views.sort((a, b) => (b.active ? 1 : 0) - (a.active ? 1 : 0) || (b.installed ? 1 : 0) - (a.installed ? 1 : 0));
}

/** 把「策略类」覆盖项搬到 view 上（目录类覆盖 globalDir / projectDir 不在此列，它属于 Agent 自身） */
function applyStrategyOverrides(view: AgentView, ov: AgentOverride | undefined): void {
  if (ov?.preset) view.preset = ov.preset; else delete view.preset;
  if (ov?.skillSync) view.skillSync = ov.skillSync; else delete view.skillSync;
  if (ov?.explicitOn) view.explicitOn = ov.explicitOn; else delete view.explicitOn;
  if (ov?.explicitOff) view.explicitOff = ov.explicitOff; else delete view.explicitOff;
}

export interface AgentSkillRow {
  name: string;
  /** 展示用标题（SKILL.md 的 name，缺省回落到目录名） */
  title?: string;
  description?: string;
  source: 'managed' | 'owned';
  /** 期望部署与否（wanted） */
  wanted: boolean;
  /** 物理是否存在于技能目录 */
  present: boolean;
  /** 存储/部署方式：软链 / 复制到目录 / 本体(自带) / 待部署(pending) */
  store: 'symlink' | 'copy' | 'own' | 'pending';
  /** 软链目标路径（store=symlink 时） */
  linkTarget?: string;
  /** 来源原因：套餐基准 / 手动覆盖 / 自带(本地目录) / 外部软链 */
  reason: 'preset' | 'manual' | 'own' | 'external';
  /** 软链目标不在任何自有仓库内：由本工具之外的来源创建，本工具既不分发它也不清理它 */
  externalLink?: boolean;
  /** 套餐基准里被显式关闭（offOverride）→ 该行不 wanted，提示"套餐成员·已停用" */
  offOverride?: boolean;
  /** 来源套餐名（reason=preset 时） */
  preset?: string;
  /** 来源资产库 id；自带时为空 */
  repo?: string;
  skillId?: string;
  dir?: string;
  link?: boolean;
  /** 关闭该技能时应走哪个叠加集：'off'=加入 explicitOff（套餐基准成员）；'on'=移出 explicitOn */
  disableVia?: 'off' | 'on';
}

/**
 * 构建某 agent 技能行的完整并集 = 期望集 ∪（目录已存在）。
 * 每行用 wanted × present 表达状态，并用 reason/offOverride 决定唯一操作；
 * 返回自带技能与期望缺失（待部署）也一并列出。
 */
export function agentSkillRows(agentKey: string, cfg: HubConfig, allSkills: Skill[], ctx: DesiredContext): AgentSkillRow[] {
  const def = findAgentDef(cfg, agentKey);
  if (!def) return [];
  const dir = resolveGlobalDir(def, cfg.agents[agentKey]?.globalDir);
  const desired = ctx.desired;
  const rows: AgentSkillRow[] = [];
  const presentNames = new Set<string>();
  const presentLstat = new Map<string, fs.Dirent | 'symlink'>();

  // 1) 扫描目录，记录是否存在及各目录项类型
  if (fs.existsSync(dir)) {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      presentNames.add(ent.name);
      presentLstat.set(ent.name, ent); // isSymbolicLink() 可用
    }
  }

  const isOff = (name: string) => ctx.offIds.has(name) || ctx.offNames.has(name);
  const linkTo = (p: string) => { try { return fs.readlinkSync(p); } catch { return undefined; } };

  // 2) 期望集行（无论是否存在）：wanted=true
  for (const skill of desired.values()) {
    const inBase = ctx.baselineNames.has(skill.name);
    const inOn = ctx.onNames.has(skill.name);
    const present = presentNames.has(skill.name);
    const ent = presentLstat.get(skill.name);
    const isLinkEnt = !!ent && (ent === 'symlink' || (typeof ent !== 'string' && ent.isSymbolicLink()));
    let store: AgentSkillRow['store'] = 'pending';
    if (present) store = isLinkEnt ? 'symlink' : 'copy';
    const dirPath = present ? path.join(dir, skill.name) : undefined;
    rows.push({
      name: skill.name, title: skill.name, description: skill.description,
      source: 'managed', wanted: true, present, store,
      linkTarget: present && isLinkEnt ? linkTo(dirPath!) : undefined,
      reason: inBase ? 'preset' : 'manual',
      preset: ctx.presetOf.get(skill.name),
      repo: skill.source, skillId: skill.id,
      dir: dirPath,
      link: present ? isLinkEnt : undefined,
      disableVia: inBase && !inOn ? 'off' : 'on',
    });
  }

  // 3) 目录中存在但不在期望集的行（残留 or 自带）
  for (const name of presentNames) {
    if ([...desired.values()].some((s) => s.name === name)) continue; // 已在期望集，跳过
    const ent = presentLstat.get(name);
    if (!ent) continue;
    const isLink = ent === 'symlink' || (typeof ent !== 'string' && ent.isSymbolicLink());
    if (isLink) {
      // 软链但不期望：区分两种来源 —— 本工具分发的残留（已停用）／外部工具创建的（不归本工具管）
      const p = path.join(dir, name);
      const target = linkTo(p);
      const externalLink = !isManagedLinkTarget(cfg, target, dir);
      const offOverride = !externalLink && ctx.baselineNames.has(name) && isOff(name);
      const src = allSkills.find((s) => s.name === name);
      rows.push({
        name, title: name,
        description: readSkill(p)?.description, // readSkill 顺着软链读到目标
        source: 'managed', wanted: false, present: true, store: 'symlink',
        linkTarget: target,
        reason: externalLink ? 'external' : 'preset', offOverride, externalLink,
        preset: ctx.presetOf.get(name),
        skillId: src?.id, repo: src?.source,
        dir: p, link: true,
      });
    } else {
      const p = path.join(dir, name);
      if (!isSkillDir(p)) continue; // 只把真正的技能目录视作自带
      const meta = readSkill(p);
      rows.push({
        name, title: meta?.name ?? name, description: meta?.description,
        source: 'owned', wanted: false, present: true, store: 'own', reason: 'own', dir: p, link: false,
      });
    }
  }

  return rows.sort((a, b) => Number(b.wanted) - Number(a.wanted) || a.name.localeCompare(b.name));
}

/** 判断目录是否为带 SKILL.md 的技能目录 */
function isSkillDir(p: string): boolean {
  try {
    return fs.existsSync(path.join(p, 'SKILL.md'));
  } catch { return false; }
}
