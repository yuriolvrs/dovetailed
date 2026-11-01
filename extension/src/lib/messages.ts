// What this file is: the typed messages between extension pages and the background, the base64 helpers for file bytes, and the handler that runs a message against the database.
// In plain terms: how the popup and options page ask the background for data, and how files travel in those messages.
import { dbDeleteResume, dbGetProfile, dbGetResume, dbSaveProfile, dbSaveResume } from './db';
import { base64ToBytes, bytesToBase64 } from './base64';
import type { ExtensionProfile, ResumeFileRef } from '../types/profile';

export { base64ToBytes, bytesToBase64 };

/** Every request the background accepts. */
export type DataRequest =
  | { type: 'data/getProfile' }
  | { type: 'data/saveProfile'; profile: ExtensionProfile }
  | { type: 'data/getResume' }
  | { type: 'data/saveResume'; fileName: string; mimeType: string; base64: string }
  | { type: 'data/deleteResume' };

/** The resume as it crosses a message: metadata plus base64 bytes. */
export interface ResumePayload {
  ref: ResumeFileRef;
  base64: string;
}

/** The reply shape. Errors travel as text, because Error objects do not survive messaging. */
export type DataResponse<T = unknown> = { ok: true; value: T } | { ok: false; error: string };

/**
 * Runs one request against the database. The background calls this for each message.
 * In plain terms: the one place that turns a request into a stored-data action.
 */
export async function handleDataRequest(req: DataRequest): Promise<DataResponse> {
  try {
    switch (req.type) {
      case 'data/getProfile':
        return { ok: true, value: await dbGetProfile() };
      case 'data/saveProfile':
        await dbSaveProfile(req.profile);
        return { ok: true, value: null };
      case 'data/getResume': {
        const found = await dbGetResume();
        const value: ResumePayload | null = found
          ? { ref: found.ref, base64: bytesToBase64(new Uint8Array(await found.blob.arrayBuffer())) }
          : null;
        return { ok: true, value };
      }
      case 'data/saveResume': {
        const bytes = base64ToBytes(req.base64);
        const ref = await dbSaveResume(req.fileName, req.mimeType, bytes.buffer as ArrayBuffer);
        return { ok: true, value: ref };
      }
      case 'data/deleteResume':
        await dbDeleteResume();
        return { ok: true, value: null };
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
