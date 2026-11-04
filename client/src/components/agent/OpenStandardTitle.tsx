import { useId, useState } from 'react';

/**
 * 开源生态推荐目录的主标题（列表卡片与详情页共用）。
 *
 * 主标题直接说明「这是开源生态推荐目录」，右侧 info 按钮承载一段说明：
 * 卡片上讲「为什么推荐优先管理这个目录、只想装给某一个 Agent 时该怎么做」，
 * 详情页上讲「大部分 Agent 都支持读这个目录，页面上这几个是当前使用的代表」。
 *
 * 气泡只在悬停 / 聚焦时挂载：常驻的绝对定位气泡会被布局检测算成溢出，
 * 也会让读屏把整段说明当正文读出来。收起时按钮仍用 aria-label 说明自己是什么。
 */
export default function OpenStandardTitle({ label, tip }: Readonly<{ label: string; tip: string }>) {
  const [open, setOpen] = useState(false);
  const tipId = useId();
  return (
    <span className="std-title">
      {label}
      <button
        type="button"
        className="std-title__info"
        aria-label={tip}
        aria-describedby={open ? tipId : undefined}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={(e) => e.stopPropagation()}
      >
        i
        {open && (
          <span className="std-title__tip" id={tipId} role="tooltip">
            {tip}
          </span>
        )}
      </button>
    </span>
  );
}
