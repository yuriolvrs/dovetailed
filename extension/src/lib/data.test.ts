// @vitest-environment node
// What this file is: tests for the data layer (data.ts), the message handler, the base64 helpers and the Dexie storage, using fake-indexeddb.
// In plain terms: checks that saving and loading the profile and resume works, and that bad files are refused.
import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Route messages straight to the background handler, as the real browser would.
vi.mock('wxt/browser', () => ({
  browser: {
    runtime: {
      sendMessage: async (req: unknown) => {
        const { handleDataRequest } = await import('./messages');
        return handleDataRequest(req as Parameters<typeof handleDataRequest>[0]);
      },
    },
  },
}));

import { db, DOCX_MIME, PDF_MIME } from './db';
import { deleteResume, getProfile, getResume, getSettings, listResumes, saveProfile, saveResume, saveSettings } from './data';
import { base64ToBytes, bytesToBase64 } from './messages';

function makeFile(name: string, type: string, bytes: Uint8Array): File {
  return new File([bytes as BlobPart], name, { type });
}

function randomBytes(n: number): Uint8Array {
  const out = new Uint8Array(n);
  for (let i = 0; i < n; i++) out[i] = (i * 31 + 7) & 0xff;
  return out;
}

beforeEach(async () => {
  await db.profile.clear();
  await db.resumeFiles.clear();
  await db.settings.clear();
});

describe('base64 helpers', () => {
  it('round-trips all byte values', () => {
    const bytes = new Uint8Array(256).map((_, i) => i);
    expect(Array.from(base64ToBytes(bytesToBase64(bytes)))).toEqual(Array.from(bytes));
  });

  it('handles a 5 MB file without a stack overflow', () => {
    const bytes = randomBytes(5 * 1024 * 1024);
    const back = base64ToBytes(bytesToBase64(bytes));
    expect(back.length).toBe(bytes.length);
    expect(back[bytes.length - 1]).toBe(bytes[bytes.length - 1]);
    expect(Buffer.compare(back, bytes)).toBe(0);
  });
});

describe('profile', () => {
  it('returns an empty default when none is stored', async () => {
    const p = await getProfile();
    expect(p.firstName).toBe('');
    expect(p.links).toEqual([]);
    expect(p.resumes).toEqual([]);
  });

  it('saves and reads a profile', async () => {
    const p = await getProfile();
    await saveProfile({ ...p, firstName: 'Ana', lastName: 'Cruz', email: 'ana@example.com', noticePeriod: '30 days' });
    const back = await getProfile();
    expect(back.firstName).toBe('Ana');
    expect(back.noticePeriod).toBe('30 days');
  });
});

describe('resume', () => {
  it('returns null for an unknown id and an empty list when none is stored', async () => {
    expect(await getResume('nope')).toBeNull();
    expect(await listResumes()).toEqual([]);
  });

  it('round-trips identical bytes and adds the reference to profile.resumes', async () => {
    const bytes = randomBytes(100_000);
    const ref = await saveResume(makeFile('cv.pdf', PDF_MIME, bytes));
    const file = await getResume(ref.id);
    expect(file?.name).toBe('cv.pdf');
    expect(file?.type).toBe(PDF_MIME);
    expect(Buffer.compare(new Uint8Array(await file!.arrayBuffer()), bytes)).toBe(0);
    expect((await getProfile()).resumes).toEqual([ref]);
    expect(ref.sizeBytes).toBe(bytes.length);
  });

  it('adds files in upload order and never clears the others', async () => {
    const a = await saveResume(makeFile('a.pdf', PDF_MIME, randomBytes(10)));
    const b = await saveResume(makeFile('b.docx', DOCX_MIME, randomBytes(20)));
    expect(await db.resumeFiles.count()).toBe(2);
    expect((await listResumes()).map((r) => r.id)).toEqual([a.id, b.id]);
    expect((await getResume(a.id))?.name).toBe('a.pdf');
    expect((await getResume(b.id))?.name).toBe('b.docx');
  });

  it('lists references without file bytes', async () => {
    await saveResume(makeFile('cv.pdf', PDF_MIME, randomBytes(10)));
    const list = await listResumes();
    expect(Object.keys(list[0]).sort()).toEqual(['fileName', 'id', 'mimeType', 'sizeBytes', 'storage', 'updatedAt']);
    expect(JSON.stringify(list)).not.toContain('base64');
  });

  it('keeps the resumes when the profile is saved', async () => {
    await saveResume(makeFile('cv.pdf', PDF_MIME, randomBytes(10)));
    const p = await getProfile();
    await saveProfile({ ...p, resumes: [], firstName: 'Ana' });
    expect((await getProfile()).resumes.map((r) => r.fileName)).toEqual(['cv.pdf']);
  });

  it('deletes one file and its reference, and keeps the others', async () => {
    const a = await saveResume(makeFile('a.pdf', PDF_MIME, randomBytes(10)));
    const b = await saveResume(makeFile('b.pdf', PDF_MIME, randomBytes(10)));
    await deleteResume(a.id);
    expect(await getResume(a.id)).toBeNull();
    expect((await getResume(b.id))?.name).toBe('b.pdf');
    expect((await getProfile()).resumes.map((r) => r.id)).toEqual([b.id]);
    expect(await db.resumeFiles.count()).toBe(1);
  });

  it('accepts 10 resumes and refuses the 11th', async () => {
    for (let i = 0; i < 10; i++) await saveResume(makeFile(`cv${i}.pdf`, PDF_MIME, randomBytes(5)));
    await expect(saveResume(makeFile('extra.pdf', PDF_MIME, randomBytes(5)))).rejects.toThrow(/up to 10/);
    expect((await listResumes()).length).toBe(10);
    expect(await db.resumeFiles.count()).toBe(10);
  });

  it('rejects other file types', async () => {
    await expect(saveResume(makeFile('cv.txt', 'text/plain', randomBytes(10)))).rejects.toThrow(/PDF or DOCX/);
    await expect(saveResume(makeFile('cv.pdf', 'text/plain', randomBytes(10)))).rejects.toThrow(/PDF or DOCX/);
    expect(await listResumes()).toEqual([]);
  });

  it('accepts a blank or generic MIME type and stores the canonical one', async () => {
    const a = await saveResume(makeFile('a.pdf', '', randomBytes(10)));
    expect(a.mimeType).toBe(PDF_MIME);
    const b = await saveResume(makeFile('b.DOCX', 'application/octet-stream', randomBytes(10)));
    expect(b.mimeType).toBe(DOCX_MIME);
    expect((await getResume(b.id))?.type).toBe(DOCX_MIME);
  });

  it('rejects a known MIME mismatch', async () => {
    await expect(saveResume(makeFile('cv.docx', PDF_MIME, randomBytes(10)))).rejects.toThrow(/PDF or DOCX/);
  });

  it('rejects files over 15 MB', async () => {
    const big = new Uint8Array(15 * 1024 * 1024 + 1);
    await expect(saveResume(makeFile('big.pdf', PDF_MIME, big))).rejects.toThrow(/15 MB/);
    expect(await listResumes()).toEqual([]);
  });
});

describe('database migration to version 3', () => {
  it('moves the old single resume into resumes and keeps its file row', async () => {
    db.close();
    await Dexie.delete('dovetailed-extension');
    // Build a version 2 database by hand, with the old profile.resume shape.
    const old = new Dexie('dovetailed-extension');
    old.version(2).stores({ profile: 'id', resumeFiles: 'id', settings: 'id' });
    const ref = { id: 'old-id', fileName: 'old.pdf', mimeType: PDF_MIME, sizeBytes: 3, updatedAt: 5, storage: 'local' };
    await old.table('profile').put({ id: 'main', profile: { version: 1, firstName: 'Ana', resume: ref } });
    await old.table('resumeFiles').put({ id: 'old-id', fileName: 'old.pdf', mimeType: PDF_MIME, blob: new Blob(['abc']) });
    old.close();

    await db.open();
    const p = await getProfile();
    expect(p.resumes).toEqual([ref]);
    expect('resume' in p).toBe(false);
    expect(p.version).toBe(2);
    expect(p.firstName).toBe('Ana');
    expect((await getResume('old-id'))?.name).toBe('old.pdf');
  });

  it('gives a profile with no old resume an empty list', async () => {
    db.close();
    await Dexie.delete('dovetailed-extension');
    const old = new Dexie('dovetailed-extension');
    old.version(2).stores({ profile: 'id', resumeFiles: 'id', settings: 'id' });
    await old.table('profile').put({ id: 'main', profile: { version: 1, firstName: 'Bo' } });
    old.close();
    await db.open();
    expect((await getProfile()).resumes).toEqual([]);
  });
});

describe('settings', () => {
  it('is off by default', async () => {
    expect(await getSettings()).toEqual({ showFillButton: false });
  });

  it('saves and reads the in-page button setting without touching the profile', async () => {
    await saveProfile({ ...(await getProfile()), firstName: 'Ana' });
    await saveSettings({ showFillButton: true });
    expect(await getSettings()).toEqual({ showFillButton: true });
    expect((await getProfile()).firstName).toBe('Ana');
    await saveSettings({ showFillButton: false });
    expect(await getSettings()).toEqual({ showFillButton: false });
  });
});
