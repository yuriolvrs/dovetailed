// What this file is: single source of truth for the app's brand mark
// geometry -- a quill. The artwork is the "quill-write-01" icon from
// Hugeicons (https://hugeicons.com/icon/quill-write-01), stroke-rounded
// style, used unmodified under the MIT licence in LICENSES/hugeicons.txt.
// Both src/components/ui/Logo.tsx (the inline header icon) and
// scripts/build-favicon.ts (which generates public/favicon.svg) import these
// same values rather than each hand-transcribing its own copy.
// In plain terms: the logo's shape, defined once, used everywhere it
// appears.

/** The grid the mark is drawn on. */
export const MARK_VIEW_BOX = '0 0 24 24';

/**
 * The mark's paths, in draw order. Rendered with `stroke`, not `fill` --
 * this is an outline icon, so callers set a stroke colour and `fill="none"`.
 * In plain terms: the actual outline of the quill.
 */
export const MARK_PATHS = [
  'M5.076 17C4.089 4.545 12.912 1.012 19.973 2.224c.286 4.128-1.734 5.673-5.58 6.387c.742.776 2.055 1.753 1.913 2.974c-.1.868-.69 1.295-1.87 2.147C11.85 15.6 8.854 16.78 5.076 17',
  'M4 22c0-6.5 3.848-9.818 6.5-12',
] as const;

/**
 * Stroke weight for the on-screen mark. Hugeicons ships this icon at 1.5,
 * which reads noticeably lighter than the 2px Lucide icons it sits beside in
 * the header, so the app draws it slightly heavier.
 * In plain terms: how thick the logo's lines are.
 */
export const MARK_STROKE_WIDTH = 1.75;

/**
 * Stroke weight for the favicon only. A favicon is displayed as small as
 * 16px, where a 1.75 stroke on a 24 grid renders under a pixel wide and goes
 * grey; 2 keeps it a solid line.
 * In plain terms: the tab icon needs slightly thicker lines to stay crisp.
 */
export const MARK_FAVICON_STROKE_WIDTH = 2;
