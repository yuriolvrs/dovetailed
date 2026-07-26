// What this file is: small helper functions for creating, loading, and
// saving generations (resume/cover letter) in Dexie's `generations` table.
// Mirrors jobStore.ts's pattern. One *current* generation per (posting,
// type) -- regenerating overwrites it, matching the matching screen's
// "Re-run" pattern -- so the id is deterministic instead of a fresh uuid
// each time. Past versions aren't lost, though: snapshotGeneration copies
// the about-to-be-overwritten generation into a separate `generationSnapshots`
// table first, and listSnapshots/deleteSnapshot manage that history.
// In plain terms: the code that reads and saves your generated resume (and
// later, cover letter) to your browser's storage, plus the version history
// of past resumes for one job.

import { db } from './db';
import type {
  CoverLetterContent,
  Generation,
  GenerationSnapshot,
  GenerationType,
  ResumeContent,
  SourceMapEntry,
} from '../types';
import { normalizeSkills } from './profileStore';

function generationId(jobPostingId: string, type: GenerationType): string {
  return `${jobPostingId}:${type}`;
}

// A resume generation saved before skills were reintroduced as category
// groups has content.skills as an old flat string[]; rendering that shape
// today crashes (SkillsForm/ResumePrintView expect SkillGroup[]). Reuses
// profileStore's normalizeSkills, which already handles both shapes, so a
// generation made under the old schema still loads and displays correctly
// instead of blank-screening.
// In plain terms: fixes up an old saved resume's skills so it still opens
// correctly under today's category-grouped shape.
export function migrateGeneration(generation: Generation): Generation {
  if (generation.type !== 'resume') return generation;
  const content = generation.content as ResumeContent;
  return { ...generation, content: { ...content, skills: normalizeSkills(content.skills) } };
}

/**
 * Builds a new (or overwriting) generation for a posting. Caller must saveGeneration it.
 * In plain terms: packages up a freshly generated resume, ready to save.
 */
export function newGeneration(
  jobPostingId: string,
  type: GenerationType,
  content: ResumeContent | CoverLetterContent,
  sourceMap: SourceMapEntry[],
): Generation {
  return {
    id: generationId(jobPostingId, type),
    jobPostingId,
    createdAt: Date.now(),
    type,
    content,
    sourceMap,
  };
}

export async function saveGeneration(generation: Generation): Promise<void> {
  await db.generations.put(generation);
}

export async function loadGeneration(
  jobPostingId: string,
  type: GenerationType,
): Promise<Generation | undefined> {
  const generation = await db.generations.get(generationId(jobPostingId, type));
  return generation && migrateGeneration(generation);
}

/**
 * All generations for a posting, regardless of type.
 * In plain terms: every resume/cover letter generated for one job.
 */
export async function listGenerationsForPosting(jobPostingId: string): Promise<Generation[]> {
  const generations = await db.generations.where('jobPostingId').equals(jobPostingId).toArray();
  return generations.map(migrateGeneration);
}

/**
 * Saves a copy of a Generation into version history, just before it's about
 * to be overwritten (regenerate, or restoring a different snapshot) so the
 * prior version isn't lost. A fresh uuid, since -- unlike the single "current"
 * generation -- more than one snapshot can exist per posting/type.
 * In plain terms: keeps a backup copy of a resume right before it gets
 * replaced, so you can get it back later.
 */
export async function snapshotGeneration(generation: Generation): Promise<void> {
  const snapshot: GenerationSnapshot = {
    id: crypto.randomUUID(),
    jobPostingId: generation.jobPostingId,
    type: generation.type,
    createdAt: generation.createdAt,
    content: generation.content,
    sourceMap: generation.sourceMap,
  };
  await db.generationSnapshots.put(snapshot);
}

/**
 * Which generation types (resume/coverLetter) exist for every posting, in
 * one bulk read -- used by the Jobs list to show per-card status pills
 * without an N+1 query per posting.
 * In plain terms: a quick lookup of "does this job have a resume/cover
 * letter yet?" for every saved job at once.
 */
export async function listGenerationTypesByPosting(): Promise<Map<string, Set<GenerationType>>> {
  const generations = await db.generations.toArray();
  const byPosting = new Map<string, Set<GenerationType>>();
  for (const generation of generations) {
    const types = byPosting.get(generation.jobPostingId) ?? new Set<GenerationType>();
    types.add(generation.type);
    byPosting.set(generation.jobPostingId, types);
  }
  return byPosting;
}

/**
 * Past versions of a posting's generation, newest first.
 * In plain terms: the list of earlier resume versions you can go back to.
 */
export async function listSnapshots(jobPostingId: string, type: GenerationType): Promise<GenerationSnapshot[]> {
  const snapshots = await db.generationSnapshots.where('jobPostingId').equals(jobPostingId).toArray();
  return snapshots.filter((s) => s.type === type).sort((a, b) => b.createdAt - a.createdAt);
}

export async function deleteSnapshot(id: string): Promise<void> {
  await db.generationSnapshots.delete(id);
}
