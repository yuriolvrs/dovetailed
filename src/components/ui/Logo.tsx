// What this file is: the app's brand mark -- a plain document page. Drawn
// on a 24x24 grid, 2px stroke, round caps and joins (Lucide conventions),
// so it sits naturally next to the other icons. Its geometry lives in
// src/lib/brandMark.ts, shared with the favicon generator
// (scripts/build-favicon.ts) so the two can't silently drift apart.
// In plain terms: the little logo, drawn in code instead of shipped as an
// image file.

import { CONTENT_LINES, PAGE } from '../../lib/brandMark.ts';

type LogoProps = {
  size?: number;
  className?: string;
};

/**
 * Renders the brand mark at any size, inheriting its color from the parent.
 * In plain terms: draws the logo at whatever size you ask for.
 */
export default function Logo({ size = 16, className }: LogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <g stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <rect x={PAGE.x} y={PAGE.y} width={PAGE.w} height={PAGE.h} rx={PAGE.rx} />
        {CONTENT_LINES.map((line) => (
          <path key={line.y} d={`M${line.x} ${line.y}H${line.x + line.w}`} />
        ))}
      </g>
    </svg>
  );
}
