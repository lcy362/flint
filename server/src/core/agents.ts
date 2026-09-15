import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { HubConfig, CustomAgent, AgentOverride, Repo } from '../config/types.js';
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
  /** 该共享标准目录的绝对路径（shared 存在时） */
  sharedDir?: string;
  /** 共享目录是否正是自己的全局目录（原生成员，否则为兼容读取） */
  sharedOwn?: boolean;
  recursive?: boolean;
  /** 自定义 Agent（AG-03）：非内置，来自配置 */
  custom?: boolean;
}

// 对照 PRD §5.2.1（以 skills-manager 为准 + pks 补齐）
export const builtinAgents: AgentDef[] = [
  { key: 'cursor', name: 'Cursor', global: '.cursor/skills', project: '.cursor/skills', category: 'coding', shared: 'agents' },
  { key: 'claude_code', name: 'Claude Code', global: '.claude/skills', project: '.claude/skills', category: 'coding' },
  { key: 'codex', name: 'Codex', global: '.agents/skills', project: '.agents/skills', category: 'coding', shared: 'agents' },
  { key: 'github_copilot', name: 'GitHub Copilot', global: '.copilot/skills', project: '.github/skills', category: 'coding', shared: 'agents' },
  { key: 'grok', name: 'Grok', global: '.grok/skills', project: '.grok/skills', category: 'coding' },
  { key: 'opencode', name: 'OpenCode', global: '.config/opencode/skills', project: '.opencode/skills', category: 'coding', shared: 'agents' },
  { key: 'antigravity', name: 'Antigravity', global: '.gemini/antigravity/skills', category: 'coding' },
  { key: 'gemini_cli', name: 'Gemini CLI', global: '.gemini/skills', category: 'coding', shared: 'agents' },
  { key: 'amp', name: 'Amp', global: '.config/agents/skills', category: 'coding', shared: 'config-agents' },
  { key: 'replit', name: 'Replit', global: '.config/agents/skills', category: 'coding', shared: 'config-agents' },
  { key: 'kilo_code', name: 'Kilo Code', global: '.kilocode/skills', category: 'coding' },
  { key: 'roo_code', name: 'Roo Code', global: '.roo/skills', category: 'coding', shared: 'agents' },
  { key: 'goose', name: 'Goose', global: '.config/agents/skills', project: '.agents/skills', category: 'coding', shared: 'config-agents' },
  { key: 'droid', name: 'Droid', global: '.factory/skills', category: 'coding' },
  { key: 'windsurf', name: 'Windsurf', global: '.codeium/windsurf/skills', project: '.windsurf/skills', category: 'coding', shared: 'agents' },
  { key: 'trae', name: 'TRAE', global: '.trae/skills', project: '.trae/skills', category: 'coding', family: 'TRAE', alsoUsedBy: ['TraeWork', 'TraeCode CLI'] },
  { key: 'trae_cn', name: 'TRAE CN', global: '.trae-cn/skills', project: '.trae-cn/skills', category: 'coding', family: 'TRAE', alsoUsedBy: ['TraeWork CN', 'TraeCode CLI'] },
  { key: 'cline', name: 'Cline', global: '.cline/skills', project: '.cline/skills', category: 'coding' },
  { key: 'warp', name: 'Warp', global: '.agents/skills', project: '.agents/skills', category: 'coding', shared: 'agents' },
  { key: 'omp_agent', name: 'OMP Agent', global: '.omp/agent/skills', project: '.omp/skills', category: 'coding' },
  { key: 'pi', name: 'Pi', global: '.pi/agent/skills', project: '.pi/skills', category: 'coding', shared: 'agents' },
  { key: 'deepseek_harness', name: 'DeepSeek Harness', global: '.dsh/skills', project: '.dsh/skills', category: 'coding', shared: 'agents' },
  { key: 'qoder', name: 'Qoder', global: '.qoder/skills', project: '.qoder/skills', category: 'coding', family: 'Qoder' },
  { key: 'qwen_code', name: 'Qwen Code', global: '.qwen/skills', category: 'coding', family: 'Qoder' },
  { key: 'qoderwork', name: 'QoderWork', global: '.qoderwork/skills', project: '.qoderwork/skills', category: 'coding', family: 'Qoder' },
  { key: 'qoderworkcn', name: 'QoderWork CN', global: '.qoderworkcn/skills', project: '.qoderworkcn/skills', category: 'coding', family: 'Qoder' },
  { key: 'qwenworkcn', name: 'Qwen Work CN', global: '.qwenworkcn/skills', category: 'coding', family: 'Qoder' },
  { key: 'codebuddy', name: 'CodeBuddy', global: '.codebuddy/skills', project: '.codebuddy/skills', category: 'coding' },
  { key: 'zencoder', name: 'Zencoder', global: '.zencoder/skills', category: 'coding' },
  { key: 'zcode', name: 'ZCode', global: '.zcode/skills', project: '.zcode/skills', category: 'coding' },
  { key: 'openclaw', name: 'OpenClaw', global: '.openclaw/skills', category: 'lobster', family: 'Claw' },
  { key: 'qclaw', name: 'QClaw', global: '.qclaw/skills', category: 'lobster', family: 'Claw' },
  { key: 'easyclaw', name: 'EasyClaw', global: '.easyclaw/skills', category: 'lobster', family: 'Claw' },
  { key: 'autoclaw', name: 'AutoClaw', global: '.openclaw-autoclaw/skills', category: 'lobster', family: 'Claw' },
  { key: 'workbuddy', name: 'WorkBuddy', global: '.workbuddy/skills', category: 'lobster', family: 'Claw' },
  { key: 'hermes', name: 'Hermes Agent', global: '.hermes/skills', project: '.agents/skills', category: 'lobster', family: 'Claw', recursive: true, shared: 'agents' },
  { key: 'clawdbot', name: 'Clawdbot', global: '.clawdbot/skills', project: '.clawdbot/skills', category: 'lobster', family: 'Claw' },
  { key: 'reasonix', name: 'DeepSeek Reasonix', global: '.reasonix/skills', project: '.reasonix/skills', category: 'coding' },
  { key: 'teamwork', name: 'Teamwork', global: 'teamwork/skills', project: 'teamwork/skills', category: 'lobster' },
  // 长尾：PRD §5.2.1 注释要求并入统一配置，各遵循 .xxx/skills 约定
  { key: 'kimi_code', name: 'Kimi Code', global: '.config/agents/skills', project: '.agents/skills', category: 'coding', shared: 'config-agents' },
  { key: 'augment', name: 'Augment', global: '.augment/skills', project: '.augment/skills', category: 'coding' },
  { key: 'bob', name: 'Bob', global: '.bob/skills', project: '.bob/skills', category: 'coding' },
  { key: 'command_code', name: 'Command Code', global: '.commandcode/skills', project: '.commandcode/skills', category: 'coding' },
  { key: 'continue', name: 'Continue', global: '.continue/skills', project: '.continue/skills', category: 'coding' },
  { key: 'cortex', name: 'Cortex', global: '.snowflake/cortex/skills', project: '.cortex/skills', category: 'coding' },
  { key: 'crush', name: 'Crush', global: '.config/crush/skills', project: '.crush/skills', category: 'coding' },
  { key: 'iflow', name: 'iFlow', global: '.iflow/skills', project: '.iflow/skills', category: 'coding' },
  { key: 'junie', name: 'Junie', global: '.junie/skills', project: '.junie/skills', category: 'coding' },
  { key: 'kiro', name: 'Kiro', global: '.kiro/skills', project: '.kiro/skills', category: 'coding' },
  { key: 'kode', name: 'Kode', global: '.kode/skills', project: '.kode/skills', category: 'coding' },
  { key: 'mcpjam', name: 'MCPJam', global: '.mcpjam/skills', project: '.mcpjam/skills', category: 'coding' },
  { key: 'mistral_vibe', name: 'Mistral Vibe', global: '.vibe/skills', project: '.vibe/skills', category: 'coding' },
  { key: 'mux', name: 'Mux', global: '.mux/skills', project: '.mux/skills', category: 'coding' },
  { key: 'neovate', name: 'Neovate', global: '.neovate/skills', project: '.neovate/skills', category: 'coding' },
  { key: 'openhands', name: 'OpenHands', global: '.agents/skills', project: '.agents/skills', category: 'coding', shared: 'agents' },
  { key: 'pochi', name: 'Pochi', global: '.pochi/skills', project: '.pochi/skills', category: 'coding' },
  { key: 'adal', name: 'Adal', global: '.adal/skills', project: '.adal/skills', category: 'coding' },
  { key: 'deepagents', name: 'DeepAgents', global: '.deepagents/agent/skills', project: '.agents/skills', category: 'coding', shared: 'agents' },
  { key: 'firebender', name: 'Firebender', global: '.firebender/skills', project: '.agents/skills', category: 'coding', shared: 'agents' },
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

/** 展示用：把 home 前缀压成 ~（与 Agent 页的目录展示口径一致）；不在 home 下的路径原样返回 */
export function abbrevTilde(p: string): string {
  const home = os.homedir();
  return p === home || p.startsWith(`${home}${path.sep}`) ? `~${p.slice(home.length)}` : p;
}

/** 单个自有仓库的 skill 根目录（与 scanner.scanRepo 的换算保持一致） */
export function repoSkillRoot(repo: Repo): string {
  return repo.root ? expandTilde(repo.root) : path.join(expandTilde(repo.path), 'skills');
}

/** 全部自有仓库的 skill 根目录 */
function repoSkillRoots(cfg: HubConfig): string[] {
  return cfg.repos.map(repoSkillRoot);
}

/**
 * 共享标准目录的绝对路径：内置 Agent 的「额外读取」只落在这两个目录上
 * （`shared: 'agents'` → `~/.agents/skills`，`shared: 'config-agents'` → `~/.config/agents/skills`）。
 */
export function sharedStandardDir(kind: 'agents' | 'config-agents'): string {
  return path.join(os.homedir(), kind === 'config-agents' ? '.config/agents/skills' : '.agents/skills');
}

/** 两个共享标准目录（判定「软链是否指向共享目录」时两个都要看，与具体 Agent 无关） */
export function sharedStandardDirs(): string[] {
  return [sharedStandardDir('agents'), sharedStandardDir('config-agents')];
}

/**
 * 带 id 的「已登记库」（自有仓库 / 第三方来源）及其根目录。
 * 用于按**路径**判定某个软链目标实际属于哪个库——不能拿技能名去猜：
 * 「同名技能恰好也在仓库里」与「这条软链就指向那个仓库」是两件事，混起来会把来源说错。
 */
function registeredLibraryEntries(cfg: HubConfig): { id: string; root: string }[] {
  return [
    ...cfg.repos.map((r) => ({ id: r.id, root: repoSkillRoot(r) })),
    ...cfg.foreignSources.map((s) => ({ id: s.id, root: expandTilde(s.path) })),
  ];
}

/**
 * 「已登记库」的根目录集合：自有仓库 skill 根 ∪ 第三方来源目录 ∪ 共享标准目录。
 * 软链目标落在其中任一之下 ⇒ 技能已经有归属（自己的仓库 / 已关联的只读来源 / 共享标准目录），
 * 不需要再从 Agent 目录把它「归集」进仓库。
 */
function registeredLibraryRoots(cfg: HubConfig): string[] {
  return [...registeredLibraryEntries(cfg).map((e) => e.root), ...sharedStandardDirs()];
}

/** 解析真实路径；目标不存在时退回字面绝对路径 */
function realOrResolve(p: string): string {
  try {
    return fs.realpathSync(p);
  } catch {
    return path.resolve(p);
  }
}

/** 目标（可能是相对路径）是否落在某个根目录之下 */
function underRoot(root: string, target: string | undefined, baseDir?: string): boolean {
  if (!target) return false;
  // readlink 可能给出相对路径，需相对软链所在目录解析
  const link = path.isAbsolute(target) ? target : path.resolve(baseDir ?? process.cwd(), target);
  const abs = realOrResolve(link);
  const r = realOrResolve(root);
  return abs === r || abs.startsWith(r + path.sep);
}

/**
 * 「被接管」的两种口径（同一件事，看问题的角度不同）：
 * - 系统角度：软链指向**任一**自有仓库内的技能 → 已在本系统管理范围内（下面这个函数）；
 * - 仓库角度：软链指向**某个具体仓库**内的技能 → 被该仓库接管（`isLinkInRepo`）。
 * 指向仓库之外的软链两种口径下都**不算接管**，按 agent 自带技能处理（可归集、可接管）。
 *
 * 这条判断同时服务展示与安全：同步的清理阶段只回收本工具自己部署的软链，绝不误删外部软链。
 */
export function isManagedLinkTarget(cfg: HubConfig, target: string | undefined, baseDir?: string): boolean {
  return repoSkillRoots(cfg).some((root) => underRoot(root, target, baseDir));
}

/** 仓库角度：该软链是否指向「指定仓库」内的技能（只有自己仓库过去的软链才算被它接管） */
export function isLinkInRepo(repo: Repo, target: string | undefined, baseDir?: string): boolean {
  return underRoot(repoSkillRoot(repo), target, baseDir);
}

/**
 * 该软链是否指向某个「已登记库」内的技能（自有仓库 / 第三方来源 / 共享标准目录）。
 *
 * 与 `isManagedLinkTarget` 刻意区分：那个只回答「是不是本工具部署/该由本工具回收的软链」
 * （口径限自有仓库，服务同步与清理的安全边界）；这里回答的是「这个技能是否已经有归属」，
 * 服务展示——已有归属的软链不再提供「归集到仓库」（归集只会多复制一份重复本体）。
 */
export function isLinkInRegisteredLibrary(cfg: HubConfig, target: string | undefined, baseDir?: string): boolean {
  return registeredLibraryRoots(cfg).some((root) => underRoot(root, target, baseDir));
}

/**
 * 软链目标实际落在哪个「已登记库」（自有仓库 / 第三方来源）：按路径判定，命中首个即返回。
 * 目标不在任何已登记库内时返回 undefined —— 此时调用方不给出任何来源，
 * 交由展示层直接呈现真实路径（共享标准目录没有来源 id，故不参与本判定）。
 */
export function libraryOfLinkTarget(cfg: HubConfig, target: string | undefined, baseDir?: string): { id: string } | undefined {
  return registeredLibraryEntries(cfg).find((e) => underRoot(e.root, target, baseDir));
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
  /** 主 Agent 由用户显式指定（而非按活跃 / 名称自动推出） */
  primaryExplicit?: boolean;
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
 * 同一技能目录的主 Agent 挑选规则。前端卡片、同步目标、策略读写共用它：
 * 1. 用户显式指定（`agents[key].primary`，AG-02）优先——这是明确决策，不参与自动判定；
 * 2. 否则活跃优先（只有活跃的会被自动同步，其策略才是实际持续生效的那套）；
 * 3. 最后按名称稳定排序。
 */
export function primaryOf(members: { key: string; name: string; active: boolean; primary?: boolean }[]): string {
  const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name);
  const designated = members.filter((m) => m.primary).sort(byName);
  if (designated.length > 0) return designated[0].key;
  return [...members].sort((a, b) => Number(b.active) - Number(a.active) || byName(a, b))[0].key;
}

interface DirMember {
  key: string;
  name: string;
  active: boolean;
  primary?: boolean;
}

/** 某 Agent 所在目录的全部成员（含自身）；未登记的 key 返回空 */
function dirMembers(cfg: HubConfig, key: string): DirMember[] {
  const def = findAgentDef(cfg, key);
  if (!def) return [];
  const dir = resolveGlobalDir(def, cfg.agents[key]?.globalDir);
  return allAgentDefs(cfg)
    .map((d) => ({
      key: d.key,
      name: d.name,
      active: cfg.activeAgents.includes(d.key),
      primary: cfg.agents[d.key]?.primary,
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

/**
 * 指定 / 取消某 Agent 作为其技能目录的主 Agent（AG-02）。
 * 指定是「组的归属」而非该 Agent 的策略：写在它自己身上，同目录其余成员一律清除，
 * 保证一个目录至多一个指定（否则配置里会出现两个互斥的"主"）。
 */
export function setPrimary(cfg: HubConfig, key: string, on: boolean): void {
  for (const m of dirMembers(cfg, key)) {
    if (on && m.key === key) {
      cfg.agents[m.key] = { ...(cfg.agents[m.key] ?? {}), primary: true };
      continue;
    }
    const ov = cfg.agents[m.key];
    if (!ov) continue;
    delete ov.primary;
    if (Object.keys(ov).length === 0) delete cfg.agents[m.key];
  }
}

/**
 * 清掉同目录中「别名」自己那份策略覆盖（目录覆盖 globalDir / projectDir 保留）。
 * 别名与主 Agent 共用一份目录，它那份策略永远不生效，留着只会在配置里造成假象（C5）。
 * 返回被清理的 key，便于日志与测试断言。
 */
export function pruneAliasStrategies(cfg: HubConfig, primaryKey: string): string[] {
  const cleared: string[] = [];
  for (const m of dirMembers(cfg, primaryKey)) {
    if (m.key === primaryKey) continue;
    const ov = cfg.agents[m.key];
    if (!ov) continue;
    const had = ov.preset !== undefined || ov.sync !== undefined || ov.skillSync !== undefined
      || ov.explicitOn !== undefined || ov.explicitOff !== undefined;
    if (!had) continue;
    delete ov.preset;
    delete ov.sync;
    delete ov.skillSync;
    delete ov.explicitOn;
    delete ov.explicitOff;
    cleared.push(m.key);
    if (Object.keys(ov).length === 0) delete cfg.agents[m.key];
  }
  return cleared;
}

export function listAgents(cfg: HubConfig): AgentView[] {
  const views: AgentView[] = allAgentDefs(cfg).map((def) => {
    const ov = cfg.agents[def.key];
    const globalDir = resolveGlobalDir(def, ov?.globalDir);
    const installed = fs.existsSync(globalDir);
    const sync = ov?.sync ?? cfg.defaultSync;
    const active = cfg.activeAgents.includes(def.key);
    // shared 指向的共享标准目录绝对路径，以及它是否就是自己的全局目录（原生成员 vs 兼容读取）
    const sharedAbs = def.shared
      ? path.join(os.homedir(), def.shared === 'config-agents' ? '.config/agents/skills' : '.agents/skills')
      : undefined;
    return {
      ...def,
      globalDir,
      installed,
      sync,
      active,
      layers: def.shared ? [def.shared] : undefined,
      ...(def.shared ? { sharedDir: sharedAbs, sharedOwn: sharedAbs === globalDir } : {}),
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
    // 主 Agent 判定要带上「显式指定」标记；该标记只存在配置里，不进 API 契约
    v.primaryKey = primaryOf(members.map((m) => ({
      key: m.key,
      name: m.name,
      active: m.active,
      primary: cfg.agents[m.key]?.primary,
    })));
    v.primaryExplicit = v.primaryKey === v.key && cfg.agents[v.key]?.primary === true;
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
  /** 软链目标的真实路径（绝对化；store=symlink 时才有） */
  linkTarget?: string;
  /** 来源原因：套餐基准 / 手动覆盖 / 自带(本地目录) / 外部软链 / 共享标准目录读取 */
  reason: 'preset' | 'manual' | 'own' | 'external' | 'shared';
  /** 软链目标不在任何自有仓库内：由本工具之外的来源创建，本工具既不分发它也不清理它 */
  externalLink?: boolean;
  /**
   * 已有归属：软链的这条技能已经在库里了，不再提供「归集」。两种成立方式——
   * 目标落在某个「已登记库」内（自有仓库 / 第三方来源 / 共享标准目录），
   * 或该名字在自有仓库里已有同名副本（`repo` 即那个仓库）。
   */
  alreadyInLibrary?: boolean;
  /** 该技能物理所在的可读目录（自身目录，或额外读取的共享标准目录） */
  fromDir?: string;
  /**
   * 该技能通过哪个目录被本 Agent 读到：
   * - own：自身技能目录，本工具按策略分发（可开关 / 可同步）；
   * - shared：额外读取的共享标准目录，本 Agent 直接可用，但由该目录自己的策略管理（只读）。
   */
  readVia?: 'own' | 'shared';
  /** 已接管：本目录这条是指向仓库内技能的软链（系统口径：任一自有仓库；指向仓库外的不算） */
  takenOver?: boolean;
  /** 套餐基准里被显式关闭（offOverride）→ 该行不 wanted，提示"套餐成员·已停用" */
  offOverride?: boolean;
  /** 来源套餐名（reason=preset 时） */
  preset?: string;
  /**
   * 来源资产库 id（自有仓库 / 第三方来源）。判定口径是**软链目标实际落在哪个库**，
   * 因此自带目录、目标不在任何已登记库内的软链都为空——不按技能名回填。
   */
  repo?: string;
  skillId?: string;
  dir?: string;
  link?: boolean;
  /** 关闭该技能时应走哪个叠加集：'off'=加入 explicitOff（套餐基准成员）；'on'=移出 explicitOn */
  disableVia?: 'off' | 'on';
}

/**
 * 该 Agent 除自身目录外还会「额外读取」的共享标准目录（去重、去掉与自身目录重合的情况）。
 * 这类目录里的技能它直接可用，但由该目录自己的策略管理，不在本 Agent 的分发范围内。
 */
function sharedReadDirs(def: AgentDef, ownDir: string): string[] {
  if (!def.shared) return [];
  const dir = sharedStandardDir(def.shared);
  return dir === ownDir ? [] : [dir];
}

/**
 * 构建某 agent 技能行的完整并集 = 自身目录（期望集 ∪ 目录已存在）∪ 额外读取的共享目录。
 * 每行用 wanted × present 表达状态，并用 reason/offOverride 决定唯一操作；
 * 自带、外部软链、共享目录读取也会一并列出，并用 fromDir/readVia 标注「来自哪个目录」。
 */
export function agentSkillRows(agentKey: string, cfg: HubConfig, allSkills: Skill[], ctx: DesiredContext): AgentSkillRow[] {
  const def = findAgentDef(cfg, agentKey);
  if (!def) return [];
  const ownDir = resolveGlobalDir(def, cfg.agents[agentKey]?.globalDir);
  const desired = ctx.desired;
  const rows: AgentSkillRow[] = [];
  const presentNames = new Set<string>();
  const presentLstat = new Map<string, fs.Dirent>();

  const isOff = (name: string) => ctx.offIds.has(name) || ctx.offNames.has(name);
  /**
   * 读软链目标并归一为**绝对路径**：readlink 可能给出相对路径（如 `../../.agents/skills/x`），
   * 列表要展示、归属要判定的是「实际指向哪里」，相对路径两者都说不清。
   */
  const linkTo = (p: string) => {
    try {
      const raw = fs.readlinkSync(p);
      return path.isAbsolute(raw) ? raw : path.resolve(path.dirname(p), raw);
    } catch { return undefined; }
  };
  /** 自有仓库里是否已有同名副本（按名字查仓库，与行的展示来源无关） */
  const repoIds = new Set(cfg.repos.map((r) => r.id));
  const repoHasCopy = (name: string) => allSkills.some((s) => s.name === name && repoIds.has(s.source));

  // 1) 扫描自身目录，记录是否存在及各目录项类型（隐藏项不算技能）
  if (fs.existsSync(ownDir)) {
    for (const ent of fs.readdirSync(ownDir, { withFileTypes: true })) {
      if (ent.name.startsWith('.')) continue;
      presentNames.add(ent.name);
      presentLstat.set(ent.name, ent); // isSymbolicLink() 可用
    }
  }

  // 2) 期望集行（无论是否存在）：wanted=true
  for (const skill of desired.values()) {
    const inBase = ctx.baselineNames.has(skill.name);
    const inOn = ctx.onNames.has(skill.name);
    const present = presentNames.has(skill.name);
    const ent = presentLstat.get(skill.name);
    const isLinkEnt = !!ent && ent.isSymbolicLink();
    let store: AgentSkillRow['store'] = 'pending';
    if (present) store = isLinkEnt ? 'symlink' : 'copy';
    const dirPath = present ? path.join(ownDir, skill.name) : undefined;
    const linkTarget = present && isLinkEnt ? linkTo(dirPath!) : undefined;
    rows.push({
      name: skill.name, title: skill.name, description: skill.description,
      source: 'managed', wanted: true, present, store,
      linkTarget,
      reason: inBase ? 'preset' : 'manual',
      preset: ctx.presetOf.get(skill.name),
      repo: skill.source, skillId: skill.id,
      dir: dirPath,
      link: present ? isLinkEnt : undefined,
      // 指向仓库内技能的软链 = 已接管；指向仓库外的不算
      takenOver: !!linkTarget && isManagedLinkTarget(cfg, linkTarget, ownDir),
      disableVia: inBase && !inOn ? 'off' : 'on',
      fromDir: ownDir, readVia: 'own',
    });
  }

  // 3) 自身目录中存在但不在期望集的行（残留 or 自带）
  const desiredNames = seenNames(desired);
  for (const name of presentNames) {
    if (desiredNames.has(name)) continue; // 已在期望集，跳过
    const ent = presentLstat.get(name);
    if (!ent) continue;
    const isLink = ent.isSymbolicLink();
    if (isLink) {
      // 软链但不期望：区分两种来源 —— 本工具分发的残留（已停用）／外部工具创建的（不归本工具管）
      const p = path.join(ownDir, name);
      const target = linkTo(p);
      const externalLink = !isManagedLinkTarget(cfg, target, ownDir);
      const offOverride = !externalLink && ctx.baselineNames.has(name) && isOff(name);
      // 展示口径：来源 = 这条软链**实际指向**的已登记库；目标不在任何已登记库内就不给来源，
      // 由展示层直接呈现真实路径（绝不拿同名技能去回填来源，那样会把「同名」说成「来自」）。
      const owner = libraryOfLinkTarget(cfg, target, ownDir);
      // 已有归属＝这条软链的技能已经在库里了，行内「归集」没有意义（只会多复制一份重复本体
      // 或直接被去重跳过）。两种成立方式：
      // ① 目标就落在某个已登记库内（自有仓库 / 第三方来源 / 共享标准目录）；
      // ② 该名字在自有仓库里已有副本（按名字查仓库，与来源展示各算各的）。
      // 要拿来源版本覆盖仓库副本请走技能库的归集确认页——那里才有并列候选可比。
      const alreadyInLibrary = isLinkInRegisteredLibrary(cfg, target, ownDir) || repoHasCopy(name);
      rows.push({
        name, title: name,
        description: readSkill(p)?.description, // readSkill 顺着软链读到目标
        source: 'managed', wanted: false, present: true, store: 'symlink',
        linkTarget: target,
        // 残留的来源按基准归属判断：来自预设的记 preset，其余（如接管后停用）记 manual，
        // 不再一律记成「预设引入」——那会让已接管的技能被误标成预设带来的。
        reason: externalLink ? 'external' : (ctx.baselineNames.has(name) ? 'preset' : 'manual'),
        offOverride, externalLink, alreadyInLibrary,
        preset: ctx.presetOf.get(name),
        skillId: owner ? `${name}@${owner.id}` : undefined, repo: owner?.id,
        dir: p, link: true, fromDir: ownDir, readVia: 'own',
        takenOver: !externalLink,
      });
    } else {
      const p = path.join(ownDir, name);
      if (!isSkillDir(p)) continue; // 只把真正的技能目录视作自带
      const meta = readSkill(p);
      rows.push({
        name, title: meta?.name ?? name, description: meta?.description,
        source: 'owned', wanted: false, present: true, store: 'own', reason: 'own',
        dir: p, link: false, fromDir: ownDir, readVia: 'own',
      });
    }
  }

  // 4) 额外读取的共享标准目录：**只做展示**，既不进期望集、也不参与归集 / 接管
  //    （归集预览只扫自身 globalDir，所以这些条目不会出现在可归集清单里；这里也不给任何操作）。
  //    同名技能以自身目录为准（前面已收录），共享目录只补自身目录没有的。
  const seen = new Set(rows.map((r) => r.name));
  for (const sharedDir of sharedReadDirs(def, ownDir)) {
    if (!fs.existsSync(sharedDir)) continue;
    for (const ent of fs.readdirSync(sharedDir, { withFileTypes: true })) {
      const name = ent.name;
      if (name.startsWith('.') || seen.has(name)) continue;
      const p = path.join(sharedDir, name);
      const isLink = ent.isSymbolicLink();
      // 共享目录里同样只认「软链」或「真正的技能目录」，避免把无关文件当技能
      if (!isLink && !isSkillDir(p)) continue;
      seen.add(name);
      const target = isLink ? linkTo(p) : undefined;
      // 与自身目录同一口径：来源只按目标实际落在哪个已登记库判定，猜不到就不给来源
      const owner = libraryOfLinkTarget(cfg, target, sharedDir);
      rows.push({
        name, title: isLink ? name : (readSkill(p)?.name ?? name),
        description: readSkill(p)?.description,
        source: 'owned', wanted: false, present: true,
        store: isLink ? 'symlink' : 'own',
        linkTarget: target,
        reason: 'shared',
        preset: ctx.presetOf.get(name),
        skillId: owner ? `${name}@${owner.id}` : undefined, repo: owner?.id,
        dir: p, link: isLink, fromDir: sharedDir, readVia: 'shared',
      });
    }
  }

  return rows.sort((a, b) => Number(b.wanted) - Number(a.wanted) || a.name.localeCompare(b.name));
}

/** 期望集里的技能名集合（避免在循环里反复展开 Map 造成 O(n²)） */
function seenNames(desired: Map<string, Skill>): Set<string> {
  const set = new Set<string>();
  for (const s of desired.values()) set.add(s.name);
  return set;
}

/** 判断目录是否为带 SKILL.md 的技能目录 */
function isSkillDir(p: string): boolean {
  try {
    return fs.existsSync(path.join(p, 'SKILL.md'));
  } catch { return false; }
}
