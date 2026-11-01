// @vitest-environment node
// What this file is: tests for the data layer (data.ts), the message handler, the base64 helpers and the Dexie storage, using fake-indexeddb.
// In plain terms: checks that saving and loading the profile and resume works, and that bad files are refused.
import 'fake-indexeddb/auto';
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
import { deleteResume, getProfile, getResume, saveProfile, saveResume } from './data';
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
    expect(p.resume).toBeUndefined();
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
  it('returns null when none is stored', async () => {
    expect(await getResume()).toBeNull();
  });

  it('round-trips identical bytes and updates profile.resume', async () => {
    const bytes = randomBytes(100_000);
    const ref = await saveResume(makeFile('cv.pdf', PDF_MIME, bytes));
    const file = await getResume();
    expect(file?.name).toBe('cv.pdf');
    expect(file?.type).toBe(PDF_MIME);
    expect(Buffer.compare(new Uint8Array(await file!.arrayBuffer()), bytes)).toBe(0);
    expect((await getProfile()).resume).toEqual(ref);
    expect(ref.sizeBytes).toBe(bytes.length);
  });

  it('replaces the old file', async () => {
    await saveResume(makeFile('old.pdf', PDF_MIME, randomBytes(10)));
    const next = randomBytes(20);
    const ref = await saveResume(makeFile('new.docx', DOCX_MIME, next));
    expect(await db.resumeFiles.count()).toBe(1);
    const file = await getResume();
    expect(file?.name).toBe('new.docx');
    expect((await getProfile()).resume?.id).toBe(ref.id);
  });

  it('keeps the resume when the profile is saved', async () => {
    await saveResume(makeFile('cv.pdf', PDF_MIME, randomBytes(10)));
    const p = await getProfile();
    await saveProfile({ ...p, resume: undefined, firstName: 'Ana' });
    expect((await getProfile()).resume?.fileName).toBe('cv.pdf');
  });

  it('deletes the file and the reference', async () => {
    await saveResume(makeFile('cv.pdf', PDF_MIME, randomBytes(10)));
    await deleteResume();
    expect(await getResume()).toBeNull();
    expect((await getProfile()).resume).toBeUndefined();
    expect(await db.resumeFiles.count()).toBe(0);
  });

  it('rejects other file types', async () => {
    await expect(saveResume(makeFile('cv.txt', 'text/plain', randomBytes(10)))).rejects.toThrow(/PDF or DOCX/);
    await expect(saveResume(makeFile('cv.pdf', 'text/plain', randomBytes(10)))).rejects.toThrow(/PDF or DOCX/);
    expect(await getResume()).toBeNull();
  });

  it('accepts a blank or generic MIME type and stores the canonical one', async () => {
    const a = await saveResume(makeFile('a.pdf', '', randomBytes(10)));
    expect(a.mimeType).toBe(PDF_MIME);
    const b = await saveResume(makeFile('b.DOCX', 'application/octet-stream', randomBytes(10)));
    expect(b.mimeType).toBe(DOCX_MIME);
    expect((await getResume())?.type).toBe(DOCX_MIME);
  });

  it('rejects a known MIME mismatch', async () => {
    await expect(saveResume(makeFile('cv.docx', PDF_MIME, randomBytes(10)))).rejects.toThrow(/PDF or DOCX/);
  });

  it('rejects files over 15 MB', async () => {
    const big = new Uint8Array(15 * 1024 * 1024 + 1);
    await expect(saveResume(makeFile('big.pdf', PDF_MIME, big))).rejects.toThrow(/15 MB/);
    expect(await getResume()).toBeNull();
  });
});
