import { useId } from "react";

/** The ASTER star: four soft points in the brand's blue-violet. */
export function AsterMark({ size = 26, className }: { size?: number; className?: string }) {
  const id = useId();
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden className={className}>
      <defs>
        <linearGradient id={`${id}-fill`} x1="4" y1="4" x2="28" y2="28" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#9ec5ff" />
          <stop offset="0.55" stopColor="#7b8cf6" />
          <stop offset="1" stopColor="#a17bf4" />
        </linearGradient>
      </defs>
      <path
        d="M16 1.5c1.1 7.6 6.9 13.4 14.5 14.5-7.6 1.1-13.4 6.9-14.5 14.5C14.9 22.9 9.1 17.1 1.5 16 9.1 14.9 14.9 9.1 16 1.5Z"
        fill={`url(#${id}-fill)`}
      />
    </svg>
  );
}
