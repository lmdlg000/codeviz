import { useId } from 'react';

/** 品牌标志：圆角方形渐变底 + 白色 C 字形与三个节点连线。 */
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
          <stop stopColor="#4f46e5" />
          <stop offset="1" stopColor="#0ea5e9" />
        </linearGradient>
      </defs>
      <rect width="40" height="40" rx="11" fill={`url(#cvz-logo-${gradientId})`} />
      <path
        d="M25.6 13.4a7.2 7.2 0 1 0 .1 13.2"
        stroke="#ffffff"
        strokeWidth="2.6"
        strokeLinecap="round"
      />
      <circle cx="28.6" cy="12.4" r="1.9" fill="#ffffff" />
      <circle cx="31.4" cy="27.4" r="1.9" fill="#ffffff" opacity="0.82" />
      <path d="m30 14.2-1.6 11.1" stroke="#ffffff" strokeWidth="1.6" strokeLinecap="round" opacity="0.8" />
      <circle cx="16.8" cy="20" r="1.5" fill="#ffffff" opacity="0.55" />
    </svg>
  );
}
