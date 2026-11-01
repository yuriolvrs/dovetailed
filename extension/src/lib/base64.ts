// What this file is: base64 encode and decode helpers for file bytes. They have no database code, so content scripts can import them.
// In plain terms: turns file bytes into text and back, so a file can travel in a message.

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
