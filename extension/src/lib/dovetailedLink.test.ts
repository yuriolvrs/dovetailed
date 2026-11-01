// What this file is: tests for the Dovetailed copy: the shape check, mapping, both merge modes, conflicts, the page script, and tab handling with the browser faked.
// In plain terms: checks that the copy reads only good data, never touches protected fields, and cleans up the tab it opens.
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ExtensionProfile } from '../types/profile';

let granted = true;
let existing: { id: number }[] = [];
let createdStatus = 'complete';
let scriptResult: unknown;
let scriptFails = false;
const listeners = new Set<(id: number, info: { status?: string }) => void>();
const remove = vi.fn(async (_id: number) => undefined);
const create = vi.fn(async (_a: unknown) => ({ id: 99 }));
const executeScript = vi.fn(async (_a: unknown) => {
  if (scriptFails) throw new Error('no');
  return [{ result: scriptResult }];
});

vi.mock('wxt/browser', () => ({
  browser: {
    permissions: { request: async () => granted },
    tabs: {
      query: async () => existing,
      create: (a: unknown) => create(a),
      remove: (id: number) => remove(id),
      get: async (id: number) => ({ id, status: createdStatus }),
      onUpdated: {
        addListener: (f: (id: number, info: { status?: string }) => void) => listeners.add(f),
        removeListener: (f: (id: number, info: { status?: string }) => void) => listeners.delete(f),
      },
    },
    scripting: { executeScript: (a: unknown) => executeScript(a) },
  },
}));

import {
  changedCount,
  conflicts,
  DovetailedAccessError,
  DovetailedReadError,
  isDovetailedRow,
  mergeDovetailed,
  readDovetailedProfile,
  readProfileRow,
  toExtensionFields,
  type DovetailedRow,
} from './dovetailedLink';

const row: DovetailedRow = {
  contact: {
    name: 'Testa G. Examplo',
    email: 'testa@example.invalid',
    phone: '+63 0917 123 4567',
    location: 'Manila, Philippines',
    links: [{ label: 'GitHub', url: 'https://github.com/testa' }],
  },
  experience: [{ company: 'Acme', title: 'Dev', current: false, bullets: ['Built it'] }],
  education: [{ school: 'State U', degree: 'BS', current: false }],
};
const empty: ExtensionProfile = { version: 1, firstName: '', lastName: '', email: '', links: [], experience: [], education: [] };
const full: ExtensionProfile = {
  version: 1,
  firstName: 'Old',
  lastName: 'Name',
  email: 'old@example.invalid',
  phone: { countryCallingCode: '1', nationalNumber: '5550100', countryCode: 'CA' },
  address: { street: '1 Main', city: 'Oldtown', postalCode: '12345' },
  links: [{ label: 'Site', url: 'https://old.example.invalid' }],
  experience: [{ company: 'Old Co', title: 'Dev', current: false, bullets: [] }],
  education: [{ school: 'Old U', degree: 'BA', current: false }],
  resume: { id: 'r', fileName: 'r.pdf', mimeType: 'application/pdf', sizeBytes: 1, updatedAt: 1, storage: 'local' },
  expectedSalary: '100',
  noticePeriod: '2 weeks',
};

describe('isDovetailedRow', () => {
  it('accepts a good row and rejects bad shapes', () => {
    expect(isDovetailedRow(row)).toBe(true);
    expect(isDovetailedRow(null)).toBe(false);
    expect(isDovetailedRow({ ...row, contact: 'x' })).toBe(false);
    expect(isDovetailedRow({ ...row, contact: { ...row.contact, name: 5 } })).toBe(false);
    expect(isDovetailedRow({ ...row, contact: { ...row.contact, links: {} } })).toBe(false);
    expect(isDovetailedRow({ ...row, experience: [{ company: 'A' }] })).toBe(false);
    expect(isDovetailedRow({ ...row, education: 'none' })).toBe(false);
  });
});

describe('toExtensionFields', () => {
  it('maps contact, experience and education with the resume parsers', () => {
    const f = toExtensionFields(row);
    expect(f).toMatchObject({ firstName: 'Testa', lastName: 'Examplo', email: 'testa@example.invalid' });
    expect(f.phone).toEqual({ countryCallingCode: '63', nationalNumber: '9171234567' });
    expect(f.address).toEqual({ countryCode: 'PH', city: 'Manila' });
    expect(f.links).toHaveLength(1);
    expect(f.experience).toEqual(row.experience);
    expect(f.education).toEqual(row.education);
  });
});

describe('mergeDovetailed', () => {
  const incoming = toExtensionFields(row);

  it('fillEmpty fills an empty profile', () => {
    const next = mergeDovetailed(empty, incoming, 'fillEmpty');
    expect(next.firstName).toBe('Testa');
    expect(next.phone?.nationalNumber).toBe('9171234567');
    expect(next.experience).toHaveLength(1);
  });

  it('fillEmpty keeps every current value', () => {
    expect(mergeDovetailed(full, incoming, 'fillEmpty')).toEqual({
      ...full,
      address: { ...full.address, countryCode: 'PH' },
    });
  });

  it('replace overwrites non-empty incoming values and keeps protected fields', () => {
    const next = mergeDovetailed(full, incoming, 'replace');
    expect(next).toMatchObject({ firstName: 'Testa', lastName: 'Examplo', email: 'testa@example.invalid' });
    expect(next.address).toEqual({ street: '1 Main', city: 'Manila', postalCode: '12345', countryCode: 'PH' });
    expect(next.resume).toBe(full.resume);
    expect(next.expectedSalary).toBe('100');
    expect(next.noticePeriod).toBe('2 weeks');
    expect(next.version).toBe(1);
  });

  it('replace keeps a current value where the incoming one is empty', () => {
    const blankIncoming = toExtensionFields({ ...row, contact: { ...row.contact, name: '', email: '' }, experience: [] });
    const next = mergeDovetailed(full, blankIncoming, 'replace');
    expect(next.firstName).toBe('Old');
    expect(next.email).toBe('old@example.invalid');
    expect(next.experience).toEqual(full.experience);
  });

  it('keeps the current calling code and country when the incoming phone has none', () => {
    const noCode = toExtensionFields({ ...row, contact: { ...row.contact, phone: '0917 123 4567' } });
    expect(mergeDovetailed(full, noCode, 'replace').phone).toEqual({
      countryCallingCode: '1',
      nationalNumber: '9171234567',
      countryCode: 'CA',
    });
  });
});

describe('conflicts and changedCount', () => {
  const incoming = toExtensionFields(row);
  it('lists only fields where both sides have different values', () => {
    expect(conflicts(empty, incoming)).toEqual([]);
    expect(conflicts(full, incoming)).toEqual(['First name', 'Last name', 'Email', 'Phone', 'City', 'Links', 'Experience', 'Education']);
    expect(conflicts({ ...full, firstName: 'Testa' }, incoming)).not.toContain('First name');
  });
  it('counts changed fields, each link, role and school as one', () => {
    expect(changedCount(empty, mergeDovetailed(empty, incoming, 'fillEmpty'))).toBe(9);
    expect(changedCount(full, full)).toBe(0);
  });
});

describe('readProfileRow (page script)', () => {
  it('returns none and creates no database when the app database is absent', async () => {
    expect(await readProfileRow()).toEqual({ status: 'none' });
    expect((await indexedDB.databases()).some((d) => d.name === 'anti-funemployment')).toBe(false);
  });

  it('returns the first profile row and writes nothing', async () => {
    await new Promise<void>((resolve, reject) => {
      const open = indexedDB.open('anti-funemployment', 1);
      open.onupgradeneeded = () => open.result.createObjectStore('profiles', { keyPath: 'id' });
      open.onsuccess = () => {
        const tx = open.result.transaction('profiles', 'readwrite');
        tx.objectStore('profiles').put({ id: 'p', ...row });
        tx.oncomplete = () => {
          open.result.close();
          resolve();
        };
      };
      open.onerror = () => reject(open.error);
    });
    const result = await readProfileRow();
    expect(result).toMatchObject({ status: 'ok', row: { id: 'p' } });
    const db = await new Promise<IDBDatabase>((resolve) => {
      const r = indexedDB.open('anti-funemployment');
      r.onsuccess = () => resolve(r.result);
    });
    expect(db.version).toBe(1);
    db.close();
  });
});

describe('readDovetailedProfile', () => {
  beforeEach(() => {
    granted = true;
    existing = [];
    createdStatus = 'complete';
    scriptResult = { status: 'ok', row };
    scriptFails = false;
    listeners.clear();
    remove.mockClear();
    create.mockClear();
    executeScript.mockClear();
  });

  it('throws an access error when permission is refused', async () => {
    granted = false;
    await expect(readDovetailedProfile()).rejects.toBeInstanceOf(DovetailedAccessError);
    expect(create).not.toHaveBeenCalled();
  });

  it('reuses an existing tab and leaves it open', async () => {
    existing = [{ id: 7 }];
    expect(await readDovetailedProfile()).toEqual(row);
    expect(create).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
    expect(executeScript).toHaveBeenCalledWith(expect.objectContaining({ target: { tabId: 7 } }));
  });

  it('opens an inactive tab when none exists and closes it', async () => {
    expect(await readDovetailedProfile()).toEqual(row);
    expect(create).toHaveBeenCalledWith({ url: 'https://dovetailed.pages.dev/', active: false });
    expect(remove).toHaveBeenCalledWith(99);
  });

  it('waits for a loading tab to complete', async () => {
    createdStatus = 'loading';
    const pending = readDovetailedProfile();
    await vi.waitFor(() => expect(listeners.size).toBe(1));
    expect(executeScript).not.toHaveBeenCalled();
    listeners.forEach((f) => f(99, { status: 'complete' }));
    expect(await pending).toEqual(row);
    expect(listeners.size).toBe(0);
  });

  it('closes the tab it opened when the script fails', async () => {
    scriptFails = true;
    await expect(readDovetailedProfile()).rejects.toBeInstanceOf(DovetailedReadError);
    expect(remove).toHaveBeenCalledWith(99);
  });

  it('closes the tab it opened when the row has a bad shape', async () => {
    scriptResult = { status: 'ok', row: { contact: 1 } };
    await expect(readDovetailedProfile()).rejects.toBeInstanceOf(DovetailedReadError);
    expect(remove).toHaveBeenCalledWith(99);
  });

  it('closes the tab it opened when loading times out', async () => {
    vi.useFakeTimers();
    createdStatus = 'loading';
    const pending = readDovetailedProfile();
    const assertion = expect(pending).rejects.toBeInstanceOf(DovetailedReadError);
    await vi.advanceTimersByTimeAsync(15_001);
    await assertion;
    vi.useRealTimers();
    expect(remove).toHaveBeenCalledWith(99);
  });

  it('returns undefined when Dovetailed has no profile', async () => {
    scriptResult = { status: 'none' };
    expect(await readDovetailedProfile()).toBeUndefined();
  });
});
