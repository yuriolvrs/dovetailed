// What this file is: an unlisted script the popup injects into every frame of the page on click. It fills the form and returns a summary with no field values.
// In plain terms: the part that runs inside the web page and types your details into the form.
import { atsOriginFor } from '../src/autofill/atsHosts';
import { fillPage } from '../src/autofill/fill';
import type { FrameResult } from '../src/autofill/report';
import { isBlockedSite } from '../src/lib/blockedSites';
import { getProfile, getResume } from '../src/lib/data';

export default defineUnlistedScript(async (): Promise<FrameResult> => {
  const url = location.href;
  const empty = { url, formFound: false, filled: 0, requiredBlank: [], incomplete: [], fields: [] };
  // Blocked sites are checked first, in every frame, before anything is read.
  if (isBlockedSite(url)) return { ...empty, blocked: true };

  const profile = await getProfile();
  const report = await fillPage(profile, document, { resume: { getFile: getResume } });
  const result: FrameResult = { ...report, url, blocked: false };
  if (window === window.top) {
    // Known job-board iframes on this page. The popup compares them with the frames that answered.
    result.atsIframes = Array.from(document.querySelectorAll('iframe'))
      .map((f) => f.src)
      .filter((src) => src && atsOriginFor(src));
  }
  return result;
});
