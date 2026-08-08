// What this file is: unit tests for the pure functions in backup.ts —
// building a backup file, validating its shape, and parsing one back from
// JSON, including malformed-JSON and mismatched-schema-version cases.
// In plain terms: tests that make sure exporting and importing your data
// actually works, even when the file is broken or out of date.

import { describe, expect, it } from 'vitest';
import { SCHEMA_VERSION } from '../types';
import { BackupValidationError, buildBackup, parseBackup, validateBackup } from './backup';
import type { BackupData } from './backup';

function sampleData(): BackupData {
  return {
    profiles: [
      {
        id: 'default',
        contact: { name: 'Ada Lovelace', email: 'ada@example.com', links: [] },
        skills: [],
        experience: [],
        projects: [],
        education: [],
        writingSamples: [],
        additionalInfo: [],
      },
    ],
    jobPostings: [],
    generations: [],
    generationSnapshots: [],
    latexTemplates: [],
  };
}

describe('buildBackup', () => {
  it('includes the current schema version and every table verbatim', () => {
    const data = sampleData();
    const backup = buildBackup(data);
    expect(backup.schemaVersion).toBe(SCHEMA_VERSION);
    expect(backup.data).toEqual(data);
  });

  it('sets exportedAt to a valid ISO date string', () => {
    const backup = buildBackup(sampleData());
    expect(() => new Date(backup.exportedAt).toISOString()).not.toThrow();
    expect(new Date(backup.exportedAt).toISOString()).toBe(backup.exportedAt);
  });
});

describe('validateBackup', () => {
  it('accepts a well-formed backup file', () => {
    const backup = buildBackup(sampleData());
    expect(validateBackup(backup)).toBe(true);
  });

  it('accepts a backup file with all-empty tables', () => {
    const backup = buildBackup({
      profiles: [],
      jobPostings: [],
      generations: [],
      generationSnapshots: [],
      latexTemplates: [],
    });
    expect(validateBackup(backup)).toBe(true);
  });

  it.each([
    ['null', null],
    ['a string', 'not an object'],
    ['undefined', undefined],
    ['missing schemaVersion', { exportedAt: 'x', data: sampleData() }],
    ['wrong-type schemaVersion', { schemaVersion: '1', exportedAt: 'x', data: sampleData() }],
    ['mismatched schemaVersion', { schemaVersion: SCHEMA_VERSION + 1, exportedAt: 'x', data: sampleData() }],
    ['missing data', { schemaVersion: SCHEMA_VERSION, exportedAt: 'x' }],
    [
      'data.profiles not an array',
      { schemaVersion: SCHEMA_VERSION, exportedAt: 'x', data: { ...sampleData(), profiles: 'nope' } },
    ],
    [
      'data missing a key',
      {
        schemaVersion: SCHEMA_VERSION,
        exportedAt: 'x',
        data: { profiles: [], jobPostings: [], generations: [] },
      },
    ],
  ])('rejects %s', (_label, input) => {
    expect(validateBackup(input)).toBe(false);
  });
});

describe('parseBackup', () => {
  it('round-trips a backup produced by buildBackup', () => {
    const original = buildBackup(sampleData());
    const parsed = parseBackup(JSON.stringify(original));
    expect(parsed).toEqual(original);
  });

  it('throws BackupValidationError on invalid JSON syntax', () => {
    expect(() => parseBackup('{not json')).toThrow(BackupValidationError);
  });

  it('throws BackupValidationError with a version-specific message on schema mismatch', () => {
    const badVersion = { ...buildBackup(sampleData()), schemaVersion: 999 };
    expect(() => parseBackup(JSON.stringify(badVersion))).toThrow(/schema version 999/);
  });

  it('throws BackupValidationError on valid but non-object JSON', () => {
    expect(() => parseBackup('[]')).toThrow(BackupValidationError);
    expect(() => parseBackup('42')).toThrow(BackupValidationError);
  });
});
