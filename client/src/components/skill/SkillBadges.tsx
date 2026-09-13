import type { SkillCardView, SkillReason, SkillStore } from '../../api/types';
import Badge from '../ui/Badge';

const REASON_LABEL: Record<SkillReason, string> = {
  own: '未收编',
  preset: '预设引入',
  external: '外部软链',
  manual: '',
};

const REASON_TITLE: Record<SkillReason, string> = {
  own: '存在于当前 Agent/项目目录、但尚未纳入统一仓库管理，可执行「收编到仓库」',
  preset: '由预设组引入',
  external: '该软链由本工具之外的来源创建（目标不在任何已登记仓库内）：本工具既不会分发它，也不会自动清理它',
  manual: '由用户手动加入',
};

const STORE_LABEL: Partial<Record<SkillStore, string>> = {
  symlink: '软链引用',
  copy: '副本',
  pending: '待部署',
};

const STORE_TITLE: Partial<Record<SkillStore, string>> = {
  symlink: '通过软链接引用仓库中的共享副本，不复制文件',
  copy: '仓库中保存了一份独立副本',
  pending: '已列入该 Agent 的分发名单，但尚未写入其技能目录',
};

export { REASON_LABEL, STORE_LABEL };

/** 开关的选中态：只有「在分发名单内」才算开启 */
export function isOn(item: SkillCardView): boolean {
  return item.state === 'on';
}

export function reasonBadge(item: SkillCardView) {
  const label = item.reasonLabel ?? REASON_LABEL[item.reason];
  if (!label) return null; // manual 不再作为明显的来源标志展示
  // 外部软链不是本工具的产物，用警示色与「预设引入」区分开
  const tone = item.reason === 'external' ? 'warn' : 'accent';
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
  switch (item.state) {
    case 'on':
      return (
        <Badge tone="good" dot="good" title="已列入该 Agent/项目的分发名单">
          启用
        </Badge>
      );
    case 'off':
      return (
        <Badge tone="neutral" dot="neutral" title="曾由本工具分发，现已移出分发名单">
          已停用
        </Badge>
      );
    case 'unmanaged':
      return (
        <Badge tone="info" title="存在于该目录，但不属于本工具的管理范围，故无启用/停用之说">
          未纳管
        </Badge>
      );
    default:
      return null;
  }
}

/**
 * 统一渲染 reason / store / preset 三个徽标（卡片与列表行共用）。
 * 不含 state —— 状态由 EntityItem.status 单独展示在卡片右上角 / 行右侧。
 */
export function skillBadges(item: SkillCardView) {
  return (
    <>
      {reasonBadge(item)}
      {storeBadge(item)}
      {item.preset && <Badge tone="accent">{item.preset}</Badge>}
    </>
  );
}
