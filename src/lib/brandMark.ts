// What this file is: single source of truth for the app's brand mark
// geometry -- a plain document page. Both src/components/ui/Logo.tsx (the
// inline header icon) and scripts/build-favicon.ts (which generates
// public/favicon.svg) import these same numbers rather than each
// hand-transcribing its own copy.
// In plain terms: the logo's shape, defined once, used everywhere it
// appears.

/** The page: a full rounded rect. */
export const PAGE = { x: 5, y: 3, w: 14, h: 18, rx: 2 } as const;

/** Three evenly spaced content lines inside the page. */
export const CONTENT_LINES = [
  { x: 8, y: 9, w: 8 },
  { x: 8, y: 13, w: 8 },
  { x: 8, y: 17, w: 8 },
] as const;
