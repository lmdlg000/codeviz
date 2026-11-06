import type { ReactNode, SVGProps } from 'react';

/**
 * 一手绘制的线性图标集（24×24，stroke 1.8，圆头）。
 * 不使用 emoji 或外部图标库；默认对读屏隐藏，传 label 时作为图片暴露。
 */
export type IconName =
  | 'home'
  | 'book'
  | 'flask'
  | 'map'
  | 'info'
  | 'sun'
  | 'moon'
  | 'menu'
  | 'close'
  | 'upload'
  | 'play'
  | 'pause'
  | 'step-forward'
  | 'step-back'
  | 'skip-start'
  | 'skip-end'
  | 'copy'
  | 'check'
  | 'arrow-right'
  | 'arrow-left'
  | 'chevron-down'
  | 'chevron-right'
  | 'code'
  | 'flow'
  | 'call'
  | 'class'
  | 'memory'
  | 'trace'
  | 'warning'
  | 'sparkle'
  | 'search'
  | 'zoom-in'
  | 'zoom-out'
  | 'reset'
  | 'download'
  | 'link'
  | 'clock'
  | 'target'
  | 'lightbulb'
  | 'grid'
  | 'layers'
  | 'route'
  | 'cube'
  | 'rocket'
  | 'external'
  | 'file'
  | 'filter'
  | 'circle-check';

const ICONS: Record<IconName, ReactNode> = {
  home: (
    <>
      <path d="M3 10.6 12 3l9 7.6" />
      <path d="M5.2 9.4V21h13.6V9.4" />
      <path d="M9.6 21v-6.2h4.8V21" />
    </>
  ),
  book: (
    <>
      <path d="M4 5.4A2.4 2.4 0 0 1 6.4 3H20v15.6H6.4A2.4 2.4 0 0 0 4 21z" />
      <path d="M4 18.6h16" />
      <path d="M8 7.2h8" />
      <path d="M8 10.4h5" />
    </>
  ),
  flask: (
    <>
      <path d="M9.2 3h5.6" />
      <path d="M10.2 3v5.6L5.7 17a3 3 0 0 0 2.7 4.4h7.2a3 3 0 0 0 2.7-4.4l-4.5-8.4V3" />
      <path d="M7.2 14.2h9.6" />
    </>
  ),
  map: (
    <>
      <circle cx="5.4" cy="6.2" r="2.2" />
      <circle cx="18.6" cy="5.6" r="2.2" />
      <circle cx="12" cy="18.4" r="2.2" />
      <path d="M7.4 6.1h9" />
      <path d="M6.6 8.1l4.4 8.4" />
      <path d="M17.4 7.4l-4.2 9" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5.4" />
      <path d="M12 7.8h.01" />
    </>
  ),
  sun: (
    <>
      <circle cx="12" cy="12" r="4.2" />
      <path d="M12 2.6v2.2M12 19.2v2.2M2.6 12h2.2M19.2 12h2.2M5.4 5.4l1.6 1.6M17 17l1.6 1.6M18.6 5.4 17 7M7 17l-1.6 1.6" />
    </>
  ),
  moon: (
    <path d="M20.4 15.2A8.6 8.6 0 0 1 9.2 4a8.7 8.7 0 1 0 11.2 11.2Z" />
  ),
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  upload: (
    <>
      <path d="M12 16V3.8" />
      <path d="m7.4 8.2 4.6-4.5 4.6 4.5" />
      <path d="M4 15v3.6A2.4 2.4 0 0 0 6.4 21h11.2a2.4 2.4 0 0 0 2.4-2.4V15" />
    </>
  ),
  play: <path d="M8 5.4v13.2L19 12z" fill="currentColor" stroke="none" />,
  pause: (
    <g fill="currentColor" stroke="none">
      <rect x="7" y="5.2" width="3.4" height="13.6" rx="1.1" />
      <rect x="13.6" y="5.2" width="3.4" height="13.6" rx="1.1" />
    </g>
  ),
  'step-forward': (
    <>
      <path d="M6.5 5.6v12.8L16 12z" fill="currentColor" stroke="none" />
      <path d="M18.6 5.4v13.2" />
    </>
  ),
  'step-back': (
    <>
      <path d="M17.5 5.6v12.8L8 12z" fill="currentColor" stroke="none" />
      <path d="M5.4 5.4v13.2" />
    </>
  ),
  'skip-start': (
    <>
      <path d="M5 5v14" />
      <path d="M19 5.6v12.8L8.4 12z" fill="currentColor" stroke="none" />
    </>
  ),
  'skip-end': (
    <>
      <path d="M19 5v14" />
      <path d="M5 5.6v12.8L15.6 12z" fill="currentColor" stroke="none" />
    </>
  ),
  copy: (
    <>
      <rect x="8.4" y="8.4" width="11.6" height="11.6" rx="2.4" />
      <path d="M15.6 5.6A2.4 2.4 0 0 0 13.2 3.2H6a2.4 2.4 0 0 0-2.4 2.4v7.2a2.4 2.4 0 0 0 2.4 2.4" />
    </>
  ),
  check: <path d="m4.6 12.4 4.8 4.8L19.6 7" />,
  'circle-check': (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m8 12.2 2.8 2.8 5.2-5.4" />
    </>
  ),
  'arrow-right': (
    <>
      <path d="M4 12h15.2" />
      <path d="m13.6 6.2 5.8 5.8-5.8 5.8" />
    </>
  ),
  'arrow-left': (
    <>
      <path d="M20 12H4.8" />
      <path d="M10.4 6.2 4.6 12l5.8 5.8" />
    </>
  ),
  'chevron-down': <path d="m6 9.4 6 6 6-6" />,
  'chevron-right': <path d="m9.4 6 6 6-6 6" />,
  code: (
    <>
      <path d="m8.2 8.2-4 3.8 4 3.8" />
      <path d="m15.8 8.2 4 3.8-4 3.8" />
      <path d="m13.4 5.4-2.8 13.2" />
    </>
  ),
  flow: (
    <>
      <rect x="3" y="3.6" width="7.4" height="5" rx="1.6" />
      <path d="M6.7 8.6v3.2" />
      <path d="m6.7 11.8 3.4 3.2-3.4 3.2L3.3 15z" />
      <path d="M13.8 15h3.8a1.6 1.6 0 0 1 1.6 1.6v2" />
      <rect x="16.4" y="18.6" width="5.6" height="3" rx="1.2" />
    </>
  ),
  call: (
    <>
      <rect x="3" y="4" width="6.4" height="5" rx="1.4" />
      <path d="M9.4 6.5h4.2a2 2 0 0 1 2 2v3.4" />
      <path d="m13 10.4 2.6 2.6 2.6-2.6" />
      <rect x="13.2" y="14.4" width="7.8" height="5.2" rx="1.4" />
    </>
  ),
  class: (
    <>
      <rect x="4.2" y="3.4" width="15.6" height="17.2" rx="2.2" />
      <path d="M4.2 8.2h15.6" />
      <path d="M8 12h5M8 15.4h8M8 18.2h6" />
    </>
  ),
  memory: (
    <>
      <rect x="5.4" y="5.4" width="13.2" height="13.2" rx="2.4" />
      <path d="M9.4 9.4h5.2v5.2H9.4z" />
      <path d="M9 2.8v2.6M15 2.8v2.6M9 18.6v2.6M15 18.6v2.6M2.8 9h2.6M2.8 15h2.6M18.6 9h2.6M18.6 15h2.6" />
    </>
  ),
  trace: (
    <>
      <rect x="3.2" y="4" width="10.2" height="12.6" rx="2" />
      <path d="m6.4 7.6 3.4 2.6-3.4 2.6z" fill="currentColor" stroke="none" />
      <path d="M3.2 20h17.6" />
      <path d="M18.6 8.2v10.4" />
      <path d="m16.2 10.4 2.4-2.2 2.4 2.2" />
    </>
  ),
  warning: (
    <>
      <path d="M12 3.4 21 19.4a1.4 1.4 0 0 1-1.2 2.1H4.2A1.4 1.4 0 0 1 3 19.4Z" />
      <path d="M12 9v5.2" />
      <path d="M12 17.6h.01" />
    </>
  ),
  sparkle: (
    <>
      <path d="m12 2.8 1.9 5.3 5.3 1.9-5.3 1.9L12 17.2l-1.9-5.3L4.8 10l5.3-1.9z" />
      <path d="m18.8 16 .8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z" />
    </>
  ),
  search: (
    <>
      <circle cx="10.6" cy="10.6" r="6.4" />
      <path d="m15.2 15.2 4.8 4.8" />
    </>
  ),
  'zoom-in': (
    <>
      <circle cx="10.6" cy="10.6" r="6.4" />
      <path d="m15.2 15.2 4.8 4.8" />
      <path d="M10.6 8.2v4.8M8.2 10.6h4.8" />
    </>
  ),
  'zoom-out': (
    <>
      <circle cx="10.6" cy="10.6" r="6.4" />
      <path d="m15.2 15.2 4.8 4.8" />
      <path d="M8.2 10.6h4.8" />
    </>
  ),
  reset: (
    <>
      <path d="M4.2 5.4v4.8h4.8" />
      <path d="M5.4 14a7 7 0 1 0 .9-6.6L4.2 10.2" />
    </>
  ),
  download: (
    <>
      <path d="M12 3.6V16" />
      <path d="m7.4 11.6 4.6 4.6 4.6-4.6" />
      <path d="M4 15v3.6A2.4 2.4 0 0 0 6.4 21h11.2a2.4 2.4 0 0 0 2.4-2.4V15" />
    </>
  ),
  link: (
    <>
      <path d="M10.2 13.8a4.2 4.2 0 0 0 6 0l2.6-2.6a4.2 4.2 0 0 0-6-6l-1.4 1.4" />
      <path d="M13.8 10.2a4.2 4.2 0 0 0-6 0l-2.6 2.6a4.2 4.2 0 0 0 6 6l1.4-1.4" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="8.8" />
      <path d="M12 7v5.2l3.4 2" />
    </>
  ),
  target: (
    <>
      <circle cx="12" cy="12" r="8.6" />
      <circle cx="12" cy="12" r="4.8" />
      <path d="M12 12h.01" />
    </>
  ),
  lightbulb: (
    <>
      <path d="M9 18.2h6" />
      <path d="M10 21h4" />
      <path d="M12 2.8a6 6 0 0 0-3.4 10.9c.5.4.9 1 .9 1.6v.5h5v-.5c0-.6.4-1.2.9-1.6A6 6 0 0 0 12 2.8Z" />
    </>
  ),
  grid: (
    <>
      <rect x="3.6" y="3.6" width="7" height="7" rx="1.8" />
      <rect x="13.4" y="3.6" width="7" height="7" rx="1.8" />
      <rect x="3.6" y="13.4" width="7" height="7" rx="1.8" />
      <rect x="13.4" y="13.4" width="7" height="7" rx="1.8" />
    </>
  ),
  layers: (
    <>
      <path d="m12 3.4 8.4 4.2L12 11.8 3.6 7.6z" />
      <path d="m4.6 12.2 7.4 3.7 7.4-3.7" />
      <path d="m4.6 16.4 7.4 3.7 7.4-3.7" />
    </>
  ),
  route: (
    <>
      <circle cx="5.6" cy="6" r="2.4" />
      <circle cx="18.4" cy="18" r="2.4" />
      <path d="M8 6h5.4a3 3 0 0 1 3 3v1.6a3 3 0 0 1-3 3H9.6a3 3 0 0 0-3 3v.4" />
      <path d="m15.4 16.2 3 3.2" />
    </>
  ),
  cube: (
    <>
      <path d="m12 2.8 8.2 4.5v9.4L12 21.2l-8.2-4.5V7.3z" />
      <path d="m3.8 7.3 8.2 4.6 8.2-4.6" />
      <path d="M12 11.9v9.3" />
    </>
  ),
  rocket: (
    <>
      <path d="M12.8 4.2c2.4-1.4 5-1.8 7-1.8.6 0 1 .4 1 1 0 2-.4 4.6-1.8 7l-4.4 4.4-6.4-6.4z" />
      <path d="M9.2 14.8 4.4 15 3 12.8l3.8-3.2" />
      <path d="m9.2 14.8-.4 5.4 2.2 1.4 3.2-3.8" />
      <circle cx="16.4" cy="7.6" r="1.4" />
      <path d="M6.8 17.2c-1.2.4-2.4 1.6-2.8 2.8 1.2-.4 2.4-1.6 2.8-2.8Z" />
    </>
  ),
  external: (
    <>
      <path d="M14 4h6v6" />
      <path d="m20 4-8.4 8.4" />
      <path d="M18.4 14v4.4a2 2 0 0 1-2 2H6.4a2 2 0 0 1-2-2V8.4a2 2 0 0 1 2-2H10" />
    </>
  ),
  file: (
    <>
      <path d="M6 3.2h7.6L20 9.6V20.8H6z" />
      <path d="M13.4 3.4v6.4h6.4" />
      <path d="M9.2 13.2h6.4M9.2 16.6h4.4" />
    </>
  ),
  filter: (
    <>
      <path d="M3.4 5h17.2l-6.6 7.4v6.2l-4 2v-8.2z" />
    </>
  ),
};

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'name'> {
  name: IconName;
  size?: number;
  /** 传入后作为有语义的图片暴露给读屏 */
  label?: string;
  strokeWidth?: number;
}

export function Icon({ name, size = 20, label, strokeWidth = 1.8, className, ...rest }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className ? `icon ${className}` : 'icon'}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
      {...rest}
    >
      {ICONS[name]}
    </svg>
  );
}
