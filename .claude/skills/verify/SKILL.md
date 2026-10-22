---
name: verify
description: Build/launch/drive recipe for verifying changes in this app at runtime.
---

# Verifying this app

No dedicated build/test infra beyond the standard scripts. This is a
Vite + React + TS SPA with no backend — all state lives in IndexedDB
(Dexie) in the browser, so verification means driving the actual UI.

## Build & static checks (not verification by themselves — run first to catch breakage early)
```
npm run build   # tsc -b && vite build, strict mode
npm run test    # vitest run
```

## Launch
```
npm run dev
```
Vite defaults to port 5173 but will pick the next free port (5174,
...) if occupied — check its stdout for the actual URL.

## Drive it (browser)
In the desktop app, use the built-in browser: add a `.claude/launch.json`
entry for `npm run dev` and open it with `preview_start`. Elsewhere, use
`npx playwright install chromium` (installs on demand, ~10s if cached)
plus a throwaway Node script with `import { chromium } from 'playwright'`
against the scratchpad's own `node_modules` (run `npm init -y && npm
install playwright` in the scratchpad dir once per session). Launch
headless, `page.goto('http://localhost:<port>/profile')`, drive with
`getByRole`/`getByLabel`, screenshot with `page.screenshot(...)`.

Gotcha: several buttons share partial names (e.g. "Add skill" vs "Add
skill group") — use `{ name: '...', exact: true }` or scope the
locator to avoid Playwright's strict-mode ambiguity error.

## Worthwhile flows to drive
- Fill every Profile section (contact, summary, skills, experience,
  projects, education, writing samples) and reload — confirms Dexie
  persistence, not just React state.
- Export JSON, delete all data, import the exported JSON back, reload
  — confirms the full backup round-trip actually restores from disk,
  not from in-memory state.
- Probe: import a malformed JSON file (should show a clear error, not
  crash); click Delete All Data then Cancel (should not delete).

## Known gotcha this caught once
`BackupControls` renders success `message` only when `!error` is also
true. If an error was shown earlier (e.g. from a bad import) and the
user then does something that succeeds, the success message can be
silently swallowed unless every success handler explicitly clears
`error` first. Worth re-checking if this component's message/error
state logic changes.
