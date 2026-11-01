// What this file is: the content script behind the optional in-page Fill button. The background registers it only after the user turns the setting on and allows all sites.
// In plain terms: the code that puts the small Dovetailed button inside application forms.
import { installHint } from '../src/autofill/hint';
import { runFill } from '../src/autofill/runFill';

export default defineUnlistedScript(() => {
  installHint(document, { runFill });
});
