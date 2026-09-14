import type { AgentView } from '../../api/types';
import type { BadgeLegendItem, BadgeTone } from '../common/BadgeLegend';
import Badge from '../ui/Badge';

/**
 * Agent 徽标的统一文案与含义。
 *
 * 卡片上原本只有「软链 / 未安装 / 共享目录」几个内部术语，含义全靠猜。
 * 这里把每枚徽标收敛到一处：标签文字尽量说清「是什么」，title 用大白话补一句
 * 「意味着什么」；同一份解释又登记进 AGENT_BADGE_LEGEND，供「标签说明」弹窗一次讲全。
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
export const ACTIVE_META: BadgeMeta = {
  label: '活跃',
  tone: 'good',
  desc: '已加入活跃集合：预设、技能库的改动会自动同步到这个目录。',
};
export const INACTIVE_META: BadgeMeta = {
  label: '非活跃',
  tone: 'neutral',
  desc: '未加入活跃集合：改动不会自动跟随，需要在 Agent 详情页手动点「同步」。',
};




/** 分发基准：关联的预设 */
export const PRESET_META: BadgeMeta = {
  label: '预设 名称',
  tone: 'accent',
  desc: '分发基准：这些 Agent 跟随同一个预设，预设里开启的技能都会装到该目录。',
};
export const NO_PRESET_META: BadgeMeta = {
  label: '未关联预设',
  tone: 'neutral',
  desc: '没有分发基准：只装你在 Agent 详情页里单独开启的技能，不跟随任何预设。',
};


/** 产品家族 */
export const FAMILY_META: BadgeMeta = {
  label: 'TRAE 系列',
  tone: 'accent',
  desc: '同系列产品（如国际版 / 国内版）：技能目录各自独立，只是归在一起便于对照。',
};

/** 自定义 Agent（AG-03）：内置清单之外由用户新增的工具 */
export const CUSTOM_META: BadgeMeta = {
  label: '自定义',
  tone: 'accent',
  desc: '内置清单之外由用户新增的工具：指定了全局 skill 目录；可在此页或设置页删除。',
};

/** 自定义 Agent 标记；内置 Agent 不出此徽标 */
export function customBadge(agent: Pick<AgentView, 'custom'>) {
  if (!agent.custom) return null;
  return <Badge tone={CUSTOM_META.tone} title={CUSTOM_META.desc}>{CUSTOM_META.label}</Badge>;
}

/** 本机是否已有该技能目录 */
export const INSTALLED_META: BadgeMeta = {
  label: '已安装',
  tone: 'good',
  desc: '本机已存在这个技能目录，可以直接往里装技能。',
};
export const NOT_INSTALLED_META: BadgeMeta = {
  label: '本机未安装',
  tone: 'neutral',
  desc: '本机还没有这个技能目录——通常是这些工具还没装，或它们从未加载过技能；把 Agent 设为活跃并同步后会自动创建。',
};

/** 单个 Agent 的活跃态（详情页用） */
export function activeBadge(agent: Pick<AgentView, 'active'>) {
  const meta = agent.active ? ACTIVE_META : INACTIVE_META;
  return (
    <Badge tone={meta.tone} dot={agent.active ? 'good' : 'neutral'} title={meta.desc}>
      {meta.label}
    </Badge>
  );
}

/** 本机安装状态（成对展示：已安装 / 本机未安装） */
export function installBadge(agent: Pick<AgentView, 'installed'>) {
  const meta = agent.installed ? INSTALLED_META : NOT_INSTALLED_META;
  return <Badge tone={meta.tone} title={meta.desc}>{meta.label}</Badge>;
}

/** 仅在本机未创建技能目录时提示，避免已安装的卡片被「已安装」刷屏 */
export function notInstalledBadge() {
  return (
    <Badge tone={NOT_INSTALLED_META.tone} title={NOT_INSTALLED_META.desc}>
      {NOT_INSTALLED_META.label}
    </Badge>
  );
}

/** 分发基准：预设 X / 未关联预设 */
export function presetBadge(preset: string | null) {
  return preset ? (
    <Badge tone={PRESET_META.tone} title={`分发基准：跟随预设「${preset}」，预设里开启的技能都会装到这里。`}>
      预设 {preset}
    </Badge>
  ) : (
    <Badge tone={NO_PRESET_META.tone} title={NO_PRESET_META.desc}>{NO_PRESET_META.label}</Badge>
  );
}

/** 产品家族：X 系列；无家族时不出徽标（设置页仍在用） */
export function familyBadge(agent: Pick<AgentView, 'family'>) {
  if (!agent.family) return null;
  return (
    <Badge tone={FAMILY_META.tone} title={FAMILY_META.desc}>
      {agent.family} 系列
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
export function sharedReadBadge(agent: Pick<AgentView, 'shared' | 'sharedOwn'>) {
  const shared = agent.shared;
  if (shared !== 'agents' && shared !== 'config-agents') return null;
  const dir = SHARED_READ_DIR[shared];
  const label = agent.sharedOwn ? `读 ${dir}` : `另读 ${dir}`;
  const title = agent.sharedOwn
    ? `该 Agent 的全局目录本身就是共享标准目录 ${dir}：放到这里的技能它直接可用，与同读该目录的其它工具共用。`
    : `该 Agent 除自身目录外，还会读取共享标准目录 ${dir}：放到那里的技能它对也可用，无需重复安装。`;
  return <Badge tone="info" title={title}>{label}</Badge>;
}

/** 「标签说明」弹窗的数据源：顺序即卡片上的常见排列顺序 */
export const AGENT_BADGE_LEGEND: BadgeLegendItem[] = [
  { ...ACTIVE_META, dot: 'good' },
  { ...INACTIVE_META, dot: 'neutral' },
  { label: `另读 ${SHARED_READ_DIR.agents}`, tone: 'info' as const, desc: '该 Agent 除自身目录外，还会读取共享标准目录 ~/.agents/skills：放到那里的技能它对也可用。' },
  { label: `另读 ${SHARED_READ_DIR['config-agents']}`, tone: 'info' as const, desc: '该 Agent 除自身目录外，还会读取共享标准目录 ~/.config/agents/skills：放到那里的技能它对也可用。' },
  CUSTOM_META,
  { ...PRESET_META, label: '预设 名称' },
  NO_PRESET_META,
  NOT_INSTALLED_META,
];
