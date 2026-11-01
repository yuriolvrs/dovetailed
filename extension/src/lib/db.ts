// What this file is: the extension Dexie database and the storage operations on it. Only this file and the background handler use it.
// In plain terms: the small database inside the extension. It holds your profile and your resume file.
import Dexie, { type EntityTable } from 'dexie';
import { EXTENSION_PROFILE_VERSION } from '../types/profile';
import type { ExtensionProfile, ResumeFileRef } from '../types/profile';

/** One stored profile row. The single row uses the key "main". */
interface ProfileRow {
  id: string;
  profile: ExtensionProfile;
}

/** One stored resume file. The bytes stay a Blob. */
interface ResumeFileRow {
  id: string;
  fileName: string;
  mimeType: string;
  blob: Blob;
}

const PROFILE_KEY = 'main';
export const MAX_RESUME_BYTES = 15 * 1024 * 1024;
export const PDF_MIME = 'application/pdf';
export const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

class ExtensionDatabase extends Dexie {
  profile!: EntityTable<ProfileRow, 'id'>;
  resumeFiles!: EntityTable<ResumeFileRow, 'id'>;

  constructor() {
    super('dovetailed-extension');
    this.version(1).stores({ profile: 'id', resumeFiles: 'id' });
  }
}

export const db = new ExtensionDatabase();

/**
 * Returns an empty profile with the current schema version.
 * In plain terms: the blank profile used before the user saves anything.
 */
export function emptyProfile(): ExtensionProfile {
  return {
    version: EXTENSION_PROFILE_VERSION,
    firstName: '',
    lastName: '',
    email: '',
    links: [],
    experience: [],
    education: [],
  };
}

/** Reads the profile, or the empty default when none is stored. */
export async function dbGetProfile(): Promise<ExtensionProfile> {
  const row = await db.profile.get(PROFILE_KEY);
  return row ? row.profile : emptyProfile();
}

/**
 * Saves the profile. The stored resume reference is kept, so a profile
 * save cannot drop or fake it. Only the resume functions change it.
 * In plain terms: saving your details never removes your resume.
 */
export async function dbSaveProfile(profile: ExtensionProfile): Promise<void> {
  await db.transaction('rw', db.profile, async () => {
    const existing = await db.profile.get(PROFILE_KEY);
    const next: ExtensionProfile = { ...profile, version: EXTENSION_PROFILE_VERSION };
    if (existing?.profile.resume) next.resume = existing.profile.resume;
    else delete next.resume;
    await db.profile.put({ id: PROFILE_KEY, profile: next });
  });
}

/** Returns the stored resume with its bytes, or null. */
export async function dbGetResume(): Promise<{ ref: ResumeFileRef; blob: Blob } | null> {
  const profile = await dbGetProfile();
  const ref = profile.resume;
  if (!ref) return null;
  const row = await db.resumeFiles.get(ref.id);
  return row ? { ref, blob: row.blob } : null;
}

/**
 * Checks the file type. The extension decides. A blank or generic MIME type
 * is accepted, because browsers sometimes report one. A different known MIME
 * type is rejected. Returns the canonical MIME type to store.
 * In plain terms: accepts PDF and DOCX files, even if the browser did not name the type.
 */
function checkType(fileName: string, mimeType: string): string {
  const name = fileName.toLowerCase();
  const expected = name.endsWith('.pdf') ? PDF_MIME : name.endsWith('.docx') ? DOCX_MIME : null;
  if (!expected) throw new Error('Resume must be a PDF or DOCX file.');
  if (mimeType !== expected && mimeType !== '' && mimeType !== 'application/octet-stream') {
    throw new Error('Resume must be a PDF or DOCX file.');
  }
  return expected;
}

/**
 * Stores the resume. It rejects other types and files over 15 MB.
 * It removes the old file and updates profile.resume in one transaction.
 * In plain terms: replaces your resume with the new file.
 */
export async function dbSaveResume(
  fileName: string,
  mimeType: string,
  bytes: ArrayBuffer,
): Promise<ResumeFileRef> {
  const type = checkType(fileName, mimeType);
  if (bytes.byteLength > MAX_RESUME_BYTES) throw new Error('Resume must be 15 MB or smaller.');
  const ref: ResumeFileRef = {
    id: crypto.randomUUID(),
    fileName,
    mimeType: type,
    sizeBytes: bytes.byteLength,
    updatedAt: Date.now(),
    storage: 'local',
  };
  await db.transaction('rw', db.profile, db.resumeFiles, async () => {
    await db.resumeFiles.clear();
    await db.resumeFiles.put({ id: ref.id, fileName, mimeType: type, blob: new Blob([bytes], { type }) });
    const profile = await dbGetProfile();
    await db.profile.put({ id: PROFILE_KEY, profile: { ...profile, resume: ref } });
  });
  return ref;
}

/** Removes the stored resume and clears profile.resume. */
export async function dbDeleteResume(): Promise<void> {
  await db.transaction('rw', db.profile, db.resumeFiles, async () => {
    await db.resumeFiles.clear();
    const row = await db.profile.get(PROFILE_KEY);
    if (row) {
      const next = { ...row.profile };
      delete next.resume;
      await db.profile.put({ id: PROFILE_KEY, profile: next });
    }
  });
}
