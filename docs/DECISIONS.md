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

## 2026-10-17 — Follow-ups from re-running the personas (plan 03)

**Context:** Re-running the three evaluation personas on the new code showed: duties filled the 14-item cap and pushed out a key qualification; the claim repairs were never applied; the letter could not name a career change because the profile summary was not offered as evidence.
**Decision:** Analysis takes up to 12 qualifications and 8 duties and never drops a qualification for a duty. Each claim-check call numbers its items 0..n-1 and the code maps answers back, because the model renumbers by position. The profile summary is an atom labelled "Summary": it can be cited in the letter, but `runMatching` never offers it as evidence for a requirement, and it does not count as profile content on its own. Self-praise ("strong", "solid", "proven") is a fact the claim check must find in the evidence.
**Reason:** The live run showed each problem directly. A self-description is the user's own aim, which is fair to state in a letter, but it is not proof that a requirement is met.
**Status:** Accepted

## 2026-10-17 — Cover letters are planned in code and tidied by code (round 2)

**Context:** The blind re-judge after plan 03 still rejected every letter. Facts appeared under the wrong employer, sentences repeated after repair, "as stated in my profile" leaked, the letters recited the profile, and they never admitted a gap.
**Decision:** Code picks the plan before the model writes: the 2-3 most important covered requirements with their best line, one key gap, and the summary line. Their atoms are always offered. Each sentence returns the requirement ids it answers. After writing and after repair, fixed rules remove meta phrases and stock openers or closers and drop repeated sentences. A sentence that names an employer its cited lines do not belong to fails the claim check; the company applied to is never counted. Repairs see the whole paragraph.
**Reason:** Choosing what to say is deterministic work, so code is more reliable than the prompt. Text rules cannot be argued with by the model. Paragraph context stops a repair from copying its neighbour.
**Status:** Accepted

## 2026-10-17 — The resume opens before the letter; bad replies retry once (round 2)

**Context:** A build took 60–130 s, most of it the letter. One letter call failed with an unusable reply and needed a manual retry.
**Decision:** The build page opens the documents page when the resume is saved. The Cover Letter tab shows the letter being written, with Stop, and loads it when saved. On a letter failure the tab offers its own generate button, not a full rebuild, so resume edits are kept. Posting analysis and the letter retry once on a JSON parse error, an empty reply, a proxy 5xx or a dropped connection, never after Stop and never on 4xx (a 429 already has its own backoff).
**Reason:** The resume is useful on its own, so the user should not wait for the letter. One retry fixes most malformed replies at low cost; more retries would hide real failures and burn the daily token budget.
**Status:** Accepted
