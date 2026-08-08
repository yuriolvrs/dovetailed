// What this file is: small helper functions for loading and saving the
// single LaTeX resume template to Dexie's `latexTemplates` table. Mirrors
// profileStore.ts's singleton pattern -- v1 supports one reusable template,
// addressed by a fixed id, per PRD §9's "convert once, fill deterministically"
// design.
// In plain terms: the code that reads and saves your pasted LaTeX resume
// template to your browser's storage.

import { db } from './db';
import type { LatexTemplate } from '../types';

export const DEFAULT_TEMPLATE_ID = 'default';

export async function loadTemplate(): Promise<LatexTemplate | undefined> {
  return db.latexTemplates.get(DEFAULT_TEMPLATE_ID);
}

export function newTemplate(rawTex: string, compiledTemplate: string, placeholders: string[]): LatexTemplate {
  return { id: DEFAULT_TEMPLATE_ID, name: 'My resume template', rawTex, compiledTemplate, placeholders };
}

export async function saveTemplate(template: LatexTemplate): Promise<void> {
  await db.latexTemplates.put(template);
}

export async function deleteTemplate(): Promise<void> {
  await db.latexTemplates.delete(DEFAULT_TEMPLATE_ID);
}
