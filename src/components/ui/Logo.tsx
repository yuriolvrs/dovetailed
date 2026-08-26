// What this file is: the app's brand mark -- a solid bird, drawn on a
// 256x256 grid as a filled shape (Phosphor Icons conventions) rather than
// the stroked 24x24 grid the Lucide nav icons use. Its geometry lives in
// src/lib/brandMark.ts, shared with the favicon generator
// (scripts/build-favicon.ts) so the two can't silently drift apart.
// In plain terms: the little logo, drawn in code instead of shipped as an
// image file.

import { MARK_PATHS, MARK_VIEW_BOX } from '../../lib/brandMark.ts';

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
      viewBox={MARK_VIEW_BOX}
      fill="currentColor"
      className={className}
      aria-hidden="true"
    >
      {MARK_PATHS.map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}
