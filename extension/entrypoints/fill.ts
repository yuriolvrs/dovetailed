// What this file is: an unlisted script the popup injects into every frame of the page on click. It runs the shared fill and returns a summary with no field values.
// In plain terms: the part that runs inside the web page and types your details into the form.
import { runFill } from '../src/autofill/runFill';

export default defineUnlistedScript(runFill);
