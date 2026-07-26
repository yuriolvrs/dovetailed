# IMPROVEMENTS PLAN

> Running list of proposed improvements from the 2026-07-25 review session, with the user's decision on each. Numbering matches the original review reply so it can be referenced later. Update status as items are completed; don't delete resolved items, mark them done.

## 1. Matching logic

- **1.1 — Expand synonym/vocabulary list.** DONE, in two batches. First batch: user ran the external-LLM prompt below and pasted back ~140 groups covering broader tech vocabulary (frontend/backend frameworks, databases, cloud/infra, testing, security, data/ML) and business/corporate vocabulary (strategy, HR, procurement, risk, comms). Second batch: ~55 more groups covering marketing/growth vocabulary (SEO, paid acquisition, email/lifecycle marketing, social, brand, analytics). Both merged by hand into `src/lib/matching/synonyms.ts` after checking for exact-term collisions -- folded overlapping terms into existing groups instead of duplicating (e.g. `pgsql` into postgres; CI/CD tool names into the existing ci/cd groups; `organic search`/`organic growth` into the existing `seo` group; the two public-relations-adjacent groups and the two competitive-intelligence-adjacent groups each merged into one; brand management and thought-leadership groups extended rather than duplicated), and resolved a few collisions within the pasted lists themselves (`distributed systems`, `publicity`, and `gtm` -- which ambiguously meant either "go-to-market" or "Google Tag Manager" in the same batch, kept only on the go-to-market group as the more common resume/posting usage). Verified programmatically after each batch (no duplicate terms remain anywhere except the pre-existing intentional `ci`/`cd` overlap) -- 196 groups / 753 unique terms total. Build/tests (120 tests) green throughout.
- **1.2 — Let education count as matching evidence.** DECISION: rejected. Education should always appear on a resume regardless of match status; counting it as evidence would just burn LLM calls for no benefit. No change.
- **1.3 — Distinguish the two gap types.** DONE. `RequirementMatch` gained an optional `consideredAtomIds` field (`src/types/index.ts`), populated by `runMatching.ts`/`statusAfterReject` whenever a requirement lands on `gap_unverified`. `MatchingReviewPage` now shows `gap_unverified` with an orange status dot (was the same red as `gap_no_candidates`) and, when selected, a "Considered but not confirmed" panel listing those atoms with a one-click "Use as evidence" button. Verified live via Playwright against the real Groq API + unit tests.
- **1.4 — Cancel button during matching.** DONE. `generate()`/`generateStructured()` (`src/lib/llm.ts`) accept an `AbortSignal`; `runMatching`/`mapWithConcurrency` thread it through and stop starting new requirement checks once aborted. `MatchingReviewPage` creates an `AbortController` per rematch pass and shows a Cancel button next to the progress bar; cancelling resets to idle with no error and no partial save. Verified live.
- **1.5 — Overall numeric fit score.** DONE. New pure function `computeFitScore` (`src/lib/matching/fitScore.ts`) — required requirements weighted 2x preferred, full=1/partial=0.5/gap=0, returns null before matching has run. Shown as a colored "Fit score: N%" badge on `MatchingReviewPage` and a "Fit: N%" badge on each `JobsPage` list card. Unit-tested (5 tests) and verified live.

## 2. Resume generator logic

- **2.1 — Optional LLM-assisted bullet rewriting.** DONE. New `src/prompts/suggestBulletRewrite.ts` builds a per-bullet rewrite prompt and, critically, filters every suggestion through `introducesUnsupportedClaims` (unit-tested) before it's ever shown -- blocks any suggestion that introduces a new capitalized proper-noun-like term (skill/tool/company name) or a new number not in the original bullet, since those are exactly the two fabrication patterns the earlier LLM-rewriting design actually produced (see `selectResumeContent.ts`'s history). New `src/components/resume/BulletRewriteSuggest.tsx` renders a "Suggest rewording" link under each experience/project bullet in `ResumeEditor` (wired via a new `bulletRewrite` prop on `StringList`/`ExperienceForm`/`ProjectsForm`, same pattern as the existing "Matched" badge) -- one explicit click per bullet, never run automatically alongside generation; suggestions are shown as options with a checkmark to apply or a Dismiss, nothing auto-applies. Verified live against the real Groq API -- got real, safe paraphrase suggestions with no invented claims.
- **2.2 — Bullet caps hardcoded to one template's density.** DONE. Added `Profile.resumeDensity: 'compact' | 'standard' | 'detailed'` (defaults to 'standard' for old profiles). `selectResumeContent.ts`'s caps are now a `DENSITY_CAPS` table keyed by that setting (compact: 3/3/1, standard: 5/4/2, detailed: 7/5/3 -- experience bullets/project bullets/max projects) instead of fixed constants. A density selector on `ResumePage` next to Regenerate lets the user change it (persisted to the profile; takes effect on next Regenerate). Unit-tested.
- **2.3 — "Matched" badge disappears on minor bullet edits.** DONE. `ResumeEditor.tsx`'s badge lookup now normalizes whitespace, case, and trailing punctuation before comparing bullet text to the sourceMap, so trivial edits (typo fix, tidying spacing, adding a period) keep the badge; a substantive rewrite still loses it, which is intentional. Verified live.
- **2.4 — Version history for generated resumes.** DONE. New `GenerationSnapshot` type + Dexie table `generationSnapshots` (SCHEMA_VERSION bumped 2->3, included in export/import/delete-all). `genStore.ts` gained `snapshotGeneration`/`listSnapshots`/`deleteSnapshot`. `ResumePage` snapshots the current generation right before it's about to be overwritten (Regenerate, or restoring a different snapshot) -- never on the very first build, never for an already-stale/untrustworthy generation (nothing worth keeping there). A "History (N)" panel lists past versions with a Restore action (two-step confirm, same pattern as the rest of the app). Verified live -- regenerated, saw history appear, restored an earlier version successfully.
- **2.5 — Cover letter generation.** DECISION: deferred to its planned phase (Phase 5). No action now.
- **2.6 — LaTeX export.** DECISION: deferred to its planned phase (Phase 6). No action now.
- **2.7 — Unused writingSamples field.** DECISION: deferred — will become relevant once cover letters (Phase 5) are built. No action now.

### Bug found and fixed while verifying section 2 live (not on the original list)
While live-testing 2.1/2.3 (which both involve editing a bullet's wording), found that `ResumePage.tsx`'s "stale/needs rebuilding" check was being recomputed live on every render from the in-progress edit, instead of once when the generation was first loaded from storage. That meant **any** hand-edit to a bullet's wording (a typo fix, or applying a rewrite suggestion) immediately hid the whole editor and replaced it with "This resume needs to be rebuilt," discarding the edit -- which would have made both 2.1 and 2.3 unusable in practice, and was a real pre-existing bug independent of this session's changes (anyone hand-editing a bullet's wording at all would have hit it). Fixed by checking staleness once at load time (`stale` is now its own piece of state, set in `refresh()` and reset to `false` after a successful Regenerate/Restore) instead of a value derived fresh on every render.

## 3. User flow

- **3.1 — Step-by-step guidance across the whole journey.** DECISION: deferred. User is considering an overhaul of the whole flow and will provide UI mockups later. Revisit then.
- **3.2 — Job list should show which step a posting is on.** DECISION: approved, implement (not analyzed / analyzed / matched / resume generated, etc., instead of just "Analyzed"/"Not analyzed"). NOT YET IMPLEMENTED.
- **3.3 — Improve deep-link-before-ready handling.** DECISION: approved, improve (currently just a text fallback + link back when visiting `/jobs/:id/match` or `/jobs/:id/resume` before the prior step is done). NOT YET IMPLEMENTED.

## 4. UI/UX and quality-of-life

- **4.1 — Skeleton loading states instead of plain "Loading…" text.** DECISION: approved, implement. NOT YET IMPLEMENTED.
- **4.2 — Undo (not just confirm) for destructive actions.** DECISION: approved IF easy. Needs a quick feasibility check (e.g. a lightweight toast+timeout undo for Clear Matches/Delete Posting) before committing to full implementation.
- **4.3 — Drag-to-reorder for experience/project entries and bullets.** DECISION: approved, implement.
- **4.4 — "Unsaved changes" indicator on blur-saved fields (summary, posting text).** DECISION: approved, implement.
- **4.5 — Profile completeness indicator.** DECISION: approved, implement (e.g. a percentage-filled meter on the Profile page, building on the existing `hasProfileContent` check).
- **4.6 — In-app print/PDF preview pane.** DECISION: approved IF easy — needs a quick feasibility check (e.g. an iframe/print-css preview vs. relying on `window.print()`).
- **4.7 — Dense Experience form; how would generation work for a summary-only user?** DECISION: open question raised by user — "how would resume generation work if a user only fills in a summary line, no experience/projects/education?" Needs answering before any form-density changes are made. Current behavior: `selectResumeContent.ts` always keeps every experience/project entry in full and just reorders bullets — with zero experience entries, the generated resume would simply have an empty Experience section (contact/summary/skills/education still populate normally). Not a crash risk, just a thin resume. Worth confirming this is acceptable or whether the UI should nudge users to fill in more before generating.
- **4.8 — Remove/hide the unlinked `/dev/llm` debug route from production.** DECISION: approved, implement.

## External-LLM prompt for 1.1 (vocabulary expansion)

Use this prompt with Claude/Gemini/ChatGPT to brainstorm more synonym groups, then bring the output back here to merge into `src/lib/matching/synonyms.ts`:

```
I'm building a keyword-matching system that compares a job posting's requirements
against a candidate's resume/profile text using token overlap. To catch cases where
the requirement and the resume use different words for the same thing, I maintain a
list of "synonym groups" — sets of interchangeable terms/phrases. If a requirement
and a resume snippet each contain a term from the same group, they're treated as a
match even though the exact words differ.

Existing groups look like this (each group is a set of interchangeable terms/phrases,
case-insensitive, can be single words or multi-word phrases):

- ["java", "jvm"]
- ["spring", "spring boot", "spring mvc"]
- ["kubernetes", "k8s"]
- ["javascript", "js", "typescript", "ts", "node", "node.js"]
- ["aws", "amazon web services"]
- ["gcp", "google cloud", "google cloud platform"]
- ["machine learning", "ml", "ai", "artificial intelligence"]
- ["rest", "restful", "rest api"]
- ["ui", "ux", "user interface", "user experience"]
- ["microsoft office", "ms office", "excel", "word", "powerpoint", "outlook"]
- ["google workspace", "google docs", "google sheets", "google slides"]
- ["e-commerce", "ecommerce", "online retail"]
- ["seo", "search engine optimization"]
- ["digital marketing", "online marketing"]
- ["canva", "graphic design", "photography", "content creation"]

Please generate more synonym groups in this exact format (a flat list of arrays of
lowercase strings, one group per line, no explanation needed) covering as many
common job-posting/resume vocabulary mismatches as you can think of, across a wide
range of industries — not just tech. Include groups for at least: healthcare,
finance/accounting, legal, education/teaching, sales, customer service, hospitality,
manufacturing/warehouse/logistics, skilled trades, general soft skills (e.g.
"communication", "interpersonal skills"), and common software/tools across
industries (e.g. Salesforce, QuickBooks, Slack, Zoom, POS systems). Also include
common abbreviation/acronym expansions (e.g. "CRM" / "customer relationship
management") and common degree/certification abbreviations if relevant
(e.g. "RN" / "registered nurse" — though note this system does NOT use degree
requirements for matching, only skills/experience, so skip pure-degree-name groups).

Output only the list, no other commentary.
```

Once the user pastes back the output, dedupe against `synonyms.ts`'s existing `SYNONYM_GROUPS` and append the new groups.
