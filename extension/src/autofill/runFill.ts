// What this file is: the shared fill run for one frame. It checks for a blocked site, reads the profile, fills the form and returns a summary with no field values. The popup script and the in-page button both call it.
// In plain terms: the one "fill this page" routine, used whether you click the toolbar icon or the small button on the form.
import { getProfile, getResume, listResumes } from '../lib/data';
import { isBlockedSite } from '../lib/blockedSites';
import { atsOriginFor } from './atsHosts';
import { fillPage } from './fill';
import { chooseResume } from './resumeChooser';
import type { FrameResult } from './report';

/**
 * Finds the resume to attach. It lists the references first, with no bytes. With none stored it
 * returns null. With one it returns that file. With several it asks on the page, then fetches
 * only the chosen file. "Don't attach" gives 'skipped'.
 * In plain terms: picks your resume, asking you on the page when you keep more than one.
 */
export async function getResumeFile(input: HTMLInputElement): Promise<File | null | 'skipped'> {
  const refs = await listResumes();
  if (refs.length === 0) return null;
  if (refs.length === 1) return getResume(refs[0].id);
  const id = await chooseResume(refs, input);
  return id ? getResume(id) : 'skipped';
}

/**
 * Fills the form in the current frame. The blocked-site check runs first, before the profile is read.
 * The top frame also lists the known job-board iframes on the page.
 * In plain terms: types your details into this page's form, or does nothing on a blocked site.
 */
export async function runFill(): Promise<FrameResult> {
  const url = location.href;
  const empty = { url, formFound: false, filled: 0, requiredBlank: [], incomplete: [], fields: [] };
  if (isBlockedSite(url)) return { ...empty, blocked: true };

  const profile = await getProfile();
  const report = await fillPage(profile, document, { resume: { getFile: getResumeFile } });
  const result: FrameResult = { ...report, url, blocked: false };
  if (window === window.top) {
    // Known job-board iframes on this page. The popup compares them with the frames that answered.
    result.atsIframes = Array.from(document.querySelectorAll('iframe'))
      .map((f) => f.src)
      .filter((src) => src && atsOriginFor(src));
  }
  return result;
}
