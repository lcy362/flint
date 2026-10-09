import type { SkillAction, SkillCardView, SkillHealth } from '../../api/types';

/** SkillView（资产库技能）→ 统一展示 SkillCardView */
export function skillViewToCard(
  s: {
    id: string;
    name: string;
    source: string;
    dir: string;
    description?: string;
    tags: string[];
    health?: SkillHealth;
  },
  actions: SkillAction[] = []
): SkillCardView {
  return {
    id: s.id,
    name: s.name,
    title: s.name,
    source: s.source,
    dir: s.dir,
    description: s.description,
    tags: s.tags ?? [],
    // 内容体检摘要：带上后列表页对有问题的技能显示区别徽标
    health: s.health,
    reason: 'manual',
    store: 'own',
    // 技能库是资产池，不存在启用/停用，故不设置 state（不展示状态徽标）
    actions,
  };
}
