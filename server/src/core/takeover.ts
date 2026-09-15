import fs from 'node:fs';
import path from 'node:path';
import { ConfigStore } from '../config/store.js';
import { listAgents, repoSkillRoot } from './agents.js';
import { symlinkSkill } from './sync.js';
import { t } from '../i18n/index.js';

export interface TakeoverResult {
  /** 来源标识：`agent:<key>` / `project:<id>` */
  ref: string;
  name: string;
  linked: boolean;
  reason?: string;
  /** true=需要用户显式 confirm 后才能执行 */
  needConfirm?: boolean;
}

/**
 * 接管来源：技能条目所在的目录（Agent 全局技能目录 / 项目 .agents/skills）。
 * 接管只动这个目录里的一条，不触碰仓库副本。
 */
export interface TakeoverSource {
  ref: string;
  /** 展示名（Agent 名 / 项目路径） */
  name: string;
  dir: string;
}

/**
 * 接管：把来源目录里的技能条目替换为「指向仓库内同名副本的软链」。
 *
 * 与归集（collect）的分工：归集=把内容复制进仓库（不动来源目录）；接管=把源位置那条换成软链，
 * 让使用方直接读仓库里的那一份，从此只有一份本体。两者常连做：先归集、再接管。
 *
 * 安全前提：
 * 1. 调用方先归集（归集弹窗就是「归集 → 接管」顺序执行），内容已进仓库，
 *    因此移除来源目录的条目不会丢内容；本函数只守住下面两条底线。
 * 2. 仓库副本必须存在（不存在直接拒绝，"请先归集入库"）。
 * 3. 来源条目就是仓库本体时（例如整个技能目录软链到仓库）不做任何事 —— 否则删的正是唯一本体。
 * 4. 来源条目是软链时，移除的只是这条链接，它指向的目标目录不受影响（失效软链同理）。
 *
 * 只动来源目录这一侧，不触碰仓库里的副本；需显式 confirm（确认前返回 needConfirm）。
 */
export function takeoverInSource(
  cfg: ConfigStore,
  source: TakeoverSource,
  name: string,
  repoId?: string,
  confirm?: boolean,
): TakeoverResult {
  const repo = repoId ? cfg.data.repos.find((r) => r.id === repoId) : undefined;
  if (repoId && !repo) return { ref: source.ref, name, linked: false, reason: t('takeover.repoMissing', { id: repoId }) };

  const skillsRoot = repo ? repoSkillRoot(repo) : source.dir; // 仓库 skill 根（honors repo.root）
  const target = path.join(skillsRoot, name); // 仓库内副本
  const src = path.join(source.dir, name);    // 来源目录里的条目

  if (!fs.existsSync(target)) return { ref: source.ref, name, linked: false, reason: t('takeover.copyMissing', { name }) };

  const srcStat = fs.lstatSync(src, { throwIfNoEntry: false });
  if (!srcStat) return { ref: source.ref, name, linked: false, reason: t('takeover.srcMissing', { name }) };

  const targetReal = fs.realpathSync(target);

  if (srcStat.isSymbolicLink()) {
    // 已指向该副本 → 幂等成功；指向别处（含失效软链）也只是换掉这条链接，不会丢内容
    let real: string | undefined;
    try { real = fs.realpathSync(src); } catch { /* 失效软链：没有内容可丢，直接换掉 */ }
    if (real === targetReal) return { ref: source.ref, name, linked: true, needConfirm: false };
  } else {
    // 真实目录：它本身就是仓库本体时不做任何事，否则删的正是唯一本体
    try {
      if (fs.realpathSync(src) === targetReal) {
        return { ref: source.ref, name, linked: false, reason: t('takeover.isRepoBody', { name }) };
      }
    } catch { /* ignore */ }
  }

  if (!confirm) {
    return { ref: source.ref, name, linked: false, needConfirm: true, reason: t('takeover.needConfirm') };
  }

  symlinkSkill(src, target);
  cfg.save();
  return { ref: source.ref, name, linked: true, needConfirm: false };
}

/** 兼容入口：接管某个已安装 agent 全局目录里的技能条目 */
export function takeover(cfg: ConfigStore, agentKey: string, name: string, repoId?: string, confirm?: boolean): TakeoverResult {
  const a = listAgents(cfg.data).find((x) => x.key === agentKey);
  if (!a?.installed) return { ref: `agent:${agentKey}`, name, linked: false, reason: t('takeover.agentNotInstalled', { key: agentKey }) };
  return takeoverInSource(cfg, { ref: `agent:${agentKey}`, name: a.name, dir: a.globalDir }, name, repoId, confirm);
}
