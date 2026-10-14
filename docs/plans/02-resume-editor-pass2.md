# Plan 02: Resume editor, second pass

**Goal:** Make the job's recommendations visible by default and make each bullet look and feel like an editable object.

**Why:** The user reviewed the rebuilt resume editor and was not satisfied. Findings: the fit panel is collapsed so recommendations are hidden; bullets read as plain text with actions only on hover; three small prompts per entry compete; the contact and education cards outrank the job-tailored content.

**Decision on a master/detail layout:** not done. The resume has 2 to 5 entries per section, the live preview already works as the navigator ("Select any part of the preview to edit it there"), and a second pane would hide content that now fits on one scroll.

**Docs to read:** `docs/plans/01-document-editors.md`, CLAUDE.md (Conventions: header comments, reuse existing UI, no new packages).

## Task 2.1: Fit panel open by default

**Files:** `src/components/resume/JobFitPanel.tsx`

1. Change `useState(addable > 0)` so the list is open whenever `hasList` is true. Keep the toggle so the user can collapse it.
2. In the collapsed header, keep the current text. When closed and `addable > 0`, the amber "N more can be added" text stays.
3. Update the header comment: "Opens by itself" becomes "Open by default".

**Done when:** loading the Documents page on a matched posting shows the requirement list without a click.

## Task 2.2: Bullets as visible objects

**Files:** `src/components/EditableList.tsx`, `src/components/StringList.tsx`, `src/components/resume/ResumeEntryBlock.tsx`

1. Add an optional prop `actionsAlwaysVisible?: boolean` to `EditableList` and pass it through `StringList`. When true, `hoverActionClass` is an empty string for the grip and the action group. Default false, so Profile and cover letter lists do not change.
2. In `EditableList` flat rows, when `actionsAlwaysVisible` is true, show a resting border: `border-slate-200 dark:border-slate-800` instead of `border-transparent`, so each bullet reads as a row you can act on.
3. In `ResumeEntryBlock`, pass `actionsAlwaysVisible` to the bullet `StringList`.
4. In the `itemActions` Reword button, show the text "Reword" beside the Sparkles icon (`text-xs`, keep the aria-label and title). Keep the active-state colors.
5. Icon colors at rest must keep AA contrast: use `text-slate-500 dark:text-slate-400`, never lighter.

**Done when:** at 1440 px, every bullet shows a grip, "Reword" and a remove button without hovering, and the row text does not overflow its card at 390 px or 1440 px.

## Task 2.3: One footer row per entry, labelled Edit

**Files:** `src/components/resume/ResumeEntryBlock.tsx`, `src/components/BulletPicker.tsx`

1. Replace the pencil `IconBtn` in the entry heading with a small ghost `Btn` (size `sm`) with a Pencil icon and the text "Edit", matching the Contact card's Edit button. Keep `aria-pressed` behavior through `aria-expanded` and keep the label "Edit title and dates" as `ariaLabel`. Keep Move up, Move down and Take off as they are.
2. Put "Write a bullet" and the "N more from your profile" toggle on one footer row (`flex flex-wrap items-center justify-between gap-2`). To do this, give `BulletPicker` an optional prop `renderFooter?: (toggle: ReactNode) => ReactNode` OR move the toggle button out as an exported small component. Choose the smaller change. The "Also fits this job" list stays below the footer.
3. Tint the "Also fits this job" block: `rounded-lg bg-emerald-50 px-2 py-1.5 dark:bg-emerald-500/10`. Use `text-emerald-800 dark:text-emerald-300` for its title.

**Done when:** an entry with left-out bullets shows one footer row with both controls, and fitting left-out bullets sit in a green-tinted block above it.

## Task 2.4: Job-tailored content first

**Files:** `src/components/resume/ResumeEditor.tsx`

1. Move `ContactSection` and `EducationSection` below Skills, in that order (Education then Contact). Do not change their props.
2. Do not change the preview or the nav/scroll effects.

**Done when:** the editor order is Fit panel, Experience, Projects, Skills, Education, Contact. `npm run test` and `npx tsc -b` pass.

**Out of scope:** Profile page lists, cover letter files, any prompt or LLM code.
