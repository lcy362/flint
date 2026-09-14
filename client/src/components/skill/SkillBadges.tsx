import type { SkillCardView, SkillReason, SkillStore } from '../../api/types';
import type { BadgeLegendItem } from '../common/BadgeLegend';
import Badge from '../ui/Badge';

const REASON_LABEL: Record<SkillReason, string> = {
  own: '自带',
  preset: '预设引入',
  external: '外部链接',
  manual: '',
  shared: '共享目录',
};

const REASON_TITLE: Record<SkillReason, string> = {
  own: '它是这个目录里本来就有的技能，还没纳入技能库；可执行「收编到仓库」统一管理',
  preset: '由关联的预设组引入',
  external: '这个软链由本工具之外的来源创建（目标不在任何已登记仓库内）：本工具既不会分发它，也不会自动清理它',
  manual: '由用户手动加入',
  shared: '它在该 Agent 额外读取的共享标准目录里：放到那里的技能它直接可用，但不由本 Agent 的分发策略管理（只读）',
};

// 与 Agent 卡片的「软链安装 / 复制安装」保持同一套说法：同一件事只叫一个名字
const STORE_LABEL: Partial<Record<SkillStore, string>> = {
  symlink: '软链安装',
  copy: '复制安装',
  pending: '待部署',
};

const STORE_TITLE: Partial<Record<SkillStore, string>> = {
  symlink: '以软链接指向技能库里的本体：不复制文件、不占额外空间，技能库一改就即时生效',
  copy: '复制了一份独立副本到这个目录：技能库的改动不会自动跟进，需要重新「同步」',
  pending: '已列入分发名单，但还没有写入技能目录',
};

/** 状态徽标文案：只说明「本工具对该技能的处置」 */
const STATE_LABEL = { on: '启用', off: '已停用', unmanaged: '未纳管' } as const;

const STATE_TITLE: Record<keyof typeof STATE_LABEL, string> = {
  on: '已列入该 Agent / 项目的分发名单，并且已经写入目录',
  off: '曾由本工具分发到该目录，现在已移出分发名单',
  unmanaged: '它存在于这个目录，但不属于本工具的分发范围（自带或外部链接），所以没有启用 / 停用开关',
};

export { REASON_LABEL, STORE_LABEL };

/** 「标签说明」弹窗的数据源：与徽标本体共用同一份文案，避免两处各说各话 */
export const SKILL_BADGE_LEGEND: BadgeLegendItem[] = [
  { label: REASON_LABEL.own, tone: 'accent', desc: REASON_TITLE.own },
  { label: REASON_LABEL.preset, tone: 'accent', desc: REASON_TITLE.preset },
  { label: REASON_LABEL.external, tone: 'warn', desc: REASON_TITLE.external },
  { label: REASON_LABEL.shared, tone: 'info', desc: REASON_TITLE.shared },
  { label: STORE_LABEL.symlink!, tone: 'info', desc: STORE_TITLE.symlink! },
  { label: STORE_LABEL.copy!, tone: 'info', desc: STORE_TITLE.copy! },
  { label: STORE_LABEL.pending!, tone: 'warn', desc: STORE_TITLE.pending! },
  { label: STATE_LABEL.on, tone: 'good', dot: 'good', desc: STATE_TITLE.on },
  { label: STATE_LABEL.off, tone: 'neutral', dot: 'neutral', desc: STATE_TITLE.off },
  { label: STATE_LABEL.unmanaged, tone: 'info', desc: STATE_TITLE.unmanaged },
  { label: '软链', tone: 'info', desc: '该技能是软链接，指向另一个真实目录；改动能即时跟进目标。' },
];

/** 开关的选中态：只有「在分发名单内」才算开启 */
export function isOn(item: SkillCardView): boolean {
  return item.state === 'on';
}

export function reasonBadge(item: SkillCardView) {
  const label = item.reasonLabel ?? REASON_LABEL[item.reason];
  if (!label) return null; // manual 不再作为明显的来源标志展示
  // 外部软链不是本工具的产物（警示色）；共享目录读取只读且非本 Agent 分发（信息色）
  const tone = item.reason === 'external' ? 'warn' : item.reason === 'shared' ? 'info' : 'accent';
  return <Badge tone={tone} title={item.reasonTitle ?? REASON_TITLE[item.reason]}>{label}</Badge>;
}

export function storeBadge(item: SkillCardView) {
  const label = STORE_LABEL[item.store];
  if (!label) return null; // own 不展示，避免「自建」这类含义不明徽标
  return (
    <Badge tone={item.store === 'pending' ? 'warn' : 'info'} title={STORE_TITLE[item.store]}>
      {label}
    </Badge>
  );
}

/**
 * 状态徽标；state 缺省时返回 null（该上下文无启用/停用语义）。
 *
 * 只描述「本工具对该技能的处置」，不猜测技能本身是否被 Agent 使用 ——
 * 否则会和同一行的开关自相矛盾（例如"使用中"配一个关闭的开关）。
 */
export function stateBadge(item: SkillCardView) {
  // 共享标准目录里的技能：该 Agent 直接可用，但不由本工具分发，也不能在这里开关——用「只读」表达
  if (item.reason === 'shared') {
    return <Badge tone="info" title="它在该 Agent 额外读取的共享标准目录里：直接可用，但不由本工具分发，这里不能开关。">只读</Badge>;
  }
  switch (item.state) {
    case 'on':
      return <Badge tone="good" dot="good" title={STATE_TITLE.on}>{STATE_LABEL.on}</Badge>;
    case 'off':
      return <Badge tone="neutral" dot="neutral" title={STATE_TITLE.off}>{STATE_LABEL.off}</Badge>;
    case 'unmanaged':
      return <Badge tone="info" title={STATE_TITLE.unmanaged}>{STATE_LABEL.unmanaged}</Badge>;
    default:
      return null;
  }
}

/** 目录徽标：说明技能「来自哪个目录」（仅多目录 Agent 由页面派生 dirLabel 后展示） */
export function dirBadge(item: SkillCardView) {
  if (!item.dirLabel) return null;
  return <Badge tone="neutral" title={item.dirTitle ?? item.dirLabel}>{item.dirLabel}</Badge>;
}

/** 共享目录里的软链：store 徽标不适用，单独用一个中性「软链」徽标点明形态 */
export function linkBadge(item: SkillCardView) {
  if (item.reason !== 'shared' || !item.linkTarget) return null;
  return <Badge tone="info" title={`软链，指向 ${item.linkTarget}`}>软链</Badge>;
}

/**
 * 统一渲染 reason / 目录 / store / preset 等徽标（卡片与列表行共用）。
 * 不含 state —— 状态由 EntityItem.status 单独展示在卡片右上角 / 行右侧。
 */
export function skillBadges(item: SkillCardView) {
  return (
    <>
      {reasonBadge(item)}
      {dirBadge(item)}
      {storeBadge(item)}
      {linkBadge(item)}
      {item.preset && <Badge tone="accent">{item.preset}</Badge>}
    </>
  );
}
