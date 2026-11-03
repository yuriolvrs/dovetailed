// What this file is: the extension Dexie database and the storage operations on it. Only this file and the background handler use it.
// In plain terms: the small database inside the extension. It holds your profile and your resume file.
import Dexie, { type EntityTable } from 'dexie';
import { EXTENSION_PROFILE_VERSION } from '../types/profile';
import type { ExtensionProfile, ExtensionSettings, ResumeFileRef } from '../types/profile';

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

/** The single settings row. The key is "main". */
interface SettingsRow extends ExtensionSettings {
  id: string;
}

const PROFILE_KEY = 'main';
export const MAX_RESUME_BYTES = 15 * 1024 * 1024;
export const MAX_RESUMES = 10;
export const PDF_MIME = 'application/pdf';
export const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

class ExtensionDatabase extends Dexie {
  profile!: EntityTable<ProfileRow, 'id'>;
  resumeFiles!: EntityTable<ResumeFileRow, 'id'>;
  settings!: EntityTable<SettingsRow, 'id'>;

  constructor() {
    super('dovetailed-extension');
    this.version(1).stores({ profile: 'id', resumeFiles: 'id' });
    this.version(2).stores({ profile: 'id', resumeFiles: 'id', settings: 'id' });
    // Version 3 moves the single `resume` reference into the `resumes` list. The file row stays.
    this.version(3)
      .stores({ profile: 'id', resumeFiles: 'id', settings: 'id' })
      .upgrade((tx) =>
        tx
          .table('profile')
          .toCollection()
          .modify((row: { profile: ExtensionProfile & { resume?: ResumeFileRef } }) => {
            const old = row.profile.resume;
            row.profile.resumes = old ? [old] : [];
            delete row.profile.resume;
            row.profile.version = EXTENSION_PROFILE_VERSION;
          }),
      );
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
    resumes: [],
  };
}

/** Reads the profile, or the empty default when none is stored. */
export async function dbGetProfile(): Promise<ExtensionProfile> {
  const row = await db.profile.get(PROFILE_KEY);
  return row ? { ...row.profile, resumes: row.profile.resumes ?? [] } : emptyProfile();
}

/**
 * Saves the profile. The stored resume references are kept, so a profile
 * save cannot drop or fake them. Only the resume functions change it.
 * In plain terms: saving your details never removes your resumes.
 */
export async function dbSaveProfile(profile: ExtensionProfile): Promise<void> {
  await db.transaction('rw', db.profile, async () => {
    const existing = await db.profile.get(PROFILE_KEY);
    const next: ExtensionProfile = { ...profile, version: EXTENSION_PROFILE_VERSION };
    next.resumes = existing?.profile.resumes ?? [];
    await db.profile.put({ id: PROFILE_KEY, profile: next });
  });
}

/** Reads the settings. Every switch is off until the user turns it on. */
export async function dbGetSettings(): Promise<ExtensionSettings> {
  const row = await db.settings.get(PROFILE_KEY);
  return { showFillButton: row?.showFillButton === true };
}

/** Saves the settings. */
export async function dbSaveSettings(settings: ExtensionSettings): Promise<void> {
  await db.settings.put({ id: PROFILE_KEY, showFillButton: settings.showFillButton === true });
}

/** Returns the stored resume with this id, with its bytes, or null. */
export async function dbGetResume(id: string): Promise<{ ref: ResumeFileRef; blob: Blob } | null> {
  const profile = await dbGetProfile();
  const ref = profile.resumes.find((r) => r.id === id);
  if (!ref) return null;
  const row = await db.resumeFiles.get(ref.id);
  return row ? { ref, blob: row.blob } : null;
}

/** Returns the stored resume references, in upload order. It reads no bytes. */
export async function dbListResumes(): Promise<ResumeFileRef[]> {
  return (await dbGetProfile()).resumes;
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
 * Adds a resume. It rejects other types, files over 15 MB, and an 11th file.
 * The file row and the reference are written in one transaction. Other resumes stay.
 * In plain terms: adds the new file to your resumes. It never removes the others.
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
    const profile = await dbGetProfile();
    if (profile.resumes.length >= MAX_RESUMES) throw new Error(`You can store up to ${MAX_RESUMES} resumes.`);
    await db.resumeFiles.put({ id: ref.id, fileName, mimeType: type, blob: new Blob([bytes], { type }) });
    await db.profile.put({ id: PROFILE_KEY, profile: { ...profile, resumes: [...profile.resumes, ref] } });
  });
  return ref;
}

/** Removes one stored resume: its reference and its file. */
export async function dbDeleteResume(id: string): Promise<void> {
  await db.transaction('rw', db.profile, db.resumeFiles, async () => {
    await db.resumeFiles.delete(id);
    const row = await db.profile.get(PROFILE_KEY);
    if (row) {
      const profile = { ...row.profile, resumes: (row.profile.resumes ?? []).filter((r) => r.id !== id) };
      await db.profile.put({ id: PROFILE_KEY, profile });
    }
  });
}
