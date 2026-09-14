import fs from 'node:fs';
import path from 'node:path';
import { ConfigStore } from '../config/store.js';
import { listAgents, expandTilde } from './agents.js';
import { symlinkSkill, dirsEqual } from './sync.js';

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
 * 与收集（collect）的分工：收集=把内容复制进仓库（不动源目录）；接管=把源位置那条换成软链，
 * 让 Agent 直接读仓库里的那一份，从此只有一份本体。
 *
 * 为什么删除源位置不会丢数据（安全前提按顺序检查）：
 * 1. 仓库副本必须存在（不存在直接拒绝，"请先归集入库"）；
 * 2. 本目录的内容必须与仓库副本**完全一致**（不一致直接拒绝）—— 因此删掉本目录那条时，
 *    内容必然已经在仓库里，不存在"仓库里没有的那份被删掉"的情况；
 * 3. 本目录那条本身就是仓库本体时（例如 agent 技能目录整体软链到仓库）不做任何事，
 *    否则删的正是唯一本体；
 * 4. 本目录那条是软链时，删除的只是这条链接，它指向的目标目录不受影响。
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

  let srcReal: string;
  try { srcReal = fs.realpathSync(src); }
  catch { return { agentKey, name, linked: false, reason: `agent 目录的 ${name} 是失效软链，请先修复或删除` }; }
  const targetReal = fs.realpathSync(target);

  // 已经是指向该副本的软链 → 幂等成功
  if (srcStat.isSymbolicLink() && srcReal === targetReal) return { agentKey, name, linked: true, needConfirm: false };

  // 本目录这条就是仓库本体：无需接管，动了反而会删掉唯一本体
  if (!srcStat.isSymbolicLink() && srcReal === targetReal) {
    return { agentKey, name, linked: false, reason: `agent 目录里的 ${name} 就是仓库本体，无需接管` };
  }

  // 关键安全门：内容不一致时拒绝，避免删掉仓库里没有的那份内容
  if (!dirsEqual(srcReal, targetReal)) {
    return { agentKey, name, linked: false, reason: `本目录的 ${name} 与仓库副本内容不一致，未接管（请先在技能库确认保留哪一份）` };
  }

  if (!confirm) {
    return { agentKey, name, linked: false, needConfirm: true, reason: '接管会把 agent 目录里的条目替换为指向仓库副本的软链，请确认' };
  }

  symlinkSkill(src, target);
  cfg.save();
  return { agentKey, name, linked: true, needConfirm: false };
}
