# UX Polish Plan

Follow-up work items from a resume-viability review, scoped to UI/UX polish only (no new product features). Each item should be verified live in the running app before being checked off, per CLAUDE.md.

## Checklist

- [ ] **Hover-based sourceMap detail** — hovering a resume/cover-letter bullet shows which profile atom(s) it's grounded in (use hover, not click, since clicking a bullet already opens edit actions).
- [ ] **Loading/skeleton states for all async actions** — every LLM call and any other async action (analysis, matching, resume/cover-letter generation, LaTeX conversion, OCR extraction, import/export) gets a proper pending state instead of a blank wait.
- [ ] **Consistent empty states across all sections** — audit Profile, Jobs, Job Detail, Resume, Cover Letter, and any other section for empty-state presence and a shared visual/copy pattern; bring outliers in line.
- [ ] **Dark mode** — theme toggle covering all pages/components, including print views if applicable.
- [ ] **Version diff/comparison view** — surface `genStore.ts`'s existing generation history as a "previous vs. current" comparison in the UI (resume and cover letter).
- [ ] **Autosave confirmation indicator** — small transient "Saved" indicator wherever autosave-on-blur/change already happens (Profile fields, etc.).
- [ ] **Toast/inline confirmations for actions** — consistent feedback pattern for delete, regenerate, export, import, and other state-changing actions, instead of relying on silent state changes.
- [ ] **Multi-step generation progress** — where generation involves multiple sequential LLM calls (e.g. evidence matching, per-section resume selection, cover letter drafting), show step-by-step progress instead of one opaque spinner.
- [ ] **Manual reordering (drag-and-drop)** — let the user reorder resume bullets, experience entries, or skill categories by hand, on top of the automatic match-based ordering.
- [ ] **Accessibility pass** — visible focus rings, correct label/input associations, contrast check on badges and buttons across the app.
- [ ] **Responsive/mobile layout check** — verify all pages render usably at mobile widths; fix any broken layouts.

## Notes
- Items above are UX/polish only — no changes to data model, LLM prompts, or generation logic are expected as part of this plan.
- Loading-state and empty-state items should reuse the existing shared primitives in `src/components/ui/primitives.tsx` rather than introducing new one-off patterns.

## Feature additions (beyond UX/QoL)

- [x] **"Improve wording" button per experience/project entry** *(top priority)* — done 2026-08-18. A per-bullet "Suggest rewording" action (`BulletRewriteSuggest`) already existed for the resume editor; wired the same component into the Profile page's Experience and Projects tabs via each form's existing `bulletRewrite` prop. Same evidence-grounding constraint as the job-description-upload item below: it may rephrase, not invent — no new claims, metrics, or achievements beyond what the original bullet already said.
- [x] **Profile page restructure into tabs** *(top priority)* — done 2026-08-18. `ProfilePage.tsx` rewritten with browser-tab-style navigation (rounded top corners, active tab flush against a white content panel, numbered/checkmark/alert badges replacing the old sidebar's flags), matching the approved mockup. Import-from-resume and backup/restore combined into one "Import & Data" tab. A Prev/Next footer and left/right arrow-key tab switching were added. Verified live via Playwright against the real dev server: visual match to the mockup, Dexie persistence survives reload, tab-click and arrow-key navigation both work, zero console errors; `npm run build` and `npm run test` (275) green. Mockup-review follow-ups resolved:
  - Drag handle, hover state, and remove control on list rows: **no work needed** — `ContactForm`/`ExperienceForm`/etc. were reused unchanged, and `EditableList`'s existing drag handle/hover/`RemoveItemButton` carried over automatically since the mockup's flat-row styling was never applied to the real components.
  - Empty-state per tab: carried over as-is from the existing components (e.g. "No experience entries yet.") — still subject to the separate "Consistent empty states across all sections" audit above, not re-verified here.
  - "Unsaved" indicator: carried over as-is (`WritingSamplesForm`/`TexTemplateSection` untouched).
  - Left/right arrow-key tab navigation: implemented.
- [x] **Job-description-document upload → profile entry** *(top priority)* — done 2026-08-18. New "Add a Job or Project from a Document" section on the Profile page's Import & Data tab (`JobDocumentImportSection.tsx`), next to the existing resume import. Attaching a document (old job description, offer letter, role summary, project brief) runs it through a new evidence-grounded generation prompt (`generateEntryFromDocument.ts`) that classifies it as a job or project, transcribes the identifying fields (company/title/dates or name) verbatim, and writes 3-6 ATS-ready bullets. A new anti-fabrication check (`verifyGeneratedEntry.ts`, reusing the same proper-noun/number heuristic `suggestBulletRewrite.ts` already uses, checked against the whole document) flags any generated bullet that mentions a skill, tool, or number not actually in the source document, before the user applies it. Nothing is written to the profile until the user reviews and clicks "Add to my profile"; the classified kind (experience/project) is user-correctable before applying.
- [ ] **Application tracker** *(low priority)* — status per job posting (applied / interviewing / rejected / offer) with dates, plus a deadline field and `.ics` calendar export. Already listed as a PRD §5 v2 candidate.
- [ ] **Interview prep generator** *(low priority)* — reuse the posting analysis + evidence-grounded pipeline (same sourceMap approach as resume/cover letter) to generate likely interview questions, each backed by a specific profile atom.
- [ ] **Additional export formats** — DOCX and Markdown alongside the existing HTML/PDF/.tex export.

### Explicitly rejected (do not build)
- Multiple saved profiles/personas — the single-profile model already supports this; the user enters everything and generation selects what's relevant per posting.
- Local-model (Ollama) mode.
- Fit-score visualization.
- Multiple resume/cover-letter variants per job — adds a choice the user shouldn't have to make.
