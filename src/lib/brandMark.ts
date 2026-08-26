// What this file is: single source of truth for the app's brand mark
// geometry -- a solid bird. The artwork is the "bird" icon from Phosphor
// Icons (https://phosphoricons.com), used unmodified under its MIT licence;
// it is a filled path on a 256x256 grid rather than a stroked 24x24 one.
// Both src/components/ui/Logo.tsx (the inline header icon) and
// scripts/build-favicon.ts (which generates public/favicon.svg) import these
// same values rather than each hand-transcribing its own copy.
// In plain terms: the logo's shape, defined once, used everywhere it
// appears.

/** The grid the mark is drawn on. Phosphor draws at 256, not Lucide's 24. */
export const MARK_VIEW_BOX = '0 0 256 256';

/**
 * The mark's filled paths, in draw order. Rendered with `fill`, not
 * `stroke` -- this is a solid icon, so callers set a fill colour and no
 * stroke at all.
 * In plain terms: the actual outline of the bird.
 */
export const MARK_PATHS = [
  'M176 68a12 12 0 1 1-12-12a12 12 0 0 1 12 12m64 12a8 8 0 0 1-3.56 6.66L216 100.28V120a104.11 104.11 0 0 1-104 104H24a16 16 0 0 1-12.49-26l.1-.12L96 96.63V76.89c0-33.42 26.79-60.73 59.71-60.89h.29a60 60 0 0 1 57.21 41.86l23.23 15.48A8 8 0 0 1 240 80m-22.42 0L201.9 69.54a8 8 0 0 1-3.31-4.64A44 44 0 0 0 156 32h-.22C131.64 32.12 112 52.25 112 76.89v22.63a8 8 0 0 1-1.85 5.13L24 208h26.9l70.94-85.12a8 8 0 1 1 12.29 10.24L71.75 208H112a88.1 88.1 0 0 0 88-88V96a8 8 0 0 1 3.56-6.66Z',
] as const;
