import type { AgentSkillRow } from '../core/agents.js';
import type { ProjectSkillRow } from '../core/projects.js';

/* ---------- SkillCardView（前端 api/types.ts 契约） ---------- */
export type SkillReason = 'own' | 'preset' | 'manual' | 'external' | 'shared';
export type SkillStore = 'symlink' | 'copy' | 'own' | 'pending';
export type SkillActionKind = 'toggle' | 'collect' | 'merge' | 'delete';
/**
 * 状态只回答「本工具对该技能做了什么」，不猜测技能本身是否正在被 Agent 使用：
 * - on：列入分发名单，且已落盘
 * - off：本工具分发的产物，但已不在分发名单内（曾被停用）
 * - unmanaged：存在于目录中，却不属于本工具管理的范围（本地自有目录 / 外部软链）
 *
 * 注意「列入名单但尚未落盘」仍是 on，其未落盘由 store=pending 单独表达，
 * 否则开关语义会被拆散成两个互相矛盾的状态。
 */
export type SkillState = 'on' | 'off' | 'unmanaged';

export interface SkillAction { kind: SkillActionKind; label: string; disabled?: boolean; title?: string }
export interface SkillCardView {
  id: string; name: string; title?: string; description?: string; source: string; dir?: string;
  tags: string[];
  reason: SkillReason; store: SkillStore; state: SkillState;
  offOverride?: boolean; linkTarget?: string; preset?: string; actions: SkillAction[];
  /** 该技能物理所在的可读目录（多目录 Agent 用来标注「来自哪个目录」） */
  fromDir?: string;
  /** own=自身目录（本工具分发）；shared=额外读取的共享标准目录（只读） */
  readVia?: 'own' | 'shared';
  /** 已接管：本目录这条是指向仓库内技能的软链（系统口径，任一自有仓库；指向仓库外的不算） */
  takenOver?: boolean;
}

interface CommonRow { wanted: boolean; present: boolean; store: SkillStore; reason: SkillReason; offOverride?: boolean }

const action = (kind: SkillActionKind, label: string, extra: Partial<SkillAction> = {}): SkillAction => ({ kind, label, ...extra });

/** 归一化来源原因：项目行的 tag/index 归并为 manual（其对操作/展示无差异化影响），其余保留 */
function normReason(r: string): SkillReason {
  if (r === 'preset' || r === 'manual' || r === 'own' || r === 'external' || r === 'shared') return r;
  return 'manual';
}

/** 由「是否纳管」×「是否在分发名单」推导 state */
function stateOf(r: CommonRow): SkillState {
  // 本地自有目录、外部软链、共享标准目录读取都不由本 Agent 管理，开关对它们没有意义
  if (r.reason === 'own' || r.reason === 'external' || r.reason === 'shared') return 'unmanaged';
  return r.wanted ? 'on' : 'off';
}

/** 卡片上下文：同一个技能在不同页面能做的事不同 */
export type CardContext = 'agent' | 'project';

/**
 * 依据 reason 推导可执行操作。
 *
 * - 「归集到仓库」= 把该目录里的技能复制进自有仓库（源目录保持不动，PRD 流程二-A）。
 *   只有 Agent 目录能被归集（collect 按 agent 扫描），项目目录不适用，故仅在 agent 上下文出现。
 * - 不再单出「合并保留」：合并是「同一技能名有多个来源」时的仲裁，只有在技能库的
 *   归集确认页里才有齐全的候选（并列各版本 / 来源）可比，单独一颗按钮既没有可比对象也容易误解。
 */
function acts(r: CommonRow, ctx: CardContext): SkillAction[] {
  if (r.reason === 'own' || r.reason === 'external') {
    const out: SkillAction[] = [];
    if (ctx === 'agent') {
      out.push(action('collect', '归集到仓库', { title: '把这个技能复制进你的仓库，之后各 Agent / 项目都能共享；本目录里的原技能保持不动' }));
    }
    out.push(action('delete', '删除', { title: '从本目录移除这个技能（不可撤销）' }));
    return out;
  }
  // 共享标准目录里的技能由该目录自己的策略管理，本 Agent 无权开关/删除，这里不给操作
  if (r.reason === 'shared') return [];
  return [action('toggle', r.wanted ? '停用' : '启用', { title: r.wanted ? '停用此技能（取消分发）' : '启用此技能' })];
}

/** agent 上下文行 → SkillCardView */
export function agentCard(row: AgentSkillRow): SkillCardView {
  const reason = normReason(row.reason);
  const r: CommonRow = { wanted: row.wanted, present: row.present, store: row.store, reason, offOverride: row.offOverride };
  return {
    id: row.skillId ?? `${row.name}@${row.repo ?? ''}`,
    name: row.name, title: row.title, description: row.description,
    source: row.repo ?? '', dir: row.dir, tags: [],
    reason,
    // 外部软链的链接不指向本仓库、共享目录的链接也不由本工具部署，沿用 symlink 徽标会误导，退化为不展示
    store: (reason === 'external' || reason === 'shared') ? 'own' : row.store,
    state: stateOf(r),
    offOverride: row.offOverride, linkTarget: row.linkTarget, preset: row.preset,
    fromDir: row.fromDir, readVia: row.readVia, takenOver: row.takenOver,
    actions: acts(r, 'agent'),
  };
}

export function agentCards(rows: AgentSkillRow[]): SkillCardView[] { return rows.map(agentCard); }

/** 项目上下文行 → SkillCardView */
export function projectCard(row: ProjectSkillRow): SkillCardView {
  const r: CommonRow = { wanted: row.wanted, present: row.present, store: row.store, reason: normReason(row.reason), offOverride: row.offOverride };
  return {
    id: row.skillId ?? `${row.name}@${row.repo ?? ''}`,
    name: row.name, title: row.title, description: row.description,
    source: row.repo ?? '', dir: row.dir, tags: [],
    reason: r.reason, store: row.store, state: stateOf(r),
    offOverride: row.offOverride,
    actions: acts(r, 'project'),
  };
}

export function projectCards(rows: ProjectSkillRow[]): SkillCardView[] { return rows.map(projectCard); }