import type { SkillCardView, SkillReason, SkillStore } from '../../api/types';
import type { BadgeLegendItem } from '../common/BadgeLegend';
import Badge from '../ui/Badge';
import type { TFunc } from '../../i18n';

/** 来源原因徽标文字（manual 不以来源徽标表达，返回空串） */
function reasonLabel(t: TFunc, r: SkillReason): string {
  switch (r) {
    case 'own':
      return t('badge.reason.own');
    case 'preset':
      return t('badge.reason.preset');
    case 'external':
      return t('badge.reason.external');
    // 共享标准目录读取：本 Agent 直接可用，但本工具不改写它 —— 用「只读」说明为什么没有开关。
    // 这属于「为什么本工具不管它」，归在来源徽标，不占状态列（状态列只表达装没装、可不可用）。
    case 'shared':
      return t('badge.readonly');
    default:
      return '';
  }
}

/** 来源原因徽标的解释文案 */
function reasonTitle(t: TFunc, r: SkillReason): string {
  switch (r) {
    case 'own':
      return t('badge.reason.own.title');
    case 'preset':
      return t('badge.reason.preset.title');
    case 'external':
      return t('badge.reason.external.title');
    case 'shared':
      return t('badge.reason.shared.title');
    default:
      return t('badge.reason.manual.title');
  }
}

// 全站统一用「软链 / 复制」描述装入形态（安装方式下拉、技能库接管等都用同一个词）
function storeLabel(t: TFunc, s: SkillStore): string | undefined {
  switch (s) {
    case 'symlink':
      return t('badge.store.symlink');
    case 'copy':
      return t('badge.store.copy');
    case 'pending':
      return t('badge.store.pending');
    default:
      return undefined;
  }
}

function storeTitle(t: TFunc, s: SkillStore): string | undefined {
  switch (s) {
    case 'symlink':
      return t('badge.store.symlink.title');
    case 'copy':
      return t('badge.store.copy.title');
    case 'pending':
      return t('badge.store.pending.title');
    default:
      return undefined;
  }
}

/** 「标签说明」弹窗的数据源：与徽标本体共用同一份文案，避免两处各说各话 */
export function skillBadgeLegend(t: TFunc): BadgeLegendItem[] {
  return [
    { label: t('badge.reason.own'), tone: 'accent', desc: t('badge.reason.own.title') },
    { label: t('badge.reason.preset'), tone: 'accent', desc: t('badge.reason.preset.title') },
    { label: t('badge.reason.external'), tone: 'warn', desc: t('badge.reason.external.title') },
    { label: t('badge.store.symlink'), tone: 'info', desc: t('badge.store.symlink.title') },
    { label: t('badge.store.copy'), tone: 'info', desc: t('badge.store.copy.title') },
    { label: t('badge.store.pending'), tone: 'warn', desc: t('badge.store.pending.title') },
    { label: t('badge.state.on'), tone: 'good', dot: 'good', desc: t('badge.state.on.title') },
    { label: t('badge.state.off'), tone: 'neutral', dot: 'neutral', desc: t('badge.state.off.title') },
    { label: t('badge.readonly'), tone: 'info', desc: t('badge.readonly.title') },
    { label: t('badge.takenOver'), tone: 'good', desc: t('badge.takenOver.title') },
  ];
}

/** 开关的选中态：只有「在分发名单内」才算开启 */
export function isOn(item: SkillCardView): boolean {
  return item.state === 'on';
}

/**
 * 该行是否由本工具按来源分发（策略落在它身上：预设成员 / 直接加入）。
 *
 * 自带目录、外部软链、共享标准目录读取都在本工具的分发范围之外：它们没有启用/停用开关，
 * 也不参与「按技能的安装方式」。判断依据只能是 reason —— 状态列现在只表达
 * 「这个目录里装没装、可不可用」，不再用它承载管辖关系。
 */
export function isToolManaged(item: SkillCardView): boolean {
  return item.reason !== 'own' && item.reason !== 'external' && item.reason !== 'shared';
}

export function reasonBadge(t: TFunc, item: SkillCardView) {
  const label = item.reasonLabel ?? reasonLabel(t, item.reason);
  if (!label) return null; // manual 不再作为明显的来源标志展示
  // 外部软链不是本工具的产物（警示色）；共享目录读取只读且非本 Agent 分发（信息色）
  const tone = item.reason === 'external' ? 'warn' : item.reason === 'shared' ? 'info' : 'accent';
  return <Badge tone={tone} title={item.reasonTitle ?? reasonTitle(t, item.reason)}>{label}</Badge>;
}

export function storeBadge(t: TFunc, item: SkillCardView) {
  const label = storeLabel(t, item.store);
  if (!label) return null; // own 不展示，避免「自建」这类含义不明徽标
  return (
    <Badge tone={item.store === 'pending' ? 'warn' : 'info'} title={storeTitle(t, item.store)}>
      {label}
    </Badge>
  );
}

/**
 * 状态徽标；state 缺省时返回 null（该上下文无启用/停用语义，如技能库资产池）。
 *
 * 只回答「这个目录里装了没有、能不能用」：装了就是启用（本工具分发的、自带、外部软链、
 * 共享目录读到的都算），本工具曾分发但已停用的才是已停用。
 * 「本工具管不管它、能不能在这里开关」由 reason 徽标 + 有没有开关表达，不占状态列。
 */
export function stateBadge(t: TFunc, item: SkillCardView) {
  switch (item.state) {
    case 'on':
      return <Badge tone="good" dot="good" title={t('badge.state.on.title')}>{t('badge.state.on')}</Badge>;
    case 'off':
      return <Badge tone="neutral" dot="neutral" title={t('badge.state.off.title')}>{t('badge.state.off')}</Badge>;
    default:
      return null;
  }
}

/** 来源目录徽标：直接显示技能所在的目录（仅多目录 Agent 由页面派生 dirLabel 后展示） */
export function dirBadge(item: SkillCardView) {
  if (!item.dirLabel) return null;
  return (
    <Badge tone="neutral" title={item.dirTitle ?? item.dirLabel}>
      <span className="mono">{item.dirLabel}</span>
    </Badge>
  );
}

/** 已接管徽标：本目录这条是指向仓库内技能的软链 */
export function takenOverBadge(t: TFunc, item: SkillCardView) {
  if (!item.takenOver) return null;
  return (
    <Badge tone="good" title={t('badge.takenOver.title')}>
      {t('badge.takenOver')}
    </Badge>
  );
}

/** 共享目录里的软链：store 徽标不适用，单独用一个中性「软链」徽标点明形态 */
export function linkBadge(t: TFunc, item: SkillCardView) {
  if (item.reason !== 'shared' || !item.linkTarget) return null;
  return <Badge tone="info" title={t('badge.symlink.title', { target: item.linkTarget })}>{t('badge.symlink')}</Badge>;
}

/**
 * 统一渲染 reason / 目录 / store / preset 等徽标（卡片与列表行共用）。
 * 不含 state —— 状态由 EntityItem.status 单独展示在卡片右上角 / 行右侧。
 */
export function skillBadges(t: TFunc, item: SkillCardView) {
  return (
    <>
      {reasonBadge(t, item)}
      {dirBadge(item)}
      {takenOverBadge(t, item)}
      {/* 已接管本身就说清了形态，不再重复出「软链」 */}
      {!item.takenOver && storeBadge(t, item)}
      {linkBadge(t, item)}
      {item.preset && <Badge tone="accent">{item.preset}</Badge>}
    </>
  );
}
