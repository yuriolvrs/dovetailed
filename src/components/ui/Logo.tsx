// What this file is: the app's brand mark -- the "quill-write-01" icon from
// Hugeicons (stroke-rounded style, MIT; see LICENSES/hugeicons.txt), drawn on
// a 24x24 grid as a stroked outline. Its geometry lives in
// src/lib/brandMark.ts, shared with the favicon generator
// (scripts/build-favicon.ts) so the two can't silently drift apart. This is
// the only place the mark's SVG is written; every screen renders it through
// this component.
// In plain terms: the little logo, drawn in code instead of shipped as an
// image file.

import { MARK_PATHS, MARK_STROKE_WIDTH, MARK_VIEW_BOX } from '../../lib/brandMark.ts';

type LogoProps = {
  size?: number;
  className?: string;
  /** Override the stroke weight; defaults to the mark's own MARK_STROKE_WIDTH. */
  strokeWidth?: number;
};

/**
 * Renders the brand mark at any size, inheriting its color from the parent
 * via `currentColor` so it works unchanged in both themes.
 * In plain terms: draws the logo at whatever size you ask for, in whatever
 * color the surrounding text is.
 */
export default function Logo({ size = 16, className, strokeWidth = MARK_STROKE_WIDTH }: LogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox={MARK_VIEW_BOX}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {MARK_PATHS.map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}
