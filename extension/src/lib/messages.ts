// What this file is: the typed messages between extension pages and the background, the base64 helpers for file bytes, and the handler that runs a message against the database.
// In plain terms: how the popup and options page ask the background for data, and how files travel in those messages.
import { dbDeleteResume, dbGetProfile, dbGetResume, dbSaveProfile, dbSaveResume } from './db';
import type { ExtensionProfile, ResumeFileRef } from '../types/profile';

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

const CHUNK = 0x8000;

/**
 * Encodes bytes to base64 in chunks, so a big file does not overflow the call stack.
 * In plain terms: turns file bytes into text that a message can carry.
 */
export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

/** Decodes base64 back to the same bytes. In plain terms: the reverse of bytesToBase64. */
export function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

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
