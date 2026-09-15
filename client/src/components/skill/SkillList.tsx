import type { SkillAction, SkillCardView } from '../../api/types';
import EntityList, { type EntityItem, type EntityListProps } from '../common/EntityList';
import Switch from '../ui/Switch';
import { isOn, isToolManaged, skillBadges, stateBadge } from './SkillBadges';
import SkillActions from './SkillActions';
import { useI18n, type TFunc } from '../../i18n';

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
  t: TFunc,
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
  // 不在本工具分发范围内的行没有「按来源分发」这层身份，展示服务端给好的真实位置
  // （软链时形如 `~/x/skills/a → ~/y/skills/a`），避免把 name@来源 摆在那里误导；
  // 本工具分发的行仍以 name@来源 表达身份。
  const sub = item.pathLabel ?? item.id;
  return {
    id: item.id,
    title: item.title || item.name,
    sub: <span className="mono" title={sub}>{sub}</span>,
    desc: item.description,
    status: stateBadge(t, item),
    badges: skillBadges(t, item),
    tags: (item.tags ?? []).map((tag) => ({ label: tag, onClick: onTag ? () => onTag(item, tag) : undefined })),
    meta: <>{item.source}</>,
    // 不在本工具分发范围内的项（本地自有目录 / 外部软链 / 共享目录读取）开关对它没有意义，
    // 改用「归集到仓库 / 删除」等操作表达可做的事，避免"明明装着却开关关闭"这类自相矛盾。
    toggle: onToggle && isToolManaged(item) ? (
      <Switch
        aria-label={
          item.toggleDisabled
            ? t('skillList.toggleDisabledAria', { name: item.name })
            : on
              ? t('skillList.disableAria', { name: item.name })
              : t('skillList.enableAria', { name: item.name })
        }
        checked={on}
        disabled={item.toggleDisabled}
        onChange={() => onToggle(item)}
      />
    ) : undefined,
    actions: <SkillActions item={item} onAction={onAction} />,
    onClick: onOpen ? () => onOpen(item) : undefined,
    // 仅「已停用」置灰；无 state（技能库）保持正常态
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
  const { t } = useI18n();
  const entities = items.map((item) => skillToEntity(t, item, { onToggle, onAction, onTag, onOpen }));
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
