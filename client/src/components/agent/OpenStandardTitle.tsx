/**
 * 共享标准目录卡片（Agent Skills 开放标准）的主标题。
 *
 * 主标题直接说明「这是开源标准」，右侧 info 按钮承载一段说明：
 * 为什么推荐优先管理这个目录、以及「只想装给某一个 Agent」时该怎么做。
 * 说明用 title 属性承载（悬停 / 键盘聚焦均可读到），按钮本身不是操作入口，
 * 只负责停止冒泡，避免点它时顺带把卡片当成「进入详情」。
 */
export default function OpenStandardTitle({ label, tip }: { label: string; tip: string }) {
  return (
    <span className="std-title">
      {label}
      <button
        type="button"
        className="std-title__info"
        aria-label={tip}
        title={tip}
        onClick={(e) => e.stopPropagation()}
      >
        i
      </button>
    </span>
  );
}
