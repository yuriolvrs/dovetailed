// What this file is: turns the in-page Fill button script on and off. It asks for access to all sites, registers or removes the content script, and re-checks both when the background starts.
// In plain terms: the on/off switch behind the "Show Fill button" setting.
import { browser } from 'wxt/browser';

export const HINT_SCRIPT_ID = 'dovetailed-hint';
export const ALL_SITES = '*://*/*';
// Indeed and LinkedIn are also checked inside the script, because a match pattern cannot name every country domain.
const EXCLUDE = ['*://*.indeed.com/*', '*://*.linkedin.com/*'];

async function isRegistered(): Promise<boolean> {
  return (await browser.scripting.getRegisteredContentScripts({ ids: [HINT_SCRIPT_ID] })).length > 0;
}

/** Registers hint.js for every frame on every site (document_idle). It replaces an older registration. */
async function register(): Promise<void> {
  if (await isRegistered()) await browser.scripting.unregisterContentScripts({ ids: [HINT_SCRIPT_ID] });
  await browser.scripting.registerContentScripts([
    {
      id: HINT_SCRIPT_ID,
      js: ['hint.js'],
      matches: [ALL_SITES],
      excludeMatches: EXCLUDE,
      runAt: 'document_idle',
      allFrames: true,
      persistAcrossSessions: true,
    },
  ]);
}

async function unregister(): Promise<void> {
  if (await isRegistered()) await browser.scripting.unregisterContentScripts({ ids: [HINT_SCRIPT_ID] });
}

/**
 * Asks for access to all sites, then registers the script. Call it straight from the click.
 * Returns false and changes nothing when the user refuses.
 * In plain terms: turns the button on, if the browser lets us.
 */
export async function enableHint(): Promise<boolean> {
  const granted = await browser.permissions.request({ origins: [ALL_SITES] });
  if (!granted) return false;
  await register();
  return true;
}

/**
 * Removes the script, then gives back the all-sites permission.
 * In plain terms: turns the button off and lets go of the access.
 */
export async function disableHint(): Promise<void> {
  await unregister();
  await browser.permissions.remove({ origins: [ALL_SITES] });
}

/**
 * Makes the registered script match the saved setting and the granted permission.
 * Returns the state that is true now. The setting counts as off when the permission is gone.
 * In plain terms: on startup, fixes any mismatch, for example after the user removed access in the browser.
 */
export async function reconcileHint(enabled: boolean): Promise<boolean> {
  const hasAccess = await browser.permissions.contains({ origins: [ALL_SITES] });
  const active = enabled && hasAccess;
  if (active) {
    if (!(await isRegistered())) await register();
  } else {
    await unregister();
  }
  return active;
}

/**
 * Builds the function that matches the script to the saved setting. Runs wait for each other, and
 * each reads the setting when its turn comes, so the last run always sees the newest value.
 * A failed run is ignored and does not stop later runs.
 * In plain terms: stops an old "off" read from removing the button just after you turned it on.
 */
export function createHintSync(
  read: () => Promise<{ showFillButton: boolean }>,
  write: (settings: { showFillButton: boolean }) => Promise<unknown>,
): () => Promise<void> {
  let queue = Promise.resolve();
  return () => {
    queue = queue
      .then(async () => {
        const { showFillButton } = await read();
        const active = await reconcileHint(showFillButton);
        if (showFillButton && !active) await write({ showFillButton: false });
      })
      .catch(() => {});
    return queue;
  };
}
