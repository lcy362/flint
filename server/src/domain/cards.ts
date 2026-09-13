import type { AgentSkillRow } from '../core/agents.js';
import type { ProjectSkillRow } from '../core/projects.js';

/* ---------- SkillCardView（前端 api/types.ts 契约） ---------- */
export type SkillReason = 'own' | 'preset' | 'manual' | 'external';
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
}

interface CommonRow { wanted: boolean; present: boolean; store: SkillStore; reason: SkillReason; offOverride?: boolean }

const action = (kind: SkillActionKind, label: string, extra: Partial<SkillAction> = {}): SkillAction => ({ kind, label, ...extra });

/** 归一化来源原因：项目行的 tag/index 归并为 manual（其对操作/展示无差异化影响），其余保留 */
function normReason(r: string): SkillReason {
  if (r === 'preset' || r === 'manual' || r === 'own' || r === 'external') return r;
  return 'manual';
}

/** 由「是否纳管」×「是否在分发名单」推导 state */
function stateOf(r: CommonRow): SkillState {
  // 本地自有目录与外部软链都不由本工具管理，开关对它们没有意义
  if (r.reason === 'own' || r.reason === 'external') return 'unmanaged';
  return r.wanted ? 'on' : 'off';
}

/** 依据 reason 推导可执行操作（对应 PRD 收编/去重/取消分发） */
function acts(r: CommonRow): SkillAction[] {
  if (r.reason === 'own' || r.reason === 'external') {
    return [
      action('collect', '收编到仓库', { title: '把该技能复制进统一仓库，供各 Agent/项目共享' }),
      action('merge', '合并保留', { title: '多个同名版本时，保留并合并该来源' }),
      action('delete', '删除', { title: '移除本地技能目录' }),
    ];
  }
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
    // 外部软链的链接不指向本仓库，沿用 symlink 徽标会误导，退化为不展示
    store: reason === 'external' ? 'own' : row.store,
    state: stateOf(r),
    offOverride: row.offOverride, linkTarget: row.linkTarget, preset: row.preset,
    actions: acts(r),
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
    actions: acts(r),
  };
}

export function projectCards(rows: ProjectSkillRow[]): SkillCardView[] { return rows.map(projectCard); }