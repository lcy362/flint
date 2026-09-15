import fs from 'node:fs';
import path from 'node:path';
import { ConfigStore } from '../config/store.js';
import { Skill } from './skill.js';
import { readSkill } from './skill.js';
import { effectiveTags } from './tags.js';
import { listAgents, resolveProjectDir, findAgentDef, isManagedLinkTarget } from './agents.js';
import { expandTilde, repoSkillRoot } from './agents.js';
import { dirsEqual } from './sync.js';
import { ProjectLink } from '../config/types.js';
import { t } from '../i18n/index.js';

/** 项目技能目录的清单文件名（目录 = INDEX.md，被管理/已安装的 skill 登记于此） */
export const INDEX_NAME = 'INDEX.md';

/**
 * 依据当前被管理的 skill 重建 .agents/skills/INDEX.md。
 * 注意：INDEX.md 是**同步产物**（给人/git 看的目录清单），绝不参与期望集推导——
 * 期望集只能由 config（标签 + explicit）推导，避免形成第二事实源（PRD C1/C2）。
 */
export function writeIndex(agentsRoot: string, managed: { name: string; title?: string; description?: string }[]): void {
  fs.mkdirSync(agentsRoot, { recursive: true });
  const lines: string[] = [];
  for (const s of [...managed].sort((a, b) => a.name.localeCompare(b.name))) {
    const desc = s.description ? ` — ${s.description.replace(/\s+/g, ' ').trim()}` : '';
    lines.push(`- **[${s.title || s.name}](${s.name}/SKILL.md)**${desc}`);
  }
  if (lines.length) lines.push('');
  fs.writeFileSync(path.join(agentsRoot, INDEX_NAME), lines.join('\n'), 'utf-8');
}

/**
 * 读取上一次同步写入的 INDEX.md，得到「曾经由本工具投放」的技能名。
 * 仅用于安全回收残留副本，绝不参与期望集推导（期望集只能由 config 推导）。
 */
function readIndexNames(agentsRoot: string): Set<string> {
  const names = new Set<string>();
  try {
    const text = fs.readFileSync(path.join(agentsRoot, INDEX_NAME), 'utf-8');
    for (const m of text.matchAll(/\]\(([^)/]+)\/SKILL\.md\)/g)) names.add(m[1]);
  } catch { /* 首次同步：无历史记录，视为没有受管项 */ }
  return names;
}

/**
 * 项目的期望集（PJ-01）：
 *  标签命中 ∪ 逐个开启 − 逐个关闭
 * 纯由 config 推导，与文件落地解耦。
 */
/** explicit 记录可能是完整 id(name@来源) 或裸技能名，两者都视为命中（与 agent 期望解析对齐） */
function idOrName(set: Set<string>, s: Skill): boolean {
  return set.has(s.id) || set.has(s.name);
}

export function projectedSkills(cfg: ConfigStore, proj: ProjectLink, allSkills: Skill[]): Skill[] {
  const tagSet = new Set(proj.tags);
  const on = new Set(proj.explicitOn ?? []);
  const off = new Set(proj.explicitOff ?? []);
  const out: Skill[] = [];
  const seen = new Set<string>();
  const add = (s: Skill) => { if (!seen.has(s.name)) { seen.add(s.name); out.push(s); } };
  for (const s of allSkills) {
    const tags = effectiveTags(cfg.data, s);
    const inTag = tagSet.size > 0 && tags.some((t) => tagSet.has(t));
    if (!(inTag || idOrName(on, s))) continue;
    if (idOrName(off, s)) continue;
    add(s);
  }
  return out;
}

export interface ProjectSkillRow {
  skillId?: string;
  name: string;
  title?: string;
  description?: string;
  source: 'managed' | 'owned';
  wanted: boolean;
  present: boolean;
  /** symlink = 已接管（指向仓库副本的软链）；copy = 本工具复制的副本；own = 自带本体；pending = 待部署 */
  store: 'symlink' | 'copy' | 'pending' | 'own';
  /** 已接管：该条目是指向任一自有仓库内技能的软链（系统口径，指向仓库外的不算） */
  takenOver?: boolean;
  /** 来源原因：标签命中 / 逐个开启 / 自带 */
  reason: 'tag' | 'manual' | 'own';
  /** 标签命中但被逐个关闭 */
  offOverride?: boolean;
  /** 关闭该技能时应走哪个叠加集：'off'=加入 explicitOff（标签命中成员）；'on'=移出 explicitOn */
  disableVia?: 'off' | 'on';
  repo?: string;
  dir?: string;
}

/** 读取软链原始目标；非软链或读不到时返回 undefined */
function linkTo(p: string): string | undefined {
  try { return fs.readlinkSync(p); } catch { return undefined; }
}

/** 构建项目技能行：期望集（并按项目配置覆盖）∪ 目录已存在。与 agent 技能行逻辑对齐。 */
export function projectSkillRows(cfg: ConfigStore, proj: ProjectLink, allSkills: Skill[]): ProjectSkillRow[] {
  const onIds = new Set(proj.explicitOn ?? []);
  const offIds = new Set(proj.explicitOff ?? []);
  const agentsRoot = path.join(proj.path, '.agents', 'skills');
  const presentNames = new Set<string>();
  const presentIsLink = new Map<string, boolean>();
  if (fs.existsSync(agentsRoot)) {
    for (const e of fs.readdirSync(agentsRoot, { withFileTypes: true })) {
      if (e.name === INDEX_NAME) continue; // 内部清单，不视为技能
      presentNames.add(e.name);
      presentIsLink.set(e.name, e.isSymbolicLink());
    }
  }
  const rows: ProjectSkillRow[] = [];
  const desired = projectedSkills(cfg, proj, allSkills);
  const desiredNames = new Set(desired.map((s) => s.name));

  // 1) 期望集行
  for (const s of desired) {
    const inTag = effectiveTags(cfg.data, s).some((t) => (proj.tags ?? []).includes(t));
    const inOn = onIds.has(s.id) || onIds.has(s.name);
    const exists = presentNames.has(s.name);
    const isLink = presentIsLink.get(s.name) ?? false;
    // present 保持原语义（真实目录才算「已落地副本」），供可补入清单判断
    const present = exists && !isLink;
    const off = offIds.has(s.id) || offIds.has(s.name);
    const entry = path.join(agentsRoot, s.name);
    const linkTarget = exists && isLink ? linkTo(entry) : undefined;
    rows.push({
      skillId: s.id, name: s.name, title: s.name, description: s.description,
      source: 'managed', wanted: true, present,
      // 已接管（软链）→ symlink；已落地的真实副本 → copy；未落地 → pending
      store: !exists ? 'pending' : isLink ? 'symlink' : 'copy',
      takenOver: !!linkTarget && isManagedLinkTarget(cfg.data, linkTarget, agentsRoot),
      reason: inOn ? 'manual' : 'tag',
      offOverride: inTag && off ? true : undefined,
      disableVia: inTag ? 'off' : 'on',
      repo: s.source,
      dir: exists ? entry : undefined,
    });
  }

  // 2) 目录中存在但不在期望集（残留 / 自带）
  for (const name of presentNames) {
    if (desiredNames.has(name)) continue;
    const isLink = presentIsLink.get(name) ?? false;
    if (isLink) continue; // 软链不视作项目内技能，略过
    const p = path.join(agentsRoot, name);
    const meta = readSkill(p);
    rows.push({
      name, title: meta?.name ?? name, description: meta?.description,
      source: 'owned', wanted: false, present: true, store: 'own',
      reason: 'own', dir: p,
    });
  }

  return rows.sort((a, b) => Number(b.wanted) - Number(a.wanted) || a.name.localeCompare(b.name));
}

/** 可从资产库补入本项目的候选：不在期望集、不在目录、也未被逐个关闭 */
export function projectAddable(cfg: ConfigStore, proj: ProjectLink, allSkills: Skill[]): { id: string; name: string; repo: string }[] {
  const desired = new Set(projectedSkills(cfg, proj, allSkills).map((s) => s.name));
  const present = projectSkillRows(cfg, proj, allSkills).filter((r) => r.present).map((r) => r.name);
  const off = new Set(proj.explicitOff ?? []);
  const presentSet = new Set(present);
  const seen = new Set<string>();
  const out: { id: string; name: string; repo: string }[] = [];
  for (const s of allSkills) {
    if (seen.has(s.name)) continue; // 同一技能跨多个来源只列一次（首见即入）
    if (desired.has(s.name) || presentSet.has(s.name) || idOrName(off, s)) continue;
    seen.add(s.name);
    out.push({ id: s.id, name: s.name, repo: s.source });
  }
  return out;
}

export interface ProjectSyncResult {
  project: string;
  copied: string[];
  removed: string[];
  agentLinks: { agent: string; created: string[] }[];
  errors: string[];
}

/** 会以「项目目录软链 → .agents/skills」方式投放的 agent（有 project 目录且非复制模式） */
export function linkableAgents(cfg: ConfigStore) {
  return listAgents(cfg.data).filter((a) => a.project && cfg.data.agents[a.key]?.sync !== 'copy');
}

/** 某 agent 的项目技能目录 */
function agentLinkDir(cfg: ConfigStore, a: { key: string }, projectPath: string): string | undefined {
  const def = findAgentDef(cfg.data, a.key);
  if (!def) return undefined;
  return resolveProjectDir(def, projectPath, cfg.data.agents[a.key]?.projectDir);
}

/** 判断 p 是否为指向 target 的目录软链（.agents/skills 即"已投放"，为该 agent 的实际目录结构） */
function isSymlinkTo(p: string, target: string): boolean {
  try {
    if (fs.lstatSync(p).isSymbolicLink() && fs.existsSync(p)) return fs.realpathSync(p) === fs.realpathSync(target);
  } catch { /* skip */ }
  return false;
}

/** 从实际目录结构读取本项目已投放的 agent（项目技能目录为软链指向 .agents/skills 者），无需配置 */
export function deployedAgents(cfg: ConfigStore, projectPath: string): string[] {
  const target = path.join(projectPath, '.agents', 'skills');
  if (!fs.existsSync(target)) return [];
  const out: string[] = [];
  for (const a of linkableAgents(cfg)) {
    const linkDir = agentLinkDir(cfg, a, projectPath);
    if (linkDir && isSymlinkTo(linkDir, target)) out.push(a.key);
  }
  return out;
}

/**
 * 让项目技能目录软链与期望集合对齐（期望集=本次调用传入的 wantedAgents，缺省=沿用当前已投放者）。
 * 依据实际目录结构建/撤软链，不写任何配置。返回新建的 agent key 列表。
 */
export function ensureAgentLinks(cfg: ConfigStore, projectPath: string, wanted?: Set<string>): string[] {
  const created: string[] = [];
  const target = path.join(projectPath, '.agents', 'skills');
  fs.mkdirSync(target, { recursive: true });
  const setMode = !!wanted;
  for (const a of linkableAgents(cfg)) {
    const linkDir = agentLinkDir(cfg, a, projectPath);
    if (!linkDir) continue;
    const already = isSymlinkTo(linkDir, target);
    const want = setMode ? wanted!.has(a.key) : already;
    if (want) {
      if (already) continue; // 已投放且指向正确
      fs.mkdirSync(path.dirname(linkDir), { recursive: true });
      if (fs.existsSync(linkDir) && !fs.lstatSync(linkDir).isSymbolicLink()) {
        continue; // 真实目录：不覆盖，避免误删用户手动放置的 skill
      }
      if (fs.existsSync(linkDir)) fs.rmSync(linkDir, { recursive: true, force: true });
      fs.symlinkSync(target, linkDir, 'dir');
      created.push(a.key);
    } else if (already) {
      // setMode 下不再需要该 agent → 撤除软链（实际目录结构回到"未投放"）
      fs.rmSync(linkDir, { recursive: true, force: true });
    }
  }
  return created;
}

/**
 * 项目级同步：
 * 1) 把项目期望集（标签匹配 ∪ 逐个开启 − 逐个关闭）的 skill 本体复制到 <project>/.agents/skills（PJ-02）
 * 2) 让项目投放的 agent 的项目技能目录软链到 .agents（PJ-03：一套本体、多 Agent 共享）
 */
export function syncProject(cfg: ConfigStore, projectPath: string, allSkills: Skill[], wantedAgents?: Set<string>): ProjectSyncResult {
  const res: ProjectSyncResult = { project: projectPath, copied: [], removed: [], agentLinks: [], errors: [] };
  const proj = cfg.data.projects.find((p) => path.resolve(p.path) === path.resolve(projectPath));
  if (!proj) { res.errors.push(t('projects.notRegistered')); return res; }

  const desired = projectedSkills(cfg, proj, allSkills);
  const agentsRoot = path.join(projectPath, '.agents', 'skills');
  fs.mkdirSync(agentsRoot, { recursive: true });
  const seen = new Set<string>();

  for (const s of desired) {
    seen.add(s.name);
    const dest = path.join(agentsRoot, s.name);
    const st = fs.lstatSync(dest, { throwIfNoEntry: false });
    if (st) {
      if (st.isSymbolicLink()) {
        // 已是指向该技能本体的软链（接管后的形态）→ 保持，不再复制出第二份
        try { if (fs.realpathSync(dest) === fs.realpathSync(s.dir)) continue; } catch { /* 失效软链，继续重建 */ }
      } else if (st.isDirectory()) {
        continue; // 真实目录视为已落地，保持幂等
      }
    }
    if (st) fs.rmSync(dest, { recursive: true, force: true });
    try {
      fs.cpSync(s.dir, dest, { recursive: true });
      res.copied.push(s.name);
    } catch (e) { res.errors.push(`${s.name}: ${(e as Error).message}`); }
  }

  // 清理 .agents 里「曾由本工具投放、现已不在期望集」的副本（仅 dir，不删软链）。
  // 以同步产物 INDEX.md 作为上一轮的投放记录：只回收本工具自己写入过的名字，
  // 用户手动放进来的自带技能从不出现在清单里，因此绝不会被同步误删。
  const prevManaged = readIndexNames(agentsRoot);
  for (const entry of fs.readdirSync(agentsRoot)) {
    if (seen.has(entry) || entry === INDEX_NAME) continue;
    if (!prevManaged.has(entry)) continue; // 自带内容：不归本工具管，保留
    const p = path.join(agentsRoot, entry);
    try {
      if (fs.lstatSync(p).isDirectory() && !fs.lstatSync(p).isSymbolicLink()) {
        fs.rmSync(p, { recursive: true, force: true });
        res.removed.push(entry);
      }
    } catch { /* skip */ }
  }

  // 项目级 agent 软链：以实际目录结构为准（wantedAgents 缺省=沿用当前已投放者）
  const created = ensureAgentLinks(cfg, projectPath, wantedAgents);
  for (const key of created) res.agentLinks.push({ agent: key, created: [...seen] });

  // 重建 INDEX.md（纯产物，供人/git 查阅；不参与期望集推导）
  const managed = desired
    .filter((s) => fs.existsSync(path.join(agentsRoot, s.name, 'SKILL.md')))
    .map((s) => ({ name: s.name, title: s.name, description: s.description }));
  writeIndex(agentsRoot, managed);
  return res;
}

export interface ProjectTakeoverResult {
  name: string;
  /** 已接管：项目里这条已是「仓库那一版」的真实副本，并登记为项目受管技能 */
  taken: boolean;
  reason?: string;
  /** true=需要用户显式 confirm 后才能执行 */
  needConfirm?: boolean;
}

/**
 * 项目技能「接管」——以**副本**形式，而非软链。
 *
 * 与 Agent 接管刻意不同：Agent 的技能目录是本机私有、不进 git，所以接管建一条指向仓库的软链
 * 即可省掉一份副本、只留一份本体；而项目的 .agents/skills 是**要提交、要跨机器共享**的本体
 * （PRD 流程四 PJ-02），里面若放一条指向 /Users/xxx 的绝对软链，队友拉下来必然是断链。
 *
 * 所以项目侧的「接管」= 把这条替换为「仓库同名副本的拷贝」并登记为项目受管技能：
 * 项目仍然自包含、可直接提交，同时从此由本工具按仓库维护它（仓库更新会同步进来）。
 *
 * 幂等：内容已与仓库副本一致时只补登记，不重写文件。
 */
export function takeoverProjectSkill(
  cfg: ConfigStore,
  proj: ProjectLink,
  repoId: string | undefined,
  name: string,
  confirm?: boolean,
): ProjectTakeoverResult {
  // 指定了仓库就用它；未指定则在所有已登记仓库里找同名副本
  const repos = repoId ? cfg.data.repos.filter((r) => r.id === repoId) : cfg.data.repos;
  if (repoId && repos.length === 0) return { name, taken: false, reason: t('takeover.repoMissing', { id: repoId }) };
  const src = repos.map((r) => path.join(repoSkillRoot(r), name)).find((p) => fs.existsSync(path.join(p, 'SKILL.md')));
  if (!src) return { name, taken: false, reason: t('takeover.copyMissing', { name }) };

  const agentsRoot = path.join(proj.path, '.agents', 'skills');
  const dest = path.join(agentsRoot, name);
  const st = fs.lstatSync(dest, { throwIfNoEntry: false });

  /** 登记为项目期望集成员：之后由本工具按仓库维护它 */
  const register = () => {
    const onSet = new Set(proj.explicitOn ?? []);
    const offSet = new Set(proj.explicitOff ?? []);
    onSet.add(name);
    offSet.delete(name);
    proj.explicitOn = onSet.size ? [...onSet] : undefined;
    proj.explicitOff = offSet.size ? [...offSet] : undefined;
    cfg.save();
  };

  // 幂等：项目里已是与仓库一致的真实副本 → 只补登记，不动文件
  if (st && st.isDirectory() && !st.isSymbolicLink() && dirsEqual(dest, src)) {
    register();
    return { name, taken: true };
  }

  if (!confirm) {
    return { name, taken: false, needConfirm: true, reason: t('projects.takeoverConfirm', { name }) };
  }

  fs.mkdirSync(agentsRoot, { recursive: true });
  if (st) fs.rmSync(dest, { recursive: true, force: true });
  fs.cpSync(src, dest, { recursive: true });
  register();
  return { name, taken: true };
}

export interface ProjectPushResult {
  project: string;
  repo: string;
  pushed: string[];
  skipped: string[];
  errors: string[];
}

/**
 * 回写仓库（PJ-05）：把项目 .agents/skills 中（被团队改动过的）skill 反向写回仓库本体。
 * 只覆盖仓库中同名 skill 的本体；仓库中没有该 skill 时按 opts.onlyExisting 决定是否新增。
 */
export function pushProjectToRepo(
  cfg: ConfigStore,
  projectPath: string,
  repoId?: string,
  names?: string[]
): ProjectPushResult {
  const proj = cfg.data.projects.find((p) => path.resolve(p.path) === path.resolve(projectPath));
  const agentsRoot = path.join(path.resolve(projectPath), '.agents', 'skills');
  const repo = cfg.data.repos.find((r) => r.id === repoId) ?? cfg.data.repos[0];
  const res: ProjectPushResult = {
    project: path.resolve(projectPath),
    repo: repo?.id ?? '',
    pushed: [], skipped: [], errors: [],
  };
  if (!proj) { res.errors.push(t('projects.notRegistered')); return res; }
  if (!repo) { res.errors.push(t('projects.noRepo')); return res; }
  if (!fs.existsSync(agentsRoot)) { res.errors.push(t('projects.noAgentsDir')); return res; }

  const skillsRoot = repoSkillRoot(repo);
  fs.mkdirSync(skillsRoot, { recursive: true });
  const want = names && names.length ? new Set(names) : undefined;

  for (const entry of fs.readdirSync(agentsRoot, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === INDEX_NAME) continue;
    const src = path.join(agentsRoot, entry.name);
    if (!fs.existsSync(path.join(src, 'SKILL.md'))) continue;
    if (want && !want.has(entry.name)) continue;
    const dest = path.join(skillsRoot, entry.name);
    if (!fs.existsSync(dest)) {
      res.skipped.push(t('projects.notInRepo', { name: entry.name }));
      continue;
    }
    try {
      fs.rmSync(dest, { recursive: true, force: true });
      fs.cpSync(src, dest, { recursive: true });
      res.pushed.push(entry.name);
    } catch (e) {
      res.errors.push(`${entry.name}: ${(e as Error).message}`);
    }
  }
  cfg.save();
  return res;
}

export function addProject(cfg: ConfigStore, projectPath: string, tags: string[]): string {
  const abs = path.resolve(projectPath);
  if (!fs.existsSync(abs)) throw new Error(t('projects.pathMissing', { path: abs }));
  if (cfg.data.projects.some((p) => path.resolve(p.path) === abs)) throw new Error(t('projects.alreadyRegistered'));
  cfg.data.projects.push({ path: abs, tags });
  cfg.save();
  return abs;
}
