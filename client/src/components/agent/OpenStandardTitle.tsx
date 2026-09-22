/**
 * 开源生态推荐目录的主标题（列表卡片与详情页共用）。
 *
 * 主标题直接说明「这是开源生态推荐目录」，右侧 info 按钮承载一段说明：
 * 卡片上讲「为什么推荐优先管理这个目录、只想装给某一个 Agent 时该怎么做」，
 * 详情页上讲「大部分 Agent 都支持读这个目录，页面上这几个是当前使用的代表」。
 * 说明用 `data-tip` 承载（`aria-label` 同步给读屏），由 CSS 画即时气泡：
 * 原生 title 在卡片里要停留约一秒才出来、样式也不受控，实测容易被当成「没反应」。
 * 按钮本身不是操作入口，只负责停止冒泡，避免点它时顺带把卡片当成「进入详情」。
 */
export default function OpenStandardTitle({ label, tip }: { label: string; tip: string }) {
  return (
    <span className="std-title">
      {label}
      <button
        type="button"
        className="std-title__info"
        aria-label={tip}
        data-tip={tip}
        onClick={(e) => e.stopPropagation()}
      >
        i
      </button>
    </span>
  );
}
