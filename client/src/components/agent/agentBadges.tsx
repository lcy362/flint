import type { AgentView } from '../../api/types';
import Badge from '../ui/Badge';

/**
 * Agent 徽标的统一文案与含义。
 *
 * 卡片上原本只有「软链 / 未安装 / 共享目录」几个内部术语，含义全靠猜。
 * 这里把每枚徽标收敛到一处：标签文字尽量说清「是什么」，title 用大白话补一句
 * 「意味着什么」；同一份解释又登记进 AGENT_BADGE_LEGEND，供「标签说明」弹窗一次讲全。
 * Agents / 预设详情 / 设置三处都从这里取，避免同一件事出现多种说法。
 */

type Tone = 'neutral' | 'accent' | 'good' | 'warn' | 'bad' | 'info';

export interface BadgeMeta {
  /** 徽标文字；含具体名称的（预设、系列、共享对象）在渲染时替换 */
  label: string;
  tone: Tone;
  /** 人话解释：徽标 title 与「标签说明」共用同一句 */
  desc: string;
}

/** 活跃集合（AA-03/04） */
export const ACTIVE_META: BadgeMeta = {
  label: '活跃',
  tone: 'good',
  desc: '已加入活跃集合：预设、技能库的改动会自动同步到这个 Agent。',
};
export const INACTIVE_META: BadgeMeta = {
  label: '非活跃',
  tone: 'neutral',
  desc: '未加入活跃集合：改动不会自动跟随，需要在它的详情页手动点「同步」。',
};

/** 默认安装方式（SY-01~03） */
export const SYNC_META: Record<'symlink' | 'copy', BadgeMeta> = {
  symlink: {
    label: '软链安装',
    tone: 'info',
    desc: '技能以「快捷方式」装进该 Agent 目录：不复制文件、不占额外空间，技能库一改就立即生效。',
  },
  copy: {
    label: '复制安装',
    tone: 'info',
    desc: '技能会复制一份独立副本放进该 Agent 目录：之后技能库的改动不会自动跟进，要重新「同步」才会更新。',
  },
};

/** 分发基准：关联的预设（AG / preset） */
export const PRESET_META: BadgeMeta = {
  label: '预设 名称',
  tone: 'accent',
  desc: '分发基准：该 Agent 跟随这个预设，预设里开启的技能都会装到它这里。',
};
export const NO_PRESET_META: BadgeMeta = {
  label: '未关联预设',
  tone: 'neutral',
  desc: '没有分发基准：该 Agent 只装你在它详情页里单独开启的技能，不跟随任何预设。',
};

/** 产品家族 */
export const FAMILY_META: BadgeMeta = {
  label: 'TRAE 系列',
  tone: 'accent',
  desc: '同系列产品（如国际版 / 国内版）：技能目录各自独立，只是归在一起便于对照。',
};

/** 多个 Agent 指向同一技能目录（AG-02） */
export const SHARED_DIR_META: BadgeMeta = {
  label: '共享目录',
  tone: 'warn',
  desc: '多个 Agent 指向同一个技能目录：给其中一个装技能，其它几个同时就有了，不必重复安装。',
};

/** 本机是否已有该 Agent 的技能目录 */
export const INSTALLED_META: BadgeMeta = {
  label: '已安装',
  tone: 'good',
  desc: '本机已存在该 Agent 的技能目录，可以直接往里装技能。',
};
export const NOT_INSTALLED_META: BadgeMeta = {
  label: '本机未安装',
  tone: 'neutral',
  desc: '本机还没有该 Agent 的技能目录——通常是这个工具还没装，或它从未加载过技能；把它设为活跃并同步后会自动创建。',
};

/** 活跃 / 非活跃 */
export function activeBadge(agent: Pick<AgentView, 'active'>) {
  const meta = agent.active ? ACTIVE_META : INACTIVE_META;
  return (
    <Badge tone={meta.tone} dot={agent.active ? 'good' : 'neutral'} title={meta.desc}>
      {meta.label}
    </Badge>
  );
}

/** 安装方式：软链安装 / 复制安装 */
export function syncBadge(agent: Pick<AgentView, 'sync'>) {
  const meta = SYNC_META[agent.sync === 'copy' ? 'copy' : 'symlink'];
  return <Badge tone={meta.tone} title={meta.desc}>{meta.label}</Badge>;
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
export function presetBadge(agent: Pick<AgentView, 'preset'>) {
  return agent.preset ? (
    <Badge
      tone={PRESET_META.tone}
      title={`分发基准：该 Agent 跟随预设「${agent.preset}」，预设里开启的技能都会装到它这里。`}
    >
      预设 {agent.preset}
    </Badge>
  ) : (
    <Badge tone={NO_PRESET_META.tone} title={NO_PRESET_META.desc}>{NO_PRESET_META.label}</Badge>
  );
}

/** 产品家族：X 系列；无家族时不出徽标 */
export function familyBadge(agent: Pick<AgentView, 'family'>) {
  if (!agent.family) return null;
  return (
    <Badge tone={FAMILY_META.tone} title={FAMILY_META.desc}>
      {agent.family} 系列
    </Badge>
  );
}

/** 与其它 Agent 指向同一技能目录；把共享对象直接写进标签，省得再猜「共享什么」 */
export function sharedDirBadge(agent: Pick<AgentView, 'sharedWith'>) {
  const names = agent.sharedWith;
  if (names.length === 0) return null;
  const brief = names.length <= 2 ? names.join('、') : `${names.length} 个 Agent`;
  return (
    <Badge
      tone={SHARED_DIR_META.tone}
      title={`与 ${names.join('、')} 指向同一个技能目录：给其中一个装技能，其它几个同时就有了，不必重复安装。`}
    >
      与 {brief} 共享目录
    </Badge>
  );
}

/** 「标签说明」弹窗的数据源：顺序即卡片上的常见排列顺序 */
export interface BadgeLegendItem {
  label: string;
  tone: Tone;
  dot?: 'good' | 'warn' | 'bad' | 'neutral';
  desc: string;
}

export const AGENT_BADGE_LEGEND: BadgeLegendItem[] = [
  { ...ACTIVE_META, dot: 'good' },
  { ...INACTIVE_META, dot: 'neutral' },
  SYNC_META.symlink,
  SYNC_META.copy,
  PRESET_META,
  NO_PRESET_META,
  FAMILY_META,
  { ...SHARED_DIR_META, label: '与 Cursor 共享目录' },
  NOT_INSTALLED_META,
];
