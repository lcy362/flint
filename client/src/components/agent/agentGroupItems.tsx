import type { ReactNode } from 'react';
import type { EntityItem } from '../common/EntityList';
import type { TFunc } from '../../i18n';
import AgentNamesTitle from './AgentNamesTitle';
import OpenStandardTitle from './OpenStandardTitle';
import { activeBadge, customBadge, notInstalledBadge, presetBadge, readsAgentsDir } from './agentBadges';
import type { AgentGroup } from './agentGroups';

/**
 * 该目录是不是开源生态推荐目录（`~/.agents/skills`）：生态里被采纳得最广的共享技能目录。
 * 这类卡片换一套强调色突出，并在「活跃 / 非活跃」各自分组里都排第一；
 * `~/.config/agents/skills` 等其它共用目录与普通目录一样正常展示。
 */
export const isStandardGroup = (g: AgentGroup) => readsAgentsDir(g.primary.shared) && !!g.primary.sharedOwn;

export interface AgentGroupItemOptions {
  /** 整块点击（如 Agents 页进入该目录详情） */
  onClick?: () => void;
  /**
   * 追加在 Agent 徽标之前的行内徽标。
   * 同一个目录在不同页面有不同关注点（技能详情里关心「这个技能有没有分发过来」），
   * 追加项放在最前，Agent 自身的徽标（自定义 / 预设 / 未安装）保持原顺序。
   */
  extraBadges?: ReactNode;
  /** 行尾开关（如技能的分发开关） */
  toggle?: ReactNode;
  /** 覆盖右上角状态徽标（缺省为活跃态） */
  status?: ReactNode;
}

/**
 * Agent 目录 → 实体卡片模型。
 *
 * Agents 页的目录卡片与技能详情的「分发到智能体」弹窗共用这一份映射：
 * 同一个目录在两处的标题、副标题、路径、活跃态与徽标必须完全一致，
 * 差异只允许出现在调用方补的开关 / 点击 / 追加徽标上。
 */
export function agentGroupItem(g: AgentGroup, t: TFunc, opts: AgentGroupItemOptions = {}): EntityItem {
  const { primary } = g;
  // 开源生态推荐目录：主标题直接说明「这是推荐目录」，使用它的 Agent 退到副标题并弱化
  const head: Pick<EntityItem, 'title' | 'sub' | 'variant'> = isStandardGroup(g)
    ? {
        variant: 'standard',
        title: <OpenStandardTitle label={t('agents.openStandard.title')} tip={t('agents.openStandard.tip')} />,
        sub: <AgentNamesTitle agents={g.agents} quiet />,
      }
    : {
        // 标题罗列使用该目录的全部 Agent —— 它们都是真实的 Agent，不把谁叫「别名」
        title: <AgentNamesTitle agents={g.agents} />,
        sub: <span className="mono">{g.keys.join(' / ')}</span>,
      };

  const item: EntityItem = {
    id: g.dir,
    ...head,
    desc: <span className="mono">{g.dir}</span>,
    status: activeBadge(t, { active: g.anyActive }),
    // 一个目录只有一套策略，同目录的 Agent 共用它（系统内存于主 Agent 名下）
    badges: (
      <>
        {opts.extraBadges}
        {customBadge(t, primary)}
        {presetBadge(t, primary.preset ?? null)}
        {!g.installed && notInstalledBadge(t)}
      </>
    ),
    muted: !g.anyActive,
  };
  if (opts.status !== undefined) item.status = opts.status;
  if (opts.toggle !== undefined) item.toggle = opts.toggle;
  if (opts.onClick) item.onClick = opts.onClick;
  return item;
}
