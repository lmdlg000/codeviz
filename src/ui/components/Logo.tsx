import { useId } from 'react';

/** 品牌标志：终端绿方块 + 反色 C 字形与三个节点连线。 */
export function Logo({ size = 38, className }: { size?: number; className?: string }) {
  const gradientId = useId().replace(/:/g, '');
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id={`cvz-logo-${gradientId}`} x1="0" y1="0" x2="40" y2="40" gradientUnits="userSpaceOnUse">
          <stop stopColor="#3bf08a" />
          <stop offset="1" stopColor="#12b869" />
        </linearGradient>
      </defs>
      <rect width="40" height="40" fill={`url(#cvz-logo-${gradientId})`} />
      <path d="M25.6 13.4a7.2 7.2 0 1 0 .1 13.2" stroke="#04150c" strokeWidth="2.6" strokeLinecap="butt" />
      <circle cx="28.6" cy="12.4" r="1.9" fill="#04150c" />
      <circle cx="31.4" cy="27.4" r="1.9" fill="#04150c" opacity="0.82" />
      <path d="m30 14.2-1.6 11.1" stroke="#04150c" strokeWidth="1.6" strokeLinecap="butt" opacity="0.8" />
      <circle cx="16.8" cy="20" r="1.5" fill="#04150c" opacity="0.55" />
    </svg>
  );
}
