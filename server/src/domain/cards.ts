import type { AgentSkillRow } from '../core/agents.js';
import { abbrevTilde } from '../core/agents.js';
import type { ProjectSkillRow } from '../core/projects.js';
import { t } from '../i18n/index.js';

/* ---------- SkillCardView（前端 api/types.ts 契约） ---------- */
export type SkillReason = 'own' | 'preset' | 'manual' | 'external' | 'shared';
export type SkillStore = 'symlink' | 'copy' | 'own' | 'pending';
export type SkillActionKind = 'toggle' | 'collect' | 'merge' | 'delete';
/**
 * 状态只表达「该技能在这个 Agent / 项目里是否可用」，不掺入"本工具管不管它"：
 * - on：已在本目录中可用（本工具分发落盘的，或本地自带 / 外部软链 / 共享目录读到的）
 * - off：本工具曾分发到该目录、现已移出分发名单（曾被停用），物理上通常还留着
 *
 * 之所以不再有「未纳管」：状态列一旦混进"本工具视角"的术语，就会与
 * 「这个 Agent 现在装了什么」的直觉打架——同一列里既说「启用」又说「未纳管」，
 * 用户没法从它读出任何比较。管辖与否由 reason 徽标表达（自带 / 外部软链 / 只读）。
 *
 * 注意「列入名单但尚未落盘」仍是 on，其未落盘由 store=pending 单独表达，
 * 否则开关语义会被拆散成两个互相矛盾的状态。
 */
export type SkillState = 'on' | 'off';

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
  /**
   * 不在本工具分发范围内的行（本地自有目录 / 外部软链 / 共享目录读取）的**实际位置**，
   * 软链再带上真实目标；路径已把 home 压成 `~`。这些行没有「本工具按来源分发」这层身份，
   * `name@来源` 对它们没有意义，列表直接展示这个标签，保证「看到的就是真实路径」。
   */
  pathLabel?: string;
}

interface CommonRow {
  wanted: boolean;
  present: boolean;
  store: SkillStore;
  reason: SkillReason;
  offOverride?: boolean;
  /** 已有归属：软链目标落在某个「已登记库」内（自有仓库 / 第三方来源 / 共享标准目录） */
  alreadyInLibrary?: boolean;
}

const action = (kind: SkillActionKind, label: string, extra: Partial<SkillAction> = {}): SkillAction => ({ kind, label, ...extra });

/** 归一化来源原因：项目行的 tag/index 归并为 manual（其对操作/展示无差异化影响），其余保留 */
function normReason(r: string): SkillReason {
  if (r === 'preset' || r === 'manual' || r === 'own' || r === 'external' || r === 'shared') return r;
  return 'manual';
}

/** 由「是否在本目录中可用」×「是否在分发名单」推导 state */
function stateOf(r: CommonRow): SkillState {
  // 自带目录、外部软链、共享标准目录读取：物理上就在这个目录里，本 Agent 直接可用 → 开启。
  // （它们没有启用/停用开关，那由 reason 表达，与状态列无关。）
  if (r.reason === 'own' || r.reason === 'external' || r.reason === 'shared') return 'on';
  return r.wanted ? 'on' : 'off';
}

/**
 * 不在本工具分发范围内的行（本地自有目录 / 外部软链 / 共享目录读取）的展示位置：
 * 直接给真实路径，软链再带上真实目标（home 压成 `~`）。
 *
 * 受管行表达的是「本工具按哪条策略把它放到这里」，`name@来源` 才是准确身份；
 * 这些行没有这层身份，路径就是它的全部事实，所以这里不做任何猜测，指向哪里就展示哪里。
 */
function pathLabelOf(row: { dir?: string; linkTarget?: string }, reason: SkillReason): string | undefined {
  if (reason !== 'own' && reason !== 'external' && reason !== 'shared') return undefined;
  if (!row.dir) return undefined;
  const dir = abbrevTilde(row.dir);
  return row.linkTarget ? `${dir} → ${abbrevTilde(row.linkTarget)}` : dir;
}

/**
 * 依据 reason 推导可执行操作。
 *
 * - 「归集到仓库」= 把该目录里的技能复制进自有仓库（源目录保持不动，PRD 流程二-A）。
 *   Agent 全局目录与项目 .agents/skills 共用同一条链路：归集后可再「接管」（源位置改为指向仓库副本的软链）。
 *   只在技能**尚无归属**时出现：本体是自带真实目录，或软链指向任何「已登记库」之外。
 *   软链已有归属时（目标就落在自有仓库 / 第三方来源 / 共享标准目录内），再归集只会复制出重复本体，
 *   因此不提供该操作（这类技能要覆盖仓库副本请走技能库「添加技能 → 从 Agent 归集」，
 *   那里才有并列候选可比）。
 * - 不再单出「合并保留」：合并是「同一技能名有多个来源」时的仲裁，只有在技能库的
 *   归集确认页里才有齐全的候选（并列各版本 / 来源）可比，单独一颗按钮既没有可比对象也容易误解。
 */
function acts(r: CommonRow): SkillAction[] {
  if (r.reason === 'own' || r.reason === 'external') {
    return [
      ...(r.alreadyInLibrary ? [] : [action('collect', t('card.collect'), { title: t('card.collect.title') })]),
      action('delete', t('card.delete'), { title: t('card.delete.title') }),
    ];
  }
  // 共享标准目录里的技能由该目录自己的策略管理，本 Agent 无权开关/删除，这里不给操作
  if (r.reason === 'shared') return [];
  // 受管行（本工具部署的软链 / 副本，reason=manual/preset）：新模型下没有 on/off 开关，
  // 移除它就等于从该目录删除物理产物，因此只给「删除」。
  return [action('delete', t('card.delete'), { title: t('card.delete.title') })];
}

/** agent 上下文行 → SkillCardView */
export function agentCard(row: AgentSkillRow): SkillCardView {
  const reason = normReason(row.reason);
  const r: CommonRow = {
    wanted: row.wanted, present: row.present, store: row.store, reason,
    offOverride: row.offOverride, alreadyInLibrary: row.alreadyInLibrary,
  };
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
    pathLabel: pathLabelOf(row, reason),
    actions: acts(r),
  };
}

export function agentCards(rows: AgentSkillRow[]): SkillCardView[] { return rows.map(agentCard); }

/** 项目上下文行 → SkillCardView */
export function projectCard(row: ProjectSkillRow): SkillCardView {
  const r: CommonRow = { wanted: row.wanted, present: row.present, store: row.store, reason: normReason(row.reason) };
  return {
    id: row.skillId ?? `${row.name}@${row.repo ?? ''}`,
    name: row.name, title: row.title, description: row.description,
    source: row.repo ?? '', dir: row.dir, tags: [],
    reason: r.reason, store: row.store, state: stateOf(r),
    takenOver: row.takenOver,
    pathLabel: pathLabelOf(row, r.reason),
    actions: acts(r),
  };
}

export function projectCards(rows: ProjectSkillRow[]): SkillCardView[] { return rows.map(projectCard); }