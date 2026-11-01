// What this file is: the extension background script. It owns the database and answers data messages.
// In plain terms: the part that keeps your data and hands it to the other pages when they ask.
import { handleDataRequest } from '../src/lib/messages';
import type { DataRequest } from '../src/lib/messages';

export default defineBackground(() => {
  browser.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
    const type = (message as { type?: unknown } | null)?.type;
    if (typeof type !== 'string' || !type.startsWith('data/')) return undefined;
    // Reply with sendResponse and return true, so the channel stays open for the async answer.
    void handleDataRequest(message as DataRequest).then(sendResponse);
    return true;
  });
});
