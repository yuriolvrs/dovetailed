// What this file is: the only access path to profile and resume data. Every call sends a message to the background, which owns the database.
// In plain terms: the one door every part of the extension uses to read or save your data.
import { browser } from 'wxt/browser';
import { base64ToBytes, bytesToBase64 } from './messages';
import type { DataRequest, DataResponse, ResumePayload } from './messages';
import type { ExtensionProfile, ResumeFileRef } from '../types/profile';

/** Sends a request and unwraps the reply. It throws if the background reports an error. */
async function request<T>(req: DataRequest): Promise<T> {
  const res = (await browser.runtime.sendMessage(req)) as DataResponse<T> | undefined;
  if (!res) throw new Error('No reply from the extension background.');
  if (!res.ok) throw new Error(res.error);
  return res.value;
}

/** Returns the stored profile, or an empty default. */
export function getProfile(): Promise<ExtensionProfile> {
  return request<ExtensionProfile>({ type: 'data/getProfile' });
}

/** Saves the profile. The stored resume reference is kept as it is. */
export async function saveProfile(profile: ExtensionProfile): Promise<void> {
  await request<null>({ type: 'data/saveProfile', profile });
}

/**
 * Returns the stored resume as a File, or null.
 * In plain terms: gives back your resume file, ready to attach to a form.
 */
export async function getResume(): Promise<File | null> {
  const payload = await request<ResumePayload | null>({ type: 'data/getResume' });
  if (!payload) return null;
  return new File([base64ToBytes(payload.base64) as BlobPart], payload.ref.fileName, {
    type: payload.ref.mimeType,
    lastModified: payload.ref.updatedAt,
  });
}

/** Stores a resume file (PDF or DOCX, up to 15 MB). It replaces any old one. */
export async function saveResume(file: File): Promise<ResumeFileRef> {
  const base64 = bytesToBase64(new Uint8Array(await file.arrayBuffer()));
  return request<ResumeFileRef>({ type: 'data/saveResume', fileName: file.name, mimeType: file.type, base64 });
}

/** Deletes the stored resume. */
export async function deleteResume(): Promise<void> {
  await request<null>({ type: 'data/deleteResume' });
}
