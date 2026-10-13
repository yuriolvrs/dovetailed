# 01 — Resume and cover letter editor overhaul

## Goal
Editing a tailored resume or cover letter should centre on the lines themselves: which
ones are on the page, which ones the job asks for, their wording, and their order.

## Links
- PRODUCT.md: "Nothing is invented", "Documents are data".
- CLAUDE.md: anti-fabrication rule (sourceMap evidence, UI flags unevidenced claims).

## Decisions
- Resume bullets are always visible and editable. No open/close step to reach them.
- "Recommended" comes from the posting's matches (matched route) or the direct read's
  picks (direct route), looked up by profile atom text. It no longer depends on the
  resume's own sourceMap, so left-out lines can be recommended too.
- A requirement coverage panel shows which requirements the resume covers, which
  ones a profile line could cover (one click adds it), and which have no evidence.
- AI rewording takes a goal (shorter, stronger verb, the posting's words). The same
  name-and-number filter applies, and the user can undo an applied suggestion.
- Cover letter citations are per sentence. The model returns sentences with their
  evidence ids and a `claim` flag. A claim sentence with no ids is flagged. Old
  per-paragraph citations still display.
- Cover letter paragraphs show citations inline (underline or amber) while staying
  editable; the caret's sentence shows its cited profile lines underneath.

## Tasks
1. `src/lib/jobFit.ts` + tests: recommendation lookup and requirement coverage.
2. Resume editor: `ResumeEditor`, `ResumeEntryBlock`, `ResumeBulletList`,
   `ResumeSkills`, `JobFitPanel`. Retire `BulletPicker` and the resume-only extras in
   `ProfileSections`.
3. `BulletRewriteSuggest`: goals, clearer suggestions, undo.
4. Cover letter prompt, validator and generation: sentence-level sourceMap + tests.
5. `src/lib/coverLetterCitations.ts` + tests: map a paragraph's text to cited spans.
6. Cover letter editor: inline citation highlights, evidence strip, paragraph reword,
   reorder.
7. Verify in Chrome at 1440 light/dark and 390; tsc, tests, detector; PROGRESS.md.
