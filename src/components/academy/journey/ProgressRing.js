import React from 'react';

/**
 * ProgressRing - Circular progress indicator
 *
 * A reusable circular progress component with animated fill.
 *
 * @param {number} progress - Progress percentage (0-100)
 * @param {number} size - Size in pixels (default: 120)
 * @param {number} strokeWidth - Width of the progress stroke (default: 8)
 * @param {string} colorClass - Tailwind color class for the progress stroke
 * @param {boolean} showLabel - Whether to show the percentage in the center
 * @param {React.ReactNode} children - Custom content to display in center
 */
export default function ProgressRing({
  progress = 0,
  size = 120,
  strokeWidth = 8,
  colorClass = 'stroke-brand-navy',
  bgColorClass = 'stroke-neutral-200',
  showLabel = true,
  children,
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (progress / 100) * circumference;

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg
        width={size}
        height={size}
        className="transform -rotate-90"
      >
        {/* Background circle */}
        <circle
          className={bgColorClass}
          strokeWidth={strokeWidth}
          fill="transparent"
          r={radius}
          cx={size / 2}
          cy={size / 2}
        />
        {/* Progress circle */}
        <circle
          className={`${colorClass} transition-all duration-500 ease-out`}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          fill="transparent"
          r={radius}
          cx={size / 2}
          cy={size / 2}
          style={{
            strokeDasharray: circumference,
            strokeDashoffset: offset,
          }}
        />
      </svg>

      {/* Center content */}
      <div className="absolute inset-0 flex items-center justify-center">
        {children || (showLabel && (
          <div className="text-center">
            <span className="text-2xl font-bold text-neutral-900">
              {Math.round(progress)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * MiniProgressRing - Smaller version for inline use
 */
export function MiniProgressRing({
  progress = 0,
  size = 32,
  strokeWidth = 3,
  colorClass = 'stroke-brand-navy',
}) {
  return (
    <ProgressRing
      progress={progress}
      size={size}
      strokeWidth={strokeWidth}
      colorClass={colorClass}
      showLabel={false}
    />
  );
}
