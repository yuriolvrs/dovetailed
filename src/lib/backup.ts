// What this file is: the logic behind exporting all local data to a JSON
// file, importing it back, and deleting everything. Split into pure
// functions (buildBackup/serializeBackup/validateBackup/parseBackup —
// unit-tested in backup.test.ts) and thin Dexie-touching wrappers
// (exportAllData/importAllData/deleteAllData).
// In plain terms: the code behind the "Export," "Import," and "Delete All
// Data" buttons on the Profile page.

import { db } from './db';
import { repairText } from './repairText';
import { SCHEMA_VERSION } from '../types';
import type { Generation, GenerationSnapshot, JobPosting, LatexTemplate, Profile } from '../types';

export interface BackupData {
  profiles: Profile[];
  jobPostings: JobPosting[];
  generations: Generation[];
  generationSnapshots: GenerationSnapshot[];
  latexTemplates: LatexTemplate[];
}

export interface BackupFile {
  schemaVersion: number;
  exportedAt: string;
  data: BackupData;
}

export class BackupValidationError extends Error {}

/**
 * Pure — shapes table contents into the exportable backup file.
 * In plain terms: wraps your data up into the file that gets downloaded.
 */
export function buildBackup(data: BackupData): BackupFile {
  return {
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    data,
  };
}

function isStringArrayOfObjects(x: unknown): x is object[] {
  return Array.isArray(x) && x.every((item) => typeof item === 'object' && item !== null);
}

/**
 * Pure — structural validation only; does not deep-check every field.
 * In plain terms: a quick sanity check that an imported file looks like a
 * real backup, not a full check of every value inside it.
 */
export function validateBackup(x: unknown): x is BackupFile {
  if (typeof x !== 'object' || x === null) return false;
  const candidate = x as Record<string, unknown>;

  if (typeof candidate.schemaVersion !== 'number') return false;
  if (candidate.schemaVersion !== SCHEMA_VERSION) return false;

  if (typeof candidate.exportedAt !== 'string') return false;

  if (typeof candidate.data !== 'object' || candidate.data === null) return false;
  const data = candidate.data as Record<string, unknown>;

  return (
    isStringArrayOfObjects(data.profiles) &&
    isStringArrayOfObjects(data.jobPostings) &&
    isStringArrayOfObjects(data.generations) &&
    isStringArrayOfObjects(data.generationSnapshots) &&
    isStringArrayOfObjects(data.latexTemplates)
  );
}

/**
 * Pure — renders a backup file as the JSON text that gets downloaded, with
 * any mis-decoded punctuation repaired on the way out so the file reads
 * correctly wherever it is opened.
 * In plain terms: turns your data into the text of the backup file.
 */
export function serializeBackup(backup: BackupFile): string {
  return repairText(JSON.stringify(backup, null, 2));
}

/**
 * Pure — parses and validates a backup JSON string, throwing on any problem.
 * In plain terms: reads the backup file you upload and complains clearly if
 * it isn't a valid one.
 */
export function parseBackup(json: string): BackupFile {
  let parsed: unknown;
  try {
    // Repaired before parsing, not field by field afterwards: the damage is
    // plain text either way, and one pass over the whole file lets a garbled
    // character anywhere in it vouch for the rest.
    parsed = JSON.parse(repairText(json));
  } catch {
    throw new BackupValidationError('Malformed backup file: not valid JSON.');
  }

  if (!validateBackup(parsed)) {
    const version = (parsed as { schemaVersion?: unknown } | null)?.schemaVersion;
    if (typeof version === 'number' && version !== SCHEMA_VERSION) {
      throw new BackupValidationError(
        `Unsupported schema version ${version} (expected ${SCHEMA_VERSION}).`,
      );
    }
    throw new BackupValidationError('Malformed backup file: unexpected shape.');
  }

  return parsed;
}

/**
 * Reads all tables and produces a backup file.
 * In plain terms: gathers everything stored in the browser into one file
 * you can download.
 */
export async function exportAllData(): Promise<BackupFile> {
  const data = await db.transaction(
    'r',
    db.profiles,
    db.jobPostings,
    db.generations,
    db.generationSnapshots,
    db.latexTemplates,
    async () => {
      const [profiles, jobPostings, generations, generationSnapshots, latexTemplates] = await Promise.all([
        db.profiles.toArray(),
        db.jobPostings.toArray(),
        db.generations.toArray(),
        db.generationSnapshots.toArray(),
        db.latexTemplates.toArray(),
      ]);
      return { profiles, jobPostings, generations, generationSnapshots, latexTemplates };
    },
  );
  return buildBackup(data);
}

/**
 * Clears all tables, then restores them from the given backup.
 * In plain terms: wipes what's currently stored and replaces it with the
 * contents of the uploaded backup file.
 */
export async function importAllData(backup: BackupFile): Promise<void> {
  await db.transaction(
    'rw',
    db.profiles,
    db.jobPostings,
    db.generations,
    db.generationSnapshots,
    db.latexTemplates,
    async () => {
      await Promise.all([
        db.profiles.clear(),
        db.jobPostings.clear(),
        db.generations.clear(),
        db.generationSnapshots.clear(),
        db.latexTemplates.clear(),
      ]);
      await Promise.all([
        db.profiles.bulkPut(backup.data.profiles),
        db.jobPostings.bulkPut(backup.data.jobPostings),
        db.generations.bulkPut(backup.data.generations),
        db.generationSnapshots.bulkPut(backup.data.generationSnapshots),
        db.latexTemplates.bulkPut(backup.data.latexTemplates),
      ]);
    },
  );
}

/**
 * Wipes all local data.
 * In plain terms: the "Delete All Data" button — erases everything stored
 * in the browser.
 */
export async function deleteAllData(): Promise<void> {
  await db.transaction(
    'rw',
    db.profiles,
    db.jobPostings,
    db.generations,
    db.generationSnapshots,
    db.latexTemplates,
    async () => {
      await Promise.all([
        db.profiles.clear(),
        db.jobPostings.clear(),
        db.generations.clear(),
        db.generationSnapshots.clear(),
        db.latexTemplates.clear(),
      ]);
    },
  );
}
