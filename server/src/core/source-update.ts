import fs from 'node:fs';
import path from 'node:path';
import { ConfigStore } from '../config/store.js';
import type { Repo, SkillMeta, SourceKind } from '../config/types.js';
import { repoSkillRoot } from './agents.js';
import { SKILL_FILE } from './skill.js';
import { gitText } from './git.js';

/**
 * F4 · 可追踪来源（来源 / 版本 / 陈旧 / 刷新）。
 *
 * 理念：来源更新只从**本地** git 仓库或外部目录取，绝不联网、绝不写来源；
 * 刷新是**用户显式动作**，不自动跟随。来源可定位时才登记 sourceRef，
 * 否则保持只读展示（origin 文案），不打扰。
 */

/** 向上查找最近 .git 目录，返回 git 仓库根；找不到返回 undefined */
export function findGitRoot(start: string): string | undefined {
  let cur = path.resolve(start);
  for (;;) {
    if (fs.existsSync(path.join(cur, '.git'))) return cur;
    const parent = path.dirname(cur);
    if (parent === cur) return undefined;
    cur = parent;
  }
}

/**
 * 探测源技能目录的来源分类：
 * - 落在某个本地 git 仓库内 → git，sourceRef 为技能目录绝对路径（git 根运行时再推导）
 * - 否则 → dir
 * 解引用软链，保证记录的是真实内容位置。
 */
export function probeSource(skillSourceDir: string): { sourceType?: SourceKind; sourceRef?: string } {
  if (!skillSourceDir) return {};
  let abs: string;
  try { abs = fs.realpathSync(skillSourceDir); } catch { return {}; }
  if (findGitRoot(abs)) return { sourceType: 'git', sourceRef: abs };
  return { sourceType: 'dir', sourceRef: abs };
}

/** 收编 / 导入落副本时，记录可追踪来源（仅来源可定位时写，冲突旧 sourceRef 视为更新） */
export function recordIngestedSource(cfg: ConfigStore, repoId: string, name: string, srcSkillDir: string): void {
  const probe = probeSource(srcSkillDir);
  if (!probe.sourceRef) return;
  const id = `${name}@${repoId}`;
  const meta = cfg.data.skillMeta[id] ?? { tags: [] };
  meta.sourceRef = probe.sourceRef;
  meta.sourceType = probe.sourceType;
  meta.takenAt = new Date().toISOString();
  cfg.data.skillMeta[id] = meta;
}

function mtime(file: string): number | undefined {
  try { return fs.statSync(file).mtimeMs; } catch { return undefined; }
}

/**
 * 判断仓库副本是否「来源有更新」。
 * 无来源 / git 读取失败 / 源目录缺失 → undefined（不判定，避免误标）。
 * git 源：比较来源最后一个提交时间与 takenAt；dir 源：比较源与副本的 SKILL.md mtime。
 */
export async function detectStale(repoDir: string, meta?: SkillMeta): Promise<boolean | undefined> {
  if (!meta?.sourceRef) return undefined;
  if (meta.sourceType === 'git') {
    if (!fs.existsSync(meta.sourceRef)) return undefined;
    const root = findGitRoot(meta.sourceRef);
    if (!root) return undefined;
    // git log 只看该技能在仓库内的相对路径，避免整个仓库的提交干扰。
    // 走异步执行器：绝不用 spawnSync（会阻塞事件循环）。
    const out = await gitText(root, ['log', '-1', '--format=%cI', '--', path.relative(root, meta.sourceRef)], 5000);
    if (!out) return undefined;
    const srcTime = Date.parse(out);
    if (Number.isNaN(srcTime)) return undefined;
    const taken = meta.takenAt ? Date.parse(meta.takenAt) : undefined;
    return taken !== undefined ? srcTime > taken : undefined;
  }
  if (meta.sourceType === 'dir') {
    const a = mtime(path.join(meta.sourceRef, SKILL_FILE));
    const b = mtime(path.join(repoDir, SKILL_FILE));
    if (a === undefined || b === undefined) return undefined;
    return a > b;
  }
  return undefined;
}

export interface RefreshResult { refreshed: boolean; reason?: string }

/**
 * 从已登记来源把仓库副本覆盖为来源当前内容（来源只读、不写）。
 * 覆盖前用「复制到临时目录 → 替换」避免半途损坏；失败回滚保留原副本。
 */
export function refreshSkill(cfg: ConfigStore, repo: Repo, name: string): RefreshResult {
  const id = `${name}@${repo.id}`;
  const meta = cfg.data.skillMeta[id];
  if (!meta?.sourceRef) return { refreshed: false, reason: 'no-source' };
  if (!fs.existsSync(meta.sourceRef)) return { refreshed: false, reason: 'missing-source' };
  const dest = path.join(repoSkillRoot(repo), name);
  if (!fs.existsSync(dest)) return { refreshed: false, reason: 'missing-dest' };
  // 防自毁：源与仓库副本是同一文件时禁止覆盖
  try { if (fs.realpathSync(meta.sourceRef) === fs.realpathSync(dest)) return { refreshed: false, reason: 'same-body' }; } catch { /* ignore */ }
  const tmp = path.join(path.dirname(dest), `.${name}.tmp-${Date.now()}`);
  try {
    fs.cpSync(meta.sourceRef, tmp, { recursive: true });
    try { fs.rmSync(dest, { recursive: true, force: true }); } catch { /* ignore */ }
    fs.renameSync(tmp, dest);
  } catch (e) {
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* ignore */ }
    return { refreshed: false, reason: 'copy-failed' };
  }
  meta.takenAt = new Date().toISOString();
  cfg.save();
  return { refreshed: true };
}