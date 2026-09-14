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
  /** 徽标文字；含具体名称的（预设）在渲染时替换 */
  label: string;
  tone: Tone;
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
export const PARTIAL_ACTIVE_META: BadgeMeta = {
  label: '部分活跃',
  tone: 'info',
  desc: '该目录下的 Agent 只有部分加入了活跃集合：只有活跃的会自动跟随变更，其余需手动同步。',
};

/** 默认安装方式（SY-01~03） */
export const SYNC_META: Record<'symlink' | 'copy', BadgeMeta> = {
  symlink: {
    label: '软链安装',
    tone: 'info',
    desc: '技能以「快捷方式」装进该目录：不复制文件、不占额外空间，技能库一改就立即生效。',
  },
  copy: {
    label: '复制安装',
    tone: 'info',
    desc: '技能会复制一份独立副本放进该目录：之后技能库的改动不会自动跟进，要重新「同步」才会更新。',
  },
};
/**
 * 同目录的别名与主 Agent 分发策略不一致时。
 * 目录只有一份，两套策略无法各自生效（同步按 Agent 逐个落盘，会互相覆盖），
 * 所以这不是「两个偏好」，而是需要用户处理的冲突。
 */
export const CONFLICT_META: BadgeMeta = {
  label: '设置冲突',
  tone: 'warn',
  desc: '同一目录下的 Agent 预设 / 安装方式不一致：目录只能落一份，实际以最后同步者为准，会互相覆盖。建议在各自详情页对齐，或只保留一个活跃。',
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

/** 卡片（按目录聚合）的活跃态：全部活跃 / 全部非活跃 / 部分活跃 */
export function activeCountBadge({ activeCount, total }: { activeCount: number; total: number }) {
  if (activeCount === 0) {
    return (
      <Badge tone={INACTIVE_META.tone} dot="neutral" title={INACTIVE_META.desc}>
        {INACTIVE_META.label}
      </Badge>
    );
  }
  if (activeCount === total) {
    return (
      <Badge tone={ACTIVE_META.tone} dot="good" title={ACTIVE_META.desc}>
        {ACTIVE_META.label}
      </Badge>
    );
  }
  return (
    <Badge
      tone={PARTIAL_ACTIVE_META.tone}
      dot="neutral"
      title={`该目录下 ${total} 个 Agent 中有 ${activeCount} 个在活跃集合里：只有活跃的会自动跟随变更，其余需手动同步。`}
    >
      {PARTIAL_ACTIVE_META.label} {activeCount}/{total}
    </Badge>
  );
}

/** 安装方式：软链安装 / 复制安装 */
export function syncBadge(sync: 'symlink' | 'copy') {
  const meta = SYNC_META[sync === 'copy' ? 'copy' : 'symlink'];
  return <Badge tone={meta.tone} title={meta.desc}>{meta.label}</Badge>;
}

/** 与主 Agent 分发策略冲突的别名（把具体名字写进 title，便于直接定位） */
export function conflictBadge(names: string[]) {
  return (
    <Badge
      tone={CONFLICT_META.tone}
      title={`${names.join('、')} 与主 Agent 的预设 / 安装方式不一致。${CONFLICT_META.desc}`}
    >
      {CONFLICT_META.label} · {names.length}
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
  { ...PARTIAL_ACTIVE_META, label: '部分活跃 1/2', dot: 'neutral' },
  SYNC_META.symlink,
  SYNC_META.copy,
  { ...PRESET_META, label: '预设 名称' },
  NO_PRESET_META,
  { ...CONFLICT_META, label: '设置冲突 · 1' },
  NOT_INSTALLED_META,
];
