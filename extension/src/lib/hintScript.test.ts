// What this file is: tests for turning the in-page button script on and off, with the browser APIs faked.
// In plain terms: checks that the script is registered only when allowed, removed when turned off, and fixed on startup.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const registered = new Map<string, unknown>();
let granted = true;
let hasAccess = false;
const request = vi.fn(async (_a: unknown) => granted);
const remove = vi.fn(async (_a: unknown) => true);
const registerContentScripts = vi.fn(async (list: { id: string }[]) => {
  list.forEach((s) => registered.set(s.id, s));
});
const unregisterContentScripts = vi.fn(async ({ ids }: { ids: string[] }) => {
  ids.forEach((i) => registered.delete(i));
});

vi.mock('wxt/browser', () => ({
  browser: {
    permissions: {
      request: (a: unknown) => request(a),
      remove: (a: unknown) => remove(a),
      contains: async () => hasAccess,
    },
    scripting: {
      registerContentScripts: (a: { id: string }[]) => registerContentScripts(a),
      unregisterContentScripts: (a: { ids: string[] }) => unregisterContentScripts(a),
      getRegisteredContentScripts: async ({ ids }: { ids: string[] }) =>
        ids.filter((i) => registered.has(i)).map((id) => ({ id })),
    },
  },
}));

import { ALL_SITES, disableHint, enableHint, HINT_SCRIPT_ID, reconcileHint } from './hintScript';

beforeEach(() => {
  registered.clear();
  granted = true;
  hasAccess = false;
  vi.clearAllMocks();
});

describe('enableHint', () => {
  it('requests all sites, then registers hint.js for all frames at document_idle', async () => {
    expect(await enableHint()).toBe(true);
    expect(request).toHaveBeenCalledWith({ origins: [ALL_SITES] });
    expect(registerContentScripts).toHaveBeenCalledTimes(1);
    expect(registerContentScripts.mock.calls[0][0][0]).toMatchObject({
      id: HINT_SCRIPT_ID,
      js: ['hint.js'],
      matches: [ALL_SITES],
      excludeMatches: ['*://*.indeed.com/*', '*://*.linkedin.com/*'],
      runAt: 'document_idle',
      allFrames: true,
    });
  });

  it('registers nothing when the user refuses', async () => {
    granted = false;
    expect(await enableHint()).toBe(false);
    expect(registerContentScripts).not.toHaveBeenCalled();
  });
});

describe('disableHint', () => {
  it('unregisters the script and removes the permission', async () => {
    await enableHint();
    await disableHint();
    expect(registered.size).toBe(0);
    expect(remove).toHaveBeenCalledWith({ origins: [ALL_SITES] });
  });
});

describe('reconcileHint', () => {
  it('registers a missing script when the setting is on and access is granted', async () => {
    hasAccess = true;
    expect(await reconcileHint(true)).toBe(true);
    expect(registered.has(HINT_SCRIPT_ID)).toBe(true);
  });

  it('does not register again when it is already there', async () => {
    hasAccess = true;
    await reconcileHint(true);
    await reconcileHint(true);
    expect(registerContentScripts).toHaveBeenCalledTimes(1);
  });

  it('removes the script and reports off when access is gone', async () => {
    await enableHint();
    hasAccess = false;
    expect(await reconcileHint(true)).toBe(false);
    expect(registered.size).toBe(0);
  });

  it('removes a leftover script when the setting is off', async () => {
    hasAccess = true;
    await enableHint();
    expect(await reconcileHint(false)).toBe(false);
    expect(registered.size).toBe(0);
  });
});
