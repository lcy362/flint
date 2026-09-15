import fs from 'node:fs';
import path from 'node:path';
import { ConfigStore } from '../config/store.js';
import { Repo } from '../config/types.js';
import { scanDir } from './scanner.js';
import { listAgents, repoSkillRoot, isLinkInRepo } from './agents.js';
import { t } from '../i18n/index.js';

export interface AgentCollectItem {
  name: string;
  description?: string;
  tags: string[];
  /** skill 本体目录（确认页展示「什么路径写入哪里」用） */
  dir: string;
  /** 是否已存在于目标仓库（重名将去重跳过） */
  exists: boolean;
  /** skill 本体是否为软链（区别于真实目录存储） */
  symlink: boolean;
  /** 软链解析后的真实目标（绝对路径）；悬空软链时为 readlink 原始值 */
  linkTarget?: string;
  /** 软链目标是否落在目标仓库内（如此前「接管」生成的仓库本体软链） */
  inRepo?: boolean;
}
export interface AgentCollectPreview {
  /** 来源标识：`agent:<key>` / `project:<id>`（前端据此匹配） */
  sourceRef: string;
  /** 兼容 agent 上下文的旧字段（= agent key） */
  agentKey: string;
  agentName: string;
  installedDir: string;
  items: AgentCollectItem[];
}
export interface CollectResult { collected: string[]; skipped: string[] }

/**
 * 归集来源：任何「技能实际所在、可被归集进仓库」的目录。
 * - Agent 全局技能目录（可能嵌套，layout='nested'）；
 * - 项目的 .agents/skills（平铺，与项目技能行口径一致，layout='flat'）。
 *
 * ref 既作为扫描时的 source，也作为前端匹配标识，如 `agent:claude` / `project:0`。
 */
export interface CollectSource {
  ref: string;
  /** 展示名（Agent 名 / 项目路径） */
  name: string;
  /** 技能所在目录 */
  dir: string;
  layout: 'flat' | 'nested';
}

/** 构造 Agent 技能目录来源（归集预览只扫自身 globalDir，不扫共享标准目录） */
export function agentCollectSource(key: string, name: string, dir: string): CollectSource {
  return { ref: `agent:${key}`, name, dir, layout: 'nested' };
}

/** 构造项目技能目录来源：项目共享本体固定落在 <project>/.agents/skills 下 */
export function projectCollectSource(projectPath: string, id: number): CollectSource {
  return { ref: `project:${id}`, name: projectPath, dir: path.join(projectPath, '.agents', 'skills'), layout: 'flat' };
}

/**
 * 预览：列出某个来源目录内的 skill，标注是否已存在于目标仓库，
 * 并区分本体是真实目录还是软链（含指向）。仅扫描，绝不写盘、不动来源目录。
 *
 * `inRepo` 是**仓库口径**的「被本仓库接管」：只有指向「这个仓库」的软链才算；
 * 指向别的仓库或仓库之外的软链都不算（后者按自带技能处理，可归集、可接管）。
 */
export function previewCollectSource(repo: Repo, source: CollectSource): AgentCollectItem[] {
  const root = repoSkillRoot(repo);
  if (!fs.existsSync(source.dir)) return [];
  return scanDir(source.dir, source.ref, source.layout).map((s) => {
    const exists = fs.existsSync(path.join(root, s.name));
    const st = fs.lstatSync(s.dir, { throwIfNoEntry: false });
    const symlink = st?.isSymbolicLink() ?? false;
    let linkTarget: string | undefined;
    if (symlink) {
      try { linkTarget = fs.realpathSync(s.dir); }
      catch {
        // 悬空软链：realpath 失败，退回 readlink 原始值供展示
        try { linkTarget = fs.readlinkSync(s.dir); } catch { /* ignore */ }
      }
    }
    const inRepo = symlink ? isLinkInRepo(repo, linkTarget, path.dirname(s.dir)) : undefined;
    return {
      name: s.name,
      dir: s.dir,
      description: s.description,
      tags: s.tags,
      exists,
      symlink,
      linkTarget,
      inRepo,
    };
  });
}

/**
 * 预览所有「已安装」agent 目录内的 skill（技能库「从 Agent 归集」用）。
 * 项目来源不在其中：它以项目为单位单独预览，避免污染按 Agent 分组的确认页。
 */
export function previewCollect(cfg: ConfigStore, repo: Repo): AgentCollectPreview[] {
  const out: AgentCollectPreview[] = [];
  for (const a of listAgents(cfg.data)) {
    if (!a.installed) continue;
    out.push({
      sourceRef: `agent:${a.key}`,
      agentKey: a.key,
      agentName: a.name,
      installedDir: a.globalDir,
      items: previewCollectSource(repo, agentCollectSource(a.key, a.name, a.globalDir)),
    });
  }
  return out;
}

/**
 * 从某个来源目录「收集归拢」skill 到目标仓库。
 * 仅把 skill 本体复制进仓库 skills/，绝不动来源目录里的技能列表；相同名字已存在则去重跳过，
 * 除非名字出现在 replaceNames（用户在确认页明确选择用来源版本覆盖仓库副本）。
 * names 为空表示收集该目录下全部未存在的 skill。
 */
export function collectFromSource(
  cfg: ConfigStore,
  repo: Repo,
  source: CollectSource,
  names?: string[],
  replaceNames?: string[],
): CollectResult {
  const res: CollectResult = { collected: [], skipped: [] };
  if (!fs.existsSync(source.dir)) { res.skipped.push(t('collect.sourceMissing', { name: source.name })); return res; }
  const skillsRoot = repoSkillRoot(repo);
  fs.mkdirSync(skillsRoot, { recursive: true });
  const found = scanDir(source.dir, source.ref, source.layout);
  const want = names && names.length ? found.filter((s) => names.includes(s.name)) : found;
  for (const s of want) {
    // 解引用源软链：归集的是真实位置的内容，而非把链接本身复制进仓库
    let srcReal: string;
    try { srcReal = fs.realpathSync(s.dir); }
    catch (e) { res.skipped.push(t('collect.srcUnreachable', { name: s.name, msg: (e as Error).message })); continue; }
    const dest = path.join(skillsRoot, s.name);
    if (fs.existsSync(dest)) {
      if (replaceNames?.includes(s.name)) {
        // 防自毁：源本体与仓库副本是同一文件（如目录内软链指向仓库）时禁止覆盖，
        // 否则 rm 掉的正是软链指向的内容，来源与仓库一起损坏
        let same = false;
        try { same = srcReal === fs.realpathSync(dest); } catch { /* ignore */ }
        if (same) { res.skipped.push(t('collect.sameBody', { name: s.name })); continue; }
        try { fs.rmSync(dest, { recursive: true, force: true }); }
        catch (e) { res.skipped.push(t('collect.overwriteFailed', { name: s.name, msg: (e as Error).message })); continue; }
      } else { res.skipped.push(t('collect.existsSkip', { name: s.name })); continue; }
    }
    try {
      fs.cpSync(srcReal, dest, { recursive: true });
      res.collected.push(s.name);
    } catch (e) { res.skipped.push(t('collect.copyFailed', { name: s.name, msg: (e as Error).message })); }
  }
  cfg.save();
  return res;
}

/** 兼容入口：从某个已安装 agent 的全局目录归集 */
export function collectAgentSkill(
  cfg: ConfigStore,
  repo: Repo,
  agentKey: string,
  names?: string[],
  replaceNames?: string[],
): CollectResult {
  const a = listAgents(cfg.data).find((x) => x.key === agentKey);
  if (!a?.installed) return { collected: [], skipped: [t('collect.agentNotInstalled', { key: agentKey })] };
  return collectFromSource(cfg, repo, agentCollectSource(agentKey, a.name, a.globalDir), names, replaceNames);
}
