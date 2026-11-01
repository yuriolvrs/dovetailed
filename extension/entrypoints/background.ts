// What this file is: the extension background script. It owns the database, answers data messages, and keeps the optional in-page button script in line with the saved setting.
// In plain terms: the part that keeps your data and hands it to the other pages when they ask.
import { dbGetSettings, dbSaveSettings } from '../src/lib/db';
import { createHintSync } from '../src/lib/hintScript';
import { handleDataRequest } from '../src/lib/messages';
import type { DataRequest } from '../src/lib/messages';

export default defineBackground(() => {
  const syncHint = createHintSync(dbGetSettings, dbSaveSettings);

  browser.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
    const type = (message as { type?: unknown } | null)?.type;
    if (typeof type !== 'string' || !type.startsWith('data/')) return undefined;
    // Reply with sendResponse and return true, so the channel stays open for the async answer.
    void handleDataRequest(message as DataRequest).then(async (response) => {
      // A save can wake this script, so the check at the end of this file may have read the old value.
      if (type === 'data/saveSettings') await syncHint();
      sendResponse(response);
    });
    return true;
  });

  // On every start, make the registered script match the setting and the granted access.
  // If the user removed the access in the browser, the setting is switched off.
  void syncHint();
});
