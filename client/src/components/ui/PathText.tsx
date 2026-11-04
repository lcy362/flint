import { Fragment } from 'react';

/**
 * 路径文本：只在 `/` 之后提供换行点（`<wbr>`）。
 *
 * 直接 `overflow-wrap: anywhere` 会把目录名从词中间劈开（`IdeaPr… / ojects`），
 * 而完全不换行又会撑破卡片。`<wbr>` 不产生任何字符，复制与文本匹配都还是原路径。
 */
export default function PathText({
  path,
  className,
  title,
}: Readonly<{
  path: string;
  className?: string;
  title?: string;
}>) {
  const parts = path.split('/');
  return (
    <span className={className} title={title ?? path}>
      {parts.map((seg, i) => (
        <Fragment key={`${seg}-${i}`}>
          {seg}
          {i < parts.length - 1 && (
            <>
              /<wbr />
            </>
          )}
        </Fragment>
      ))}
    </span>
  );
}
