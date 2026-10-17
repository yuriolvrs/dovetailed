# Decisions

Each entry: **Context** (what prompted it), **Decision** (what we chose), **Reason** (why), **Status** (Accepted / Proposed).

## 2026-10-17 — Posting analysis reads duties and degrees (plan 03, task 3.1)

**Context:** The outcome evaluation (`eval-runs/2026-10-17/REPORT.md`) found that analysis kept at most 8 qualifications and no duties. The best fits sat in the duties ("monitor progress against approved estimates"). The matcher also gave false gaps for compound requirements and for a degree.
**Decision:** Analysis extracts up to 14 items from the whole posting. Each has a `kind`: qualification, duty or education. Independent parts of a requirement are split; a tool list stays one item. Degree requirements are matched by code (`degreeMatch.ts`, level ranking), not by the LLM. Each education entry now yields a degree atom so a degree match can cite it. In the fit score a duty weighs 1; other kinds keep their severity weight.
**Reason:** Duties are where career changers have evidence. A degree level comparison is deterministic, so code is more reliable than a model call. A requirement with no `kind` (older postings) is treated as a qualification, so stored data keeps working.
**Status:** Accepted

## 2026-10-17 — Converted LaTeX templates are validated (plan 03, task 3.5)

**Context:** Two conversions of the same template differed. One put a list field outside `#each` (empty Skills). The other put `\item` outside a list (fails to compile when a GPA exists). Nothing warned the user.
**Decision:** `validateTemplate` checks placeholder paths against the real `buildLatexContext` shape, checks that experience, education and skills are referenced, and fills a full sample resume, then checks braces, environments and `\item` placement in the document body. Conversion runs at temperature 0 and retries once with the problems in the prompt. The Settings editor shows the problems live for any draft. Save is not blocked.
**Reason:** The checks are cheap and deterministic. Showing problems on hand edits too keeps one rule for all templates. Not blocking save keeps the user in control of templates the checker cannot understand.
**Status:** Accepted

## 2026-10-17 — Cover letter claims are checked, not only cited (plan 03, task 3.2)

**Context:** Every evaluated letter had sentences that said more than their cited lines ("reduced no-show rates" citing "Made a spreadsheet to track no-shows"), under a badge saying "Every claim cites your profile". The prompt asked the model to frame tasks around impact and business value.
**Decision:** After generation, one LLM call checks each cited claim sentence against the text of the lines it cites (temperature 0). Failures get one repair call; a repair is kept only if a re-check passes. Otherwise the sentence is flagged in the editor ("goes beyond the profile lines it cites"). The green badge says "Every claim checked against your profile" only when every cited claim passed. If the check cannot run, the letter is not blocked and the old wording is kept. The impact framing is removed from the prompt; ownership verbs, a ban on added results and scale, a list of banned stock phrases, and a plain sentence about a career change or gap are added.
**Reason:** Citation alone proves a link, not support. A separate check with only the evidence in view catches inflation that the writer prompt allows. Keeping a repair only after it passes means the fix itself cannot add a new claim.
**Status:** Accepted

## 2026-10-17 — Resume selection fills the page and drops self-negative lines (plan 03, task 3.3)

**Context:** Tailored resumes kept 3 bullets per entry, so the page was half empty while the best evidence ("Trained new nurses", "Worked with production and sales on billing issues") was dropped. A skill line "Windows (no Mac experiance)" was printed. A bullet-less thesis project was dropped. The user's summary line was lost on import, education printed above eight years of experience, and the location printed twice.
**Decision:** No per-entry bullet cap. Bullets are ordered by weighted coverage (fit-score weight times match status, summed over requirements), and `fitToOnePage` trims from the bottom as before. Self-negative bullets are not printed, and a self-negative parenthetical is cut from a skill item. A project with a description and no bullets is kept. `Profile.summary` is imported verbatim and printed under the contact line. Experience prints before Education when there is any experience. A location already inside the company text is not repeated.
**Reason:** The page-fit step already measures the real page, so a fixed cap only removed evidence. A self-negative line hurts the candidate; a dropped bullet stays one click away in the editor's "more from your profile" list, so a false positive is recoverable.
**Status:** Accepted
