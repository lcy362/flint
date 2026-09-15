import type { AddableSkill } from '../../api/types';
import EntityList, { type EntityItem } from '../common/EntityList';
import Button from '../ui/Button';
import EmptyState from '../ui/EmptyState';
import { useI18n } from '../../i18n';

/** 可添加技能列表（Agent / 项目详情共用） */
export default function AddableSkillList({
  items,
  onAdd,
  title,
}: {
  items: AddableSkill[];
  onAdd: (a: AddableSkill) => void;
  title?: string;
}) {
  const { t } = useI18n();
  if (items.length === 0) return <EmptyState title={t('agents.list.empty')} />;
  const entities: EntityItem[] = items.map((a) => ({
    id: a.id,
    title: a.name,
    sub: <span className="mono">{a.repo}</span>,
    actions: (
      <Button size="sm" variant="primary" onClick={() => onAdd(a)}>
        {t('common.add')}
      </Button>
    ),
  }));
  // 弹窗内固定跟随全局偏好，不再重复暴露切换器
  return <EntityList items={entities} title={title} toggle={false} />;
}
