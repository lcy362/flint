import type { AgentView } from '../../api/types';
import type { BadgeLegendItem, BadgeTone } from '../common/BadgeLegend';
import Badge from '../ui/Badge';
import { type TFunc } from '../../i18n';

/**
 * Agent 徽标的统一文案与含义（文案随界面语言生成）。
 *
 * 卡片上原本只有「软链 / 未安装 / 共享目录」几个内部术语，含义全靠猜。
 * 这里把每枚徽标收敛到一处：标签文字尽量说清「是什么」，title 用大白话补一句
 * 「意味着什么」；同一份解释又登记进徽标图例，供「标签说明」弹窗一次讲全。
 * Agents / 预设详情 / 设置三处都从这里取，避免同一件事出现多种说法。
 */

export interface BadgeMeta {
  /** 徽标文字；含具体名称的（预设）在渲染时替换 */
  label: string;
  tone: BadgeTone;
  /** 人话解释：徽标 title 与「标签说明」共用同一句 */
  desc: string;
}

/** 活跃集合（AA-03/04） */
export function activeMeta(t: TFunc): BadgeMeta {
  return {
    label: t('agentBadge.active'),
    tone: 'good',
    desc: t('agentBadge.active.title'),
  };
}
export function inactiveMeta(t: TFunc): BadgeMeta {
  return {
    label: t('agentBadge.inactive'),
    tone: 'neutral',
    desc: t('agentBadge.inactive.title'),
  };
}

/** 分发基准：关联的预设 */
export function presetMeta(t: TFunc): BadgeMeta {
  return {
    label: t('agentBadge.presetLabel'),
    tone: 'accent',
    desc: t('agentBadge.preset.title'),
  };
}
export function noPresetMeta(t: TFunc): BadgeMeta {
  return {
    label: t('agentBadge.noPreset'),
    tone: 'neutral',
    desc: t('agentBadge.noPreset.title'),
  };
}

/** 自定义 Agent（AG-03）：内置清单之外由用户新增的工具 */
export function customMeta(t: TFunc): BadgeMeta {
  return {
    label: t('agentBadge.custom'),
    tone: 'accent',
    desc: t('agentBadge.custom.title'),
  };
}

/** 自定义 Agent 标记；内置 Agent 不出此徽标 */
export function customBadge(t: TFunc, agent: Pick<AgentView, 'custom'>) {
  if (!agent.custom) return null;
  return <Badge tone={customMeta(t).tone} title={customMeta(t).desc}>{customMeta(t).label}</Badge>;
}

/** 本机是否已有该技能目录 */
export function installedMeta(t: TFunc): BadgeMeta {
  return {
    label: t('agentBadge.installed'),
    tone: 'good',
    desc: t('agentBadge.installed.title'),
  };
}
export function notInstalledMeta(t: TFunc): BadgeMeta {
  return {
    label: t('agentBadge.notInstalled'),
    tone: 'neutral',
    desc: t('agentBadge.notInstalled.title'),
  };
}

/** 单个 Agent 的活跃态（详情页用） */
export function activeBadge(t: TFunc, agent: Pick<AgentView, 'active'>) {
  const meta = agent.active ? activeMeta(t) : inactiveMeta(t);
  return (
    <Badge tone={meta.tone} dot={agent.active ? 'good' : 'neutral'} title={meta.desc}>
      {meta.label}
    </Badge>
  );
}

/** 本机安装状态（成对展示：已安装 / 本机未安装） */
export function installBadge(t: TFunc, agent: Pick<AgentView, 'installed'>) {
  const meta = agent.installed ? installedMeta(t) : notInstalledMeta(t);
  return <Badge tone={meta.tone} title={meta.desc}>{meta.label}</Badge>;
}

/** 仅在本机未创建技能目录时提示，避免已安装的卡片被「已安装」刷屏 */
export function notInstalledBadge(t: TFunc) {
  return (
    <Badge tone={notInstalledMeta(t).tone} title={notInstalledMeta(t).desc}>
      {notInstalledMeta(t).label}
    </Badge>
  );
}

/** 分发基准：预设 X / 未关联预设 */
export function presetBadge(t: TFunc, preset: string | null) {
  return preset ? (
    <Badge tone={presetMeta(t).tone} title={t('agentBadge.preset.title')}>
      {t('agentBadge.preset', { name: preset })}
    </Badge>
  ) : (
    <Badge tone={noPresetMeta(t).tone} title={noPresetMeta(t).desc}>{noPresetMeta(t).label}</Badge>
  );
}

/** 产品家族：X 系列；无家族时不出徽标（设置页仍在用） */
export function familyBadge(t: TFunc, agent: Pick<AgentView, 'family'>) {
  if (!agent.family) return null;
  return (
    <Badge tone="accent" title={t('agentBadge.family.title')}>
      {t('agentBadge.family', { family: agent.family })}
    </Badge>
  );
}

/** 共享标准目录（Agent Skills 开放标准）：该 Agent 读取的 ~/.agents 或 ~/.config/agents */
export const SHARED_READ_DIR: Record<'agents' | 'config-agents', string> = {
  agents: '~/.agents/skills',
  'config-agents': '~/.config/agents/skills',
};

/**
 * 展示某 Agent「读取共享标准目录」的信息。标签直接写出它同时读取的具体路径。
 * sharedOwn = true 表示共享目录正是它的原生全局目录（本身就是共享根的用户）；
 * 否则它只是在自身目录之外「兼容读取」该共享目录（放到那里的技能它对也可用）。
 */
export function sharedReadBadge(t: TFunc, agent: Pick<AgentView, 'shared' | 'sharedOwn'>) {
  const shared = agent.shared;
  if (shared !== 'agents' && shared !== 'config-agents') return null;
  const dir = SHARED_READ_DIR[shared];
  const label = agent.sharedOwn ? t('agentBadge.sharedRead', { dir }) : t('agentBadge.sharedReadExtra', { dir });
  const title = agent.sharedOwn
    ? t('agentBadge.sharedReadOwn.title', { dir })
    : t('agentBadge.sharedReadExtra.title', { dir });
  return <Badge tone="info" title={title}>{label}</Badge>;
}

/** 「标签说明」弹窗的数据源：顺序即卡片上的常见排列顺序 */
export function agentBadgeLegend(t: TFunc): BadgeLegendItem[] {
  return [
    { ...activeMeta(t), dot: 'good' },
    { ...inactiveMeta(t), dot: 'neutral' },
    {
      label: t('agentBadge.sharedReadExtra', { dir: SHARED_READ_DIR.agents }),
      tone: 'info' as const,
      desc: t('agentBadge.sharedReadExtra.title', { dir: SHARED_READ_DIR.agents }),
    },
    {
      label: t('agentBadge.sharedReadExtra', { dir: SHARED_READ_DIR['config-agents'] }),
      tone: 'info' as const,
      desc: t('agentBadge.sharedReadExtra.title', { dir: SHARED_READ_DIR['config-agents'] }),
    },
    customMeta(t),
    presetMeta(t),
    noPresetMeta(t),
    notInstalledMeta(t),
  ];
}
