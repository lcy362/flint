import type { SkillAction, SkillCardView } from '../../api/types';
import EntityList, { type EntityItem, type EntityListProps } from '../common/EntityList';
import Switch from '../ui/Switch';
import { isOn, skillBadges, stateBadge } from './SkillBadges';
import SkillActions from './SkillActions';

interface SkillListProps {
  items: SkillCardView[];
  title?: EntityListProps['title'];
  toolbar?: EntityListProps['toolbar'];
  onToggle?: (item: SkillCardView) => void;
  onAction?: (item: SkillCardView, action: SkillAction) => void;
  onTag?: (item: SkillCardView, tag: string) => void;
  /** 点击整块（卡片/行）打开详情 */
  onOpen?: (item: SkillCardView) => void;
  /** 强制布局，用于弹窗等固定形态 */
  mode?: EntityListProps['mode'];
  empty?: EntityListProps['empty'];
  /** 视图切换器已上移到筛选条 */
  hideToggle?: boolean;
  /** 是否提供整体折叠控制 */
  collapsible?: boolean;
  /** 折叠状态持久化 key（localStorage） */
  storageKey?: string;
}

/** SkillCardView → 通用 EntityItem，保证与其他实体列表风格一致 */
export function skillToEntity(
  item: SkillCardView,
  opts: {
    onToggle?: (item: SkillCardView) => void;
    onAction?: (item: SkillCardView, action: SkillAction) => void;
    onTag?: (item: SkillCardView, tag: string) => void;
    onOpen?: (item: SkillCardView) => void;
  } = {}
): EntityItem {
  const { onToggle, onAction, onTag, onOpen } = opts;
  const on = item.toggleOn ?? isOn(item);
  return {
    id: item.id,
    title: item.title || item.name,
    sub: <span className="mono">{item.id}</span>,
    desc: item.description,
    status: stateBadge(item),
    badges: skillBadges(item),
    tags: (item.tags ?? []).map((t) => ({ label: t, onClick: onTag ? () => onTag(item, t) : undefined })),
    meta: <>{item.source}</>,
    // 未纳管的项（本地自有目录 / 外部软链）不由本工具分发，开关对它没有意义，
    // 改用「收编到仓库 / 删除」等操作表达可做的事，避免"使用中却开关关闭"这类自相矛盾。
    toggle: onToggle && item.state !== 'unmanaged' ? (
      <Switch
        aria-label={item.toggleDisabled ? `${item.name}：由标签自动纳入，不可直接关闭` : on ? `停用 ${item.name}` : `启用 ${item.name}`}
        checked={on}
        disabled={item.toggleDisabled}
        onChange={() => onToggle(item)}
      />
    ) : undefined,
    actions: <SkillActions item={item} onAction={onAction} />,
    onClick: onOpen ? () => onOpen(item) : undefined,
    // 仅「已停用」置灰；未纳管与无 state（技能库）保持正常态
    muted: item.state === 'off',
  };
}

/** 技能展示容器（三处上下文共用：技能库 / Agent 详情 / 项目详情） */
export default function SkillList({
  items,
  title,
  toolbar,
  onToggle,
  onAction,
  onTag,
  onOpen,
  mode,
  empty,
  hideToggle,
  collapsible,
  storageKey,
}: SkillListProps) {
  const entities = items.map((item) => skillToEntity(item, { onToggle, onAction, onTag, onOpen }));
  return (
    <EntityList
      items={entities}
      title={title}
      toolbar={toolbar}
      mode={mode}
      empty={empty}
      hideToggle={hideToggle}
      collapsible={collapsible}
      storageKey={storageKey}
    />
  );
}
