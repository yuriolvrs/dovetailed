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
