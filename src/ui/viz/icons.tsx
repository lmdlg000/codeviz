/**
 * 轻量线性图标集（手绘风格 24×24，stroke 1.8，圆头圆角）
 * ------------------------------------------------------------------
 * 不依赖第三方图标库；只使用 currentColor，便于跟随主题与语义色。
 */
import type { SVGProps } from 'react';

export type VizIconName =
  | 'flow'
  | 'call'
  | 'class'
  | 'memory'
  | 'trace'
  | 'diagnostics'
  | 'warning'
  | 'info'
  | 'error'
  | 'play'
  | 'pause'
  | 'stepBack'
  | 'stepForward'
  | 'stepOver'
  | 'stepOut'
  | 'continue'
  | 'skipStart'
  | 'skipEnd'
  | 'chevronDown'
  | 'chevronRight'
  | 'check'
  | 'arrowRight'
  | 'zoomIn'
  | 'zoomOut'
  | 'reset'
  | 'code'
  | 'flask'
  | 'branch'
  | 'loop'
  | 'input'
  | 'output'
  | 'return'
  | 'sparkle'
  | 'upload'
  | 'external'
  | 'function'
  | 'variable'
  | 'clock'
  | 'target'
  | 'lightbulb'
  | 'file';

const ICON_PATHS: Record<VizIconName, string[]> = {
  flow: ['M4 3h6v5H4z', 'M14 16h6v5h-6z', 'M7 8v4h10v4'],
  call: [
    'M6 4.5a2 2 0 1 0 .01 0',
    'M18 4.5a2 2 0 1 0 .01 0',
    'M12 17.5a2 2 0 1 0 .01 0',
    'M8 6.5l3 9',
    'M16 6.5l-3 9',
  ],
  class: ['M4 3h16v18H4z', 'M4 9h16', 'M4 15h16'],
  memory: [
    'M7 7h10v10H7z',
    'M4 10h3M4 14h3M17 10h3M17 14h3',
    'M10 4v3M14 4v3M10 17v3M14 17v3',
  ],
  trace: ['M4 4v16', 'M8 8h12', 'M8 12h8', 'M8 16h11'],
  diagnostics: ['M12 3.5l8.5 16h-17z', 'M12 9v4.5', 'M12 17h.01'],
  warning: ['M12 3.5l8.5 16h-17z', 'M12 9v4.5', 'M12 17h.01'],
  info: ['M12 3a9 9 0 1 0 .01 0', 'M12 11v6', 'M12 7.5h.01'],
  error: ['M12 3a9 9 0 1 0 .01 0', 'M9 9l6 6', 'M15 9l-6 6'],
  play: ['M8 4.5l11 7.5-11 7.5z'],
  pause: ['M9 5v14', 'M15 5v14'],
  stepBack: ['M15 5l-8 7 8 7z'],
  stepForward: ['M9 5l8 7-8 7z'],
  // 步过：跨过一段（弧线）+ 落点，表示「跳过函数内部」
  stepOver: ['M5 19h4.5a6 6 0 0 0 6-6V8', 'M12.5 11l3-3 3 3'],
  // 跳出：从方框里向上跃出，表示「跑完当前函数回到调用处」
  stepOut: ['M9 20V13a3 3 0 0 1 3-3h6', 'M15 7l3 3-3 3'],
  // 继续：播放三角 + 终止条（一直跑到断点）
  continue: ['M7 5l9 7-9 7z', 'M18 5v14'],
  skipStart: ['M18 5l-9 7 9 7z', 'M6 5v14'],
  skipEnd: ['M6 5l9 7-9 7z', 'M18 5v14'],
  chevronDown: ['M6 9l6 6 6-6'],
  chevronRight: ['M9 6l6 6-6 6'],
  check: ['M5 13l4 4L19 7'],
  arrowRight: ['M4 12h15', 'M13 6l6 6-6 6'],
  zoomIn: ['M10.5 4a6.5 6.5 0 1 0 .01 0', 'M15.5 15.5L21 21', 'M10.5 7.5v6', 'M7.5 10.5h6'],
  zoomOut: ['M10.5 4a6.5 6.5 0 1 0 .01 0', 'M15.5 15.5L21 21', 'M7.5 10.5h6'],
  reset: ['M20 12a8 8 0 1 1-2.4-5.7', 'M20 4v5h-5'],
  code: ['M8 7l-5 5 5 5', 'M16 7l5 5-5 5'],
  flask: [
    'M9 3h6',
    'M10 3v6l-5.5 9.5A2.2 2.2 0 0 0 6.4 22h11.2a2.2 2.2 0 0 0 1.9-3.5L14 9V3',
    'M7.5 15h9',
  ],
  branch: ['M12 3l9 9-9 9-9-9z', 'M12 8v3.5', 'M12 15h.01'],
  loop: [
    'M4 9a6 6 0 0 1 10.5-4L17 7',
    'M20 15a6 6 0 0 1-10.5 4L7 17',
    'M17 3v4h-4',
    'M7 21v-4h4',
  ],
  input: ['M4 6h8v12H4z', 'M12 12h8', 'M16 8l4 4-4 4'],
  output: ['M4 12h8', 'M8 8l4 4-4 4', 'M14 6h6v12h-6'],
  return: ['M6 4v10h11', 'M13 10l4 4-4 4'],
  sparkle: ['M12 3l2.2 6.8L21 12l-6.8 2.2L12 21l-2.2-6.8L3 12l6.8-2.2z'],
  upload: ['M12 16V4', 'M7 9l5-5 5 5', 'M4 20h16'],
  external: ['M14 4h6v6', 'M20 4l-9 9', 'M18 14v6H4V6h6'],
  function: ['M9 4h7a2 2 0 0 1 2 2v14', 'M6 9h9', 'M6 20h8'],
  variable: ['M5 5h14', 'M5 19h14', 'M9 5l6 14'],
  clock: ['M12 3a9 9 0 1 0 .01 0', 'M12 7v5l3 2'],
  target: ['M12 3a9 9 0 1 0 .01 0', 'M12 7a5 5 0 1 0 .01 0', 'M12 11h.01'],
  lightbulb: [
    'M9 18h6',
    'M10 21h4',
    'M8.5 14a5.5 5.5 0 1 1 7 0c-.8.6-1.3 1.4-1.5 2.5h-4c-.2-1.1-.7-1.9-1.5-2.5z',
  ],
  file: ['M6 3h8l4 4v14H6z', 'M14 3v4h4'],
};

export interface VizIconProps extends Omit<SVGProps<SVGSVGElement>, 'name' | 'width' | 'height'> {
  name: VizIconName;
  size?: number;
  /** 提供后图标有可读名称；不提供则视为装饰性图标 */
  title?: string;
}

export function VizIcon({ name, size = 16, title, className, ...rest }: VizIconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className ? `cvz-icon ${className}` : 'cvz-icon'}
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
      focusable="false"
      {...rest}
    >
      {title ? <title>{title}</title> : null}
      {ICON_PATHS[name].map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}
