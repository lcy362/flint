import type { ReactNode, SVGProps } from 'react';

/**
 * 全站唯一的图标集：统一 24 视框、1.5 描边、圆角端点。
 * 图标一律手绘路径，不用 Unicode 字符充当图形（字符会随字体变形，也无法对齐）。
 */
export type IconName =
  | 'library'
  | 'agents'
  | 'presets'
  | 'projects'
  | 'health'
  | 'settings'
  | 'refresh'
  | 'sun'
  | 'moon'
  | 'close'
  | 'chevron-down'
  | 'arrow-left'
  | 'arrow-right'
  | 'check'
  | 'plus'
  |   'circle'
  | 'log'
  | 'alert'
  | 'cross'
  | 'flint';

const PATHS: Record<IconName, ReactNode> = {
  // 技能库：三本立着的书
  library: (
    <>
      <path d="M4.5 19V5.5h4.2V19" />
      <path d="M11.4 19V9h3.9v10" />
      <path d="M18.2 19l1.6-11.4" />
    </>
  ),
  // 智能体：带引脚的芯片
  agents: (
    <>
      <rect x="4.5" y="4.5" width="15" height="15" rx="2.5" />
      <rect x="9.5" y="9.5" width="5" height="5" rx="1" />
      <path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22" />
    </>
  ),
  // 预设：一叠卡片
  presets: (
    <>
      <rect x="3.5" y="8.5" width="17" height="11" rx="1.5" />
      <path d="M6.5 5.5h11M9.5 2.5h5" />
    </>
  ),
  // 项目：文件夹
  projects: (
    <path d="M3.5 7.5A1.5 1.5 0 0 1 5 6h3.8l2 2.5H19a1.5 1.5 0 0 1 1.5 1.5v7A1.5 1.5 0 0 1 19 18.5H5A1.5 1.5 0 0 1 3.5 17z" />
  ),
  // 诊断：脉冲线
  health: <path d="M2.5 12.5h4l2.5-5.5 4 11 2.5-5.5h6" />,
  // 设置：滑杆
  settings: (
    <>
      <path d="M3.5 8.5h9M17.5 8.5h3M3.5 15.5h3M11.5 15.5h9" />
      <circle cx="15" cy="8.5" r="2.2" />
      <circle cx="9" cy="15.5" r="2.2" />
    </>
  ),
  refresh: (
    <>
      <path d="M20.5 12a8.5 8.5 0 1 1-2.6-6.1" />
      <path d="M20.5 3.8v5h-5" />
    </>
  ),
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M18.7 5.3l-1.6 1.6M6.9 17.1l-1.6 1.6" />
    </>
  ),
  moon: <path d="M20 14.4A8.5 8.5 0 0 1 9.6 4a8.5 8.5 0 1 0 10.4 10.4z" />,
  close: <path d="M6 6l12 12M18 6L6 18" />,
  'chevron-down': <path d="M6 9.5l6 6 6-6" />,
  'arrow-left': <path d="M14.5 5.5L8 12l6.5 6.5" />,
  'arrow-right': <path d="M9.5 5.5L16 12l-6.5 6.5" />,
  check: <path d="M4.5 12.5l4.8 4.8L19.5 6.5" />,
  plus: <path d="M12 5v14M5 12h14" />,
  circle: <circle cx="12" cy="12" r="7.5" />,
  log: <path d="M4 6.5h16M4 10.5h16M4 14.5h11M4 18.5h13" />,
  alert: (
    <>
      <path d="M12 3.5 21 20H3z" />
      <path d="M12 9.5v4.5M12 17h.01" />
    </>
  ),
  cross: <path d="M6.5 6.5l11 11M17.5 6.5l-11 11" />,
  // 品牌标记：一块燧石碎片 + 一点火星
  flint: (
    <>
      <path d="M13.6 2.8 6.4 11.6l4.4 1.5-1.9 8.1L18.6 11l-4.6-1.4 2-6.8z" />
      <path d="M19.6 3.2v2.2M18.5 4.3h2.2" />
    </>
  ),
};

/** EmptyState 的 `icon` 字段历史上传的是字符，这里做一次映射，统一落到绘制图标 */
const GLYPH_ALIAS: Record<string, IconName> = {
  '◈': 'library',
  '◉': 'agents',
  '□': 'presets',
  '❐': 'projects',
  '◎': 'health',
  '⚙': 'settings',
  '✓': 'check',
  '○': 'circle',
  '▤': 'log',
};

export function iconFromGlyph(glyph?: string): IconName {
  if (!glyph) return 'flint';
  return GLYPH_ALIAS[glyph] ?? 'flint';
}

export default function Icon({
  name,
  size = 16,
  ...rest
}: Readonly<{ name: IconName; size?: number } & Omit<SVGProps<SVGSVGElement>, 'name' | 'ref'>>) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {PATHS[name]}
    </svg>
  );
}
