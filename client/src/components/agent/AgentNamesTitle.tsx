import type { AgentView } from '../../api/types';

/**
 * 卡片 / 详情页标题里罗列一组 Agent 名（同一个技能目录的共用者）。
 *
 * 它们解析到同一个目录、共用同一套策略，界面上不存在「某个 Agent 自己的页面」这种东西：
 * 点谁都是同一份内容。所以这里只做并列展示（Cline / Warp），**不提供逐个跳转**——
 * 否则同一目录会出现两个详情页讲两套说法，与「一个目录一套策略」的约定相悖。
 */
export default function AgentNamesTitle({
  agents,
  quiet,
}: {
  agents: AgentView[];
  /** 弱化展示：用作开源生态推荐目录卡片的副标题（名字退居次要，主标题让给推荐目录） */
  quiet?: boolean;
}) {
  const cls = quiet ? 'std-agents' : undefined;
  if (agents.length === 1) return <span className={cls}>{agents[0].name}</span>;
  return (
    // 外层包一个元素：列表视图的标题是 inline-flex，多个兄弟节点会被 gap 拉开间距
    <span className={cls}>
      {agents.map((a, i) => (
        <span key={a.key}>
          {i > 0 && <span className="entity-title__sep"> / </span>}
          {a.name}
        </span>
      ))}
    </span>
  );
}
