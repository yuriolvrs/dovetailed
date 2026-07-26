// What this file is: sets up the local IndexedDB database (via the Dexie
// library) with one table per data type from src/types. This is where all
// user data actually lives — there is no server-side storage (CLAUDE.md
// architecture invariant). Row shapes come from the shared types; this file
// only declares indexes.
// In plain terms: this is the app's local storage — a small database that
// lives inside your browser, not on any server.

import Dexie, { type EntityTable } from 'dexie';
import type {
  Profile,
  JobPosting,
  Generation,
  GenerationSnapshot,
  LatexTemplate,
} from '../types';
import { SCHEMA_VERSION } from '../types';

export class AppDatabase extends Dexie {
  profiles!: EntityTable<Profile, 'id'>;
  jobPostings!: EntityTable<JobPosting, 'id'>;
  generations!: EntityTable<Generation, 'id'>;
  generationSnapshots!: EntityTable<GenerationSnapshot, 'id'>;
  latexTemplates!: EntityTable<LatexTemplate, 'id'>;

  constructor() {
    super('anti-funemployment');
    // The Dexie version number tracks the IndexedDB schema (indexes). It is
    // intentionally kept in step with the app-level SCHEMA_VERSION used for
    // export/import migrations.
    this.version(SCHEMA_VERSION).stores({
      // Only indexed fields are listed; full objects are stored regardless.
      profiles: 'id',
      jobPostings: 'id, createdAt',
      generations: 'id, jobPostingId, createdAt, type',
      generationSnapshots: 'id, jobPostingId, createdAt, type',
      latexTemplates: 'id, name',
    });
  }
}

export const db = new AppDatabase();
