// What this file is: the reverse "which field to scroll to" type for the
// Cover Letter tab's live preview -- clicking the greeting, a paragraph, or
// the closing in the preview requests the editor scroll to and flash that
// same field. Mirrors ResumeNavTarget (resumeEntryKeys.ts) for the Resume
// tab; kept separate since a cover letter has no accordion entries to open,
// just three flat targets.
// In plain terms: a way to say "jump to this part of the cover letter
// editor" when you click the matching part of the preview.

export type CoverLetterNavTarget = { section: 'greeting' } | { section: 'paragraph'; index: number } | { section: 'closing' };
