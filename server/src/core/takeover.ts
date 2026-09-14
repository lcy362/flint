import fs from 'node:fs';
import path from 'node:path';
import { ConfigStore } from '../config/store.js';
import { listAgents, expandTilde } from './agents.js';
import { symlinkSkill } from './sync.js';

export interface TakeoverResult {
  agentKey: string;
  name: string;
  linked: boolean;
  reason?: string;
  /** true=需要用户显式 confirm 后才能执行 */
  needConfirm?: boolean;
}

/**
 * 接管：把 agent 目录里的技能条目替换为「指向仓库内同名副本的软链」。
 *
 * 与归集（collect）的分工：归集=把内容复制进仓库（不动 agent 目录）；接管=把源位置那条换成软链，
 * 让 Agent 直接读仓库里的那一份，从此只有一份本体。两者常连做：先归集、再接管。
 *
 * 安全前提：
 * 1. 调用方先归集（智能体页的归集弹窗就是「归集 → 接管」顺序执行），内容已进仓库，
 *    因此移除本目录的条目不会丢内容；本函数只守住下面两条底线。
 * 2. 仓库副本必须存在（不存在直接拒绝，"请先归集入库"）。
 * 3. 本目录条目就是仓库本体时（例如 agent 技能目录整体软链到仓库）不做任何事 —— 否则删的正是唯一本体。
 * 4. 本目录条目是软链时，移除的只是这条链接，它指向的目标目录不受影响（失效软链同理）。
 *
 * 只动 agent 目录这一侧，不触碰仓库里的副本；需显式 confirm（确认前返回 needConfirm）。
 */
export function takeover(cfg: ConfigStore, agentKey: string, name: string, repoId?: string, confirm?: boolean): TakeoverResult {
  const a = listAgents(cfg.data).find((x) => x.key === agentKey);
  if (!a?.installed) return { agentKey, name, linked: false, reason: `agent 未安装: ${agentKey}` };
  const repo = repoId ? cfg.data.repos.find((r) => r.id === repoId) : undefined;
  if (repoId && !repo) return { agentKey, name, linked: false, reason: `repo 不存在: ${repoId}` };

  const skillsRoot = path.join(expandTilde(repo?.path ?? a.globalDir), 'skills');
  const target = path.join(skillsRoot, name); // 仓库内副本
  const src = path.join(a.globalDir, name);   // agent 目录里的条目

  if (!fs.existsSync(target)) return { agentKey, name, linked: false, reason: `仓库副本 ${name} 不存在，请先归集入库` };

  const srcStat = fs.lstatSync(src, { throwIfNoEntry: false });
  if (!srcStat) return { agentKey, name, linked: false, reason: `agent 目录 ${name} 不存在` };

  const targetReal = fs.realpathSync(target);

  if (srcStat.isSymbolicLink()) {
    // 已指向该副本 → 幂等成功；指向别处（含失效软链）也只是换掉这条链接，不会丢内容
    let real: string | undefined;
    try { real = fs.realpathSync(src); } catch { /* 失效软链：没有内容可丢，直接换掉 */ }
    if (real === targetReal) return { agentKey, name, linked: true, needConfirm: false };
  } else {
    // 真实目录：它本身就是仓库本体时不做任何事，否则删的正是唯一本体
    try {
      if (fs.realpathSync(src) === targetReal) {
        return { agentKey, name, linked: false, reason: `agent 目录里的 ${name} 就是仓库本体，无需接管` };
      }
    } catch { /* ignore */ }
  }

  if (!confirm) {
    return { agentKey, name, linked: false, needConfirm: true, reason: '接管会把 agent 目录里的条目替换为指向仓库副本的软链，请确认' };
  }

  symlinkSkill(src, target);
  cfg.save();
  return { agentKey, name, linked: true, needConfirm: false };
}
