export interface ProgressBarProps {
  value: number;
  total: number;
  tone?: 'indigo' | 'teal' | 'amber' | 'rose' | 'violet' | 'sky';
  size?: 'sm' | 'md';
  /** 给读屏的说明，例如「已完成 3 / 13 课」 */
  label?: string;
  className?: string;
}

export function ProgressBar({
  value,
  total,
  tone = 'indigo',
  size = 'md',
  label,
  className,
}: ProgressBarProps) {
  const safeTotal = Math.max(total, 1);
  const safeValue = Math.min(Math.max(value, 0), safeTotal);
  const percent = Math.round((safeValue / safeTotal) * 100);
  const classes = ['progress', `progress--${tone}`, `progress--${size}`];
  if (className) classes.push(className);

  return (
    <div
      className={classes.join(' ')}
      role="progressbar"
      aria-valuenow={safeValue}
      aria-valuemin={0}
      aria-valuemax={safeTotal}
      aria-label={label ?? `进度 ${percent}%`}
    >
      <span className="progress__fill" style={{ width: `${percent}%` }} />
    </div>
  );
}

export interface ProgressRingProps {
  value: number;
  total: number;
  size?: number;
  stroke?: number;
  tone?: 'indigo' | 'teal' | 'amber' | 'rose' | 'violet' | 'sky';
  label?: string;
}

export function ProgressRing({
  value,
  total,
  size = 72,
  stroke = 6,
  tone = 'indigo',
  label,
}: ProgressRingProps) {
  const safeTotal = Math.max(total, 1);
  const safeValue = Math.min(Math.max(value, 0), safeTotal);
  const ratio = safeValue / safeTotal;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const dash = circumference * ratio;
  const percent = Math.round(ratio * 100);

  return (
    <div
      className={`progress-ring progress-ring--${tone}`}
      style={{ width: size, height: size }}
      role="img"
      aria-label={label ?? `完成 ${safeValue} / ${safeTotal}，${percent}%`}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle
          className="progress-ring__track"
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
        />
        <circle
          className="progress-ring__value"
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circumference}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <span className="progress-ring__text tabular" aria-hidden="true">
        {safeValue}
        <span className="progress-ring__total">/{safeTotal}</span>
      </span>
    </div>
  );
}
