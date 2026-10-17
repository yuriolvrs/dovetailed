# Plan 03: Fixes from the 2026-10-17 outcome evaluation

**Goal:** Make a Dovetailed package at least as strong as the candidate's own resume and letter: no overstated letter claims, fewer false gaps, better bullet choice, and a LaTeX conversion that cannot silently break.

**Why:** The evaluation in `eval-runs/2026-10-17/REPORT.md` ran three fictional personas on the live site. Resumes were honest, but:
- Letters added claims the profile does not support ("reduced no-show rates" from "Made a spreadsheet to track no-shows"; "managed" from "assisted"), under a badge saying "Every claim cites your profile".
- Posting analysis kept 8 qualifications only, never duties. The matcher reported false gaps (customer service, copywriting, a B.S. against an associate degree) and one false cover (Mac).
- Selection dropped the best bullets while the page was half empty, and printed a self-negative line ("Windows (no Mac experiance)").
- Letters showed AI tells: a stock opener and closer, "seamless", "aligns perfectly", "honed", and U+2011 hyphens.
- LaTeX conversion was not repeatable: `{{skillGroups.itemsLine}}` on a list (empty Skills) and `\item` outside a list.
- A blind re-judge shortlisted 50% of Dovetailed packages against 83% for the same candidates unassisted.

**Docs to read:** CLAUDE.md (all of it: header comments, anti-fabrication, prompts JSON-only, tests, no new packages), `eval-runs/2026-10-17/REPORT.md`, `eval-runs/2026-10-17/outputs/*-run-log.md` for the concrete failures.

**Already done by the main session:** optional fields in `src/types/index.ts`: `Profile.summary`, `ResumeContent.summary`, `Requirement.kind` (`RequirementKind = 'qualification' | 'duty' | 'education'`), `SourceMapEntry.supported`. Do not edit `src/types/index.ts` in any task below; ask the main session if you need another field.

**Order:** 3.1 and 3.5 can run in parallel (different files). Then 3.2, 3.3, 3.4 one at a time (they share generation and import files).

---

## Task 3.1: Posting analysis and matching

**Goal:** Extract duties as well as qualifications, split compound requirements, and stop the false gaps and false covers seen in the evaluation.

**Files to touch:** `src/prompts/analyzePosting.ts` (+ test), `src/prompts/matchRequirement.ts` (+ test), `src/lib/matching/runMatching.ts` (+ test), `src/lib/matching/fitScore.ts` (+ test), new `src/lib/matching/degreeMatch.ts` (+ test). UI only if a label is needed: `src/components/resume/JobFitPanel.tsx`.

**Doc sections to read:** REPORT.md "Three biggest failure modes" item 2; run logs for the requirement panels.

**Steps:**
1. `analyzePosting.ts` prompt: extract from the whole posting, both qualifications and responsibilities/duties. Each item gets `kind`: `qualification`, `duty` or `education`. Raise the cap from 8 to 14. Keep the keyword cap.
2. Same prompt: split a compound requirement into separate items when its parts are independent ("Excellent customer service and written communication" → two items). Keep a list of tools as one item ("Shopify, Klaviyo, Canva").
3. Same prompt: degree requirements are now extracted with `kind: 'education'` (remove "Do NOT include degree/education requirements"). Language and licence requirements ("Bilingual", "active RN license") are qualifications; say so explicitly.
4. `isExtractedAnalysis` / `toJobAnalysis`: accept and copy `kind`; an unknown or missing kind becomes `'qualification'`. Old analyses without `kind` keep working.
5. New `degreeMatch.ts`: deterministic match of an `education` requirement against `profile.education` (or education atoms). Rank levels: high school < associate < bachelor < master < doctorate, recognising common forms (A.A., A.A.S., Associate, B.S., B.A., BSN, Bachelor, M.S., MBA, Ph.D. ...). Equal or higher level → `full`; a field named in the requirement that the degree does not mention → `partial`; nothing → gap. "or equivalent experience" → never a hard gap (`partial` at worst when experience exists). Return a `RequirementMatch` citing the education atom(s).
6. `runMatching.ts`: route `kind === 'education'` requirements to `degreeMatch` instead of the LLM. Other kinds go through the LLM as now.
7. `matchRequirement.ts` prompts (single and batch): (a) when some named parts are covered and others are not, return `partial` with the covering atoms, never an empty list; (b) list the strongest, most specific evidence first and prefer an experience bullet over a bare skill tag; (c) an atom that states the opposite ("no Mac experience") is not evidence for that item, and the requirement must not be `full` because of it; (d) semantic equivalents count ("Answered vendor phone and email questions" is customer-service evidence; "Wrote product descriptions" is copywriting evidence).
8. `fitScore.ts`: duties weigh less than qualifications (suggest: required qualification 2, preferred 1, duty 1, education as its severity). Keep partial = 0.5.
9. Tests for every step that changes code: kind parsing and defaults, degree ranking (B.S. satisfies associate; BSN satisfies bachelor; MBA satisfies bachelor; associate does not satisfy bachelor), routing in runMatching with a mocked LLM, fitScore weights, prompt text contains the new rules.

**Done when:** `npm run test` passes; `npx tsc -b` passes; the JobFitPanel still renders old postings (no `kind`).

**Out of scope:** resume selection, cover letter, LaTeX, `src/types/index.ts`.

---

## Task 3.2: Cover letter claim check and plainer prompt

**Goal:** The letter never claims more than its cited lines, and the green badge only shows when every claim passed a support check.

**Files to touch:** `src/prompts/generateCoverLetter.ts` (+ test), `src/lib/generation/generateCoverLetterContent.ts` (+ test), new `src/prompts/verifyClaims.ts` (+ test), new `src/lib/generation/verifyClaims.ts` (+ test), `src/lib/coverLetterCitations.ts` (+ test), `src/components/coverLetter/CoverLetterEditor.tsx` (badge text only).

**Doc sections to read:** CLAUDE.md "Anti-fabrication"; `eval-runs/2026-10-17/hiring-manager/judgments.md` "Detectable AI-style pattern".

**Steps:**
1. Prompt `generateCoverLetter.ts`:
   - Remove the "frame them around impact, outcomes, and business value" and "reframe operational tasks in terms of their impact" instructions.
   - Add: keep the profile's ownership verb ("assisted" stays "assisted", "helped with" never becomes "led" or "managed"); never add a result, number, scale ("high-volume"), or improvement the cited line does not state; never praise the company with facts not in the posting.
   - Ban the stock opener "I am excited to apply" and the closer "I look forward to discussing how my experience can contribute", and the words seamless, aligns perfectly, honed, dynamic, passionate, synergy, leverage. Open with the most relevant concrete fact instead.
   - When the profile shows a career change or an employment gap, the letter names it in one plain sentence (the evidence is the profile's own entries; it is a claim and must cite them).
   - Use plain ASCII hyphens.
2. `generateCoverLetterContent.ts`: replace U+2010, U+2011, U+2012 with "-" in every sentence, greeting and closing before building the sourceMap. Lower temperature from 0.5 to 0.3.
3. New prompt `verifyClaims.ts`: input is a list of `{index, sentence, evidence: string[]}`; output JSON `{"results":[{"index":0,"supported":true,"issue":""}]}`. A sentence is supported only if every fact in it (actions, ownership, results, numbers, scale, tools) is stated or directly implied by the evidence lines. Interest and fit statements about the posting are fine. Also export a repair prompt: given the unsupported sentences, their evidence and the issue, rewrite each to say only what the evidence says, JSON `{"repairs":[{"index":0,"text":"..."}]}`.
4. New `src/lib/generation/verifyClaims.ts`: `verifyClaimSentences(items, options)` runs the verify prompt once (all sentences in one call, through `generateStructured`, temperature 0) with the JSON contract (validate shape, one retry as other prompts do). Then one repair call for the failures, then re-verify the repaired ones; keep a repair only when it now passes, else keep the original and mark it unsupported. Return per-index `{text, supported}`. If the verify call itself fails, return everything with `supported` left undefined (the check did not run), never block the letter.
5. In `generateCoverLetterContent.ts`, after building sentences with atomIds, run `verifyClaimSentences` on claim sentences that cite atoms (evidence = the atoms' text). Apply repaired text and set `supported` on each sourceMap entry.
6. `coverLetterCitations.ts` `statusOf`: an entry with atomIds and `supported === false` is `'flagged'`. Keep all other rules. `carryCitations`: a reworded paragraph that carried an unsupported sentence stays flagged.
7. `CoverLetterEditor.tsx`: the green text reads "Every claim checked against your profile" only when there are no flagged spans and at least one entry has `supported === true`; when no entry has `supported` defined (older letters, or the check failed) keep the current text "Every claim cites your profile". The amber text stays as it is. The citation popover for a flagged-but-cited sentence should say the sentence goes beyond the cited lines (find where it explains "flagged" now and add that case; small change).
8. Tests with the LLM mocked: verify/repair/re-verify flow (pass, repaired, repair fails, verify errors), hyphen normalisation, statusOf with `supported: false`, prompt contains the bans and the ownership rule.

**Done when:** `npm run test` and `npx tsc -b` pass. A letter whose mocked verifier rejects one sentence shows "1 sentence makes a claim your profile doesn't back".

**Out of scope:** resume selection, matching, bullet reword (task 3.4), `src/types/index.ts`.

---

## Task 3.3: Resume selection and layout

**Goal:** Fill the page with the strongest evidence, never print a self-negative line, and lay the resume out like a hiring manager expects.

**Files to touch:** `src/lib/generation/selectResumeContent.ts` (+ test), `src/lib/generation/fitToPage.ts` (+ test), `src/lib/generation/fitToOnePage.tsx` only if the fill loop needs it, `src/components/resume/ResumePrintView.tsx`, the Markdown/DOCX exporters and `src/lib/latex/templateContext.ts` (for `summary` only), `src/prompts/extractProfile.ts` (+ test), the profile import merge (`src/lib/files/mergeProfile.ts` + test), the profile editor component that edits contact fields (add a Summary textarea, reuse the existing field components), backup import/validation if it rejects unknown fields.

**Doc sections to read:** REPORT.md table row "Best evidence dropped from resume"; `eval-runs/2026-10-17/hiring-manager/judgments.md` docs A5 and C2.

**Steps:**
1. Self-negative lines: add a deterministic check (`isSelfNegative(text)`) for phrases like "no X experience", "not familiar with", "limited", "never used", "(no ...)". In skills, drop only the negative item or parenthetical ("Windows (no Mac experiance)" → "Windows"). Never print a self-negative bullet. Tests.
2. Ranking: inside each entry, order bullets by weighted coverage (sum over matched requirements of the fitScore weight; full 1, partial 0.5), then original order. Unmatched bullets still count as fill.
3. Fill before trim: start each entry with all its bullets (matched first), and let `fitToOnePage` trim from the bottom of the least relevant entry using the existing `nextTrim` order. Today's cap `max(3, matchedCount)` leaves half a page empty; remove it or raise it so the page is filled. Keep the existing one-page guarantee.
4. Projects: a project with no bullets but a matched title or description must be kept (Persona B's thesis project was dropped; find why and fix it). Keep at most 2 projects.
5. Summary: `extractProfile.ts` reads the resume's summary/objective into `summary` verbatim. Merge keeps an existing summary unless the user picks the new one (follow how other single fields merge). Profile editor gets a Summary textarea. `selectResumeContent` copies `profile.summary` into `ResumeContent.summary` verbatim. ResumePrintView prints it under the contact line, with no heading or "Summary". Markdown, DOCX and LaTeX context include it (LaTeX: `{{summary}}`, empty string when missing).
6. Order: in ResumePrintView (and the exporters), when the resume has at least one experience entry, Experience comes before Education. Otherwise keep Education first.
7. Duplicated location: when `location` already appears inside the company string, do not print it a second time (Persona A printed "Riverbend Community Hospital, Vancouver, WA" then "Vancouver, WA"). Also tell `extractProfile` to keep company and location in separate fields.
8. Tests for each step.

**Done when:** `npm run test` and `npx tsc -b` pass. For Persona C's profile (`eval-runs/2026-10-17/resumes/C-marcus-oyelaran-base.txt`) the selected resume has no "no Mac" text and keeps "Worked with production and sales on billing issues".

**Out of scope:** matching prompts, cover letter, `src/types/index.ts`.

---

## Task 3.4: Reword suggestions pass the claim check; typo notes at import

**Goal:** A suggested bullet or paragraph rewrite can never say more than the original; import points out typos without changing anything.

**Files to touch:** `src/prompts/suggestBulletRewrite.ts` (+ test), wherever the bullet and paragraph reword suggestions are fetched (find the caller of `filterSafeSuggestions` / `filterSafeParagraphSuggestions`), `src/prompts/extractProfile.ts` (+ test), `src/components/profile/ImportResumeSection.tsx`.

**Doc sections to read:** Task 3.2 (uses its `verifyClaimSentences`).

**Steps:**
1. After the existing safe filters, run `verifyClaimSentences` with the original bullet (or paragraph) as the only evidence. Drop suggestions that fail; skip repair (pass an option to `verifyClaimSentences` to disable repair). If the check fails to run, keep today's behavior.
2. `extractProfile.ts`: add optional `spelling: [{ "text": "experiance", "suggestion": "experience" }]` to the output. Validate the shape; ignore it if malformed. Never correct the extracted text itself.
3. Import review UI: show the list as a small note ("Possible typos: experiance → experience") above "Add to my profile". Reuse an existing note/alert style. No auto-fix.
4. Tests with the LLM mocked.

**Done when:** `npm run test` and `npx tsc -b` pass.

**Out of scope:** everything else.

---

## Task 3.5: LaTeX conversion validation

**Goal:** A converted template that would print an empty section or fail to compile is rejected and retried, not saved silently.

**Files to touch:** new `src/lib/latex/validateTemplate.ts` (+ test), `src/lib/latex/convertTemplate.ts` (+ test), `src/prompts/convertLatexTemplate.ts` (+ test) if the prompt needs the rules stated.

**Doc sections to read:** `src/lib/latex/templateContext.ts` (`buildLatexContext`: the real context shape), `src/lib/latex/fillTemplate.ts` (`parseLatexTemplate`, `fillLatexTemplate`), `eval-runs/2026-10-17/latex/` (both bad conversions).

**Steps:**
1. `validateTemplate(template)` returns a list of problems:
   - Every `{{path}}` resolves against the context shape built by `buildLatexContext` from a sample `ResumeContent` (write one fixture with every field filled, including gpa and summary). A path through an array field outside its `{{#each}}` is a problem ("`skillGroups.itemsLine` is a list; use {{#each skillGroups}}...").
   - Sections that exist in the context (experience, education, skills) are referenced somewhere.
   - Fill the template with the sample content, then a static check on the output: balanced braces, matched `\begin`/`\end`, and every `\item` inside an itemize/enumerate/description (or a list-like custom environment the template defines) environment.
2. `convertTemplate.ts`: after conversion, run `validateTemplate`. On problems, retry the conversion once with the problems appended to the prompt. If it still fails, return the result with the problems so the Settings UI shows them (find how the UI shows conversion errors now and pass them through; no new UI pattern). Call `generateStructured` with temperature 0.
3. Prompt: state the two rules that broke in the evaluation (list fields only inside `#each`; `\item` only inside a list environment).
4. Tests: both bad templates from `eval-runs/2026-10-17/latex/` (copy the relevant snippets into the test file) are rejected with a clear message; the default template passes; retry flow with a mocked LLM.

**Done when:** `npm run test` and `npx tsc -b` pass.

**Out of scope:** everything outside `src/lib/latex/` and `src/prompts/convertLatexTemplate.ts` except the settings UI pass-through.
