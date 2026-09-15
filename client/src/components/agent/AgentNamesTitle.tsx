import type { AgentView } from '../../api/types';
import { useI18n } from '../../i18n';

/**
 * 卡片 / 行标题里罗列一组 Agent 名（通常是同一个技能目录的共用者）。
 *
 * 它们都是真实存在的 Agent，不分主次称呼，所以直接并列展示（Cline / Warp）；
 * 每个名字可单独点开自己的详情。单个 Agent 时回落成普通文字，避免多余的可点区域。
 */
export default function AgentNamesTitle({
  agents,
  onOpen,
}: {
  agents: AgentView[];
  onOpen: (key: string) => void;
}) {
  const { t } = useI18n();
  if (agents.length === 1) return <>{agents[0].name}</>;
  return (
    // 外层包一个元素：列表视图的标题是 inline-flex，多个兄弟节点会被 gap 拉开间距
    <span>
      {agents.map((a, i) => (
        <span key={a.key}>
          {i > 0 && <span className="entity-title__sep"> / </span>}
          <button
            type="button"
            className="entity-title__link"
            title={t('agents.openDetail', { name: a.name })}
            onClick={(e) => {
              e.stopPropagation();
              onOpen(a.key);
            }}
          >
            {a.name}
          </button>
        </span>
      ))}
    </span>
  );
}
