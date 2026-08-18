// What this file is: the one rule deciding which ResumeContent entries
// actually make it onto a rendered resume -- an experience or project entry
// with no bullets left is dropped entirely rather than printed as a bare
// title/company/date header with nothing under it. Applied at render/export
// time only (ResumePrintView, templateContext), never to stored data, so an
// entry emptied in the editor stays there and comes straight back the moment
// a bullet is added. Education is deliberately untouched: a degree line with
// no detail bullets is a normal, complete entry.
// In plain terms: if you delete all the bullet points from a job, activity or
// project, it disappears from the resume instead of leaving a lonely heading
// -- add a bullet back and it returns.

import type { ResumeContent } from '../types';

/**
 * A copy of `content` with every bullet-less experience and project entry
 * removed. Section headings whose entries all vanish disappear with them,
 * since ResumePrintView groups whatever entries it's given.
 * In plain terms: strips out the jobs/projects that have nothing left to say.
 */
export function withRenderableEntries(content: ResumeContent): ResumeContent {
  return {
    ...content,
    experience: content.experience.filter((e) => e.bullets.length > 0),
    projects: content.projects.filter((p) => p.bullets.length > 0),
  };
}
