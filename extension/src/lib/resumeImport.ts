// What this file is: reads the stored resume into profile fields. It extracts text, asks the proxy for structured data, drops unverified values, and maps the result onto the extension profile.
// In plain terms: turns your resume file into suggested profile entries, and only fills boxes that are still empty.
import type { ExtractedProfile } from '../../../src/prompts/extractProfile';
import { buildExtractProfilePrompt, isExtractedProfile } from '../../../src/prompts/extractProfile';
import { generateStructured } from '../../../src/lib/llm';
import { readTextLocally } from '../../../src/lib/files/localText';
import { toContactLink } from '../../../src/lib/files/mergeProfile';
import { verifyExtractedProfile } from '../../../src/lib/files/verifyExtraction';
import type { EducationEntry, ExperienceEntry } from '../../../src/types';
import type { ExtensionProfile, PhoneNumber, PostalAddress } from '../types/profile';
import { cleanNationalNumber } from './phone';
import { listCountries } from './countries';

// Same budget and effort as the web app's resume import.
const EXTRACT_MAX_TOKENS = 6000;

export class NoReadableTextError extends Error {
  constructor() {
    super('This file has no text the extension can read here. It may be a scan. Nothing was sent.');
  }
}

// Two-digit calling codes. Calling codes have no shared prefixes, so these two digits
// settle the length: 1 and 7 are one digit, a code in this set has two digits, and any other
// code has three.
const TWO_DIGIT_CODES = new Set(
  '20 27 30 31 32 33 34 36 39 40 41 43 44 45 46 47 48 49 51 52 53 54 55 56 57 58 60 61 62 63 64 65 66 81 82 84 86 90 91 92 93 94 95 98'.split(' '),
);

/**
 * Splits a phone string from a resume. "+63 917 123 4567" gives code "63". Without a plus
 * sign the calling code stays empty and a leading 0 is removed.
 * In plain terms: reads a phone number as it is printed on a resume.
 */
export function parsePhone(raw: string): PhoneNumber | undefined {
  const text = raw.trim();
  const digits = text.replace(/\D/g, '');
  if (!digits) return undefined;
  if (!text.startsWith('+')) return { countryCallingCode: '', nationalNumber: cleanNationalNumber(digits) };
  const length = digits[0] === '1' || digits[0] === '7' ? 1 : TWO_DIGIT_CODES.has(digits.slice(0, 2)) ? 2 : 3;
  const nationalNumber = cleanNationalNumber(digits.slice(length));
  if (!nationalNumber) return undefined;
  return { countryCallingCode: digits.slice(0, length), nationalNumber };
}

const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim();

/**
 * Splits "City, State, Country" on commas. The last part is matched against the country list.
 * Text that is not a known country goes to city (and state).
 * In plain terms: sorts a one-line location into city, state and country.
 */
export function parseLocation(raw: string): PostalAddress {
  const parts = raw.split(',').map((p) => p.trim()).filter(Boolean);
  const out: PostalAddress = {};
  if (!parts.length) return out;
  const last = fold(parts[parts.length - 1]);
  const country = listCountries().find((c) => fold(c.name) === last);
  if (country) {
    out.countryCode = country.code;
    parts.pop();
  }
  if (parts.length) out.city = parts[0];
  if (parts.length > 1) out.stateProvince = parts[parts.length - 1];
  return out;
}

/**
 * Splits a full name. The last word is the last name. The rest is the first name, without
 * middle initials such as "G.". A leading initial stays, because it can be how the person goes by.
 * In plain terms: "Marc Yuri G. Olivares" becomes "Marc Yuri" and "Olivares".
 */
export function parseName(raw: string): { firstName?: string; lastName?: string } {
  const words = raw.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return {};
  if (words.length === 1) return { firstName: words[0] };
  const given = words.slice(0, -1).filter((word, i) => i === 0 || !/^\p{L}\.?$/u.test(word));
  return { firstName: given.join(' '), lastName: words[words.length - 1] };
}

/**
 * Pure. Copies resume values into EMPTY profile fields only. Returns the new profile and
 * how many fields (each link, role and school counts as one) it filled.
 * In plain terms: adds what the resume knows, and never overwrites what you typed.
 */
export function mapExtracted(
  extracted: ExtractedProfile,
  profile: ExtensionProfile,
): { profile: ExtensionProfile; filled: number } {
  const next: ExtensionProfile = { ...profile };
  let filled = 0;
  const c = extracted.contact ?? {};

  const set = <K extends keyof ExtensionProfile>(key: K, value: ExtensionProfile[K]) => {
    next[key] = value;
    filled++;
  };

  if (c.name?.trim()) {
    const name = parseName(c.name);
    if (!profile.firstName.trim() && name.firstName) set('firstName', name.firstName);
    if (!profile.lastName.trim() && name.lastName) set('lastName', name.lastName);
  }
  if (!profile.email.trim() && c.email?.trim()) set('email', c.email.trim());

  const hasPhone = !!(profile.phone?.nationalNumber.trim() || profile.phone?.countryCallingCode.trim());
  const phone = hasPhone || !c.phone ? undefined : parsePhone(c.phone);
  if (phone) set('phone', phone);

  if (c.location?.trim()) {
    const found = parseLocation(c.location);
    const address: PostalAddress = { ...profile.address };
    let added = 0;
    for (const key of ['city', 'stateProvince', 'countryCode'] as const) {
      if (found[key] && !address[key]?.trim()) {
        address[key] = found[key];
        added++;
      }
    }
    if (added) {
      next.address = address;
      filled += added;
    }
  }

  const links = (c.links ?? []).filter((l) => l.trim()).map(toContactLink);
  if (!profile.links.some((l) => l.url.trim()) && links.length) {
    next.links = links;
    filled += links.length;
  }

  if (!profile.experience.length && extracted.experience?.length) {
    next.experience = extracted.experience.map((e): ExperienceEntry => ({ ...e, current: e.current ?? false }));
    filled += next.experience.length;
  }
  if (!profile.education.length && extracted.education?.length) {
    next.education = extracted.education.map((e): EducationEntry => ({ ...e, current: e.current ?? false }));
    filled += next.education.length;
  }
  return { profile: next, filled };
}

/**
 * Anti-fabrication. Removes every value that the verifier cannot find in the resume text.
 * An experience or education entry whose key text is missing is dropped as a whole.
 * In plain terms: throws away anything the AI wrote that is not really in your file.
 */
export function dropUnverified(extracted: ExtractedProfile, corpus: string): ExtractedProfile {
  const bad = new Set(verifyExtractedProfile(extracted, corpus).map((u) => u.path));
  const c = extracted.contact ?? {};
  const contact: ExtractedProfile['contact'] = { ...c };
  for (const key of ['name', 'email', 'phone', 'location'] as const) if (bad.has(`contact.${key}`)) delete contact[key];
  contact.links = (c.links ?? []).filter((_, i) => !bad.has(`contact.links.${i}`));
  const keepEntry = (prefix: string, i: number, keys: string[]) => keys.every((k) => !bad.has(`${prefix}.${i}.${k}`));
  return {
    ...extracted,
    contact,
    experience: (extracted.experience ?? [])
      .map((e, i) => ({ e, i }))
      .filter(({ i }) => keepEntry('experience', i, ['company', 'title']))
      .map(({ e, i }) => ({ ...e, bullets: e.bullets.filter((_, b) => !bad.has(`experience.${i}.bullets.${b}`)) })),
    education: (extracted.education ?? []).filter((_, i) => keepEntry('education', i, ['school', 'degree'])),
  };
}

/**
 * Reads the file here, sends only its text through the proxy, and returns the checked result.
 * A scan (no text layer) is refused. The file itself is never sent.
 * In plain terms: the whole "read my resume" step, short of changing your profile.
 */
export async function extractFromResume(file: File): Promise<ExtractedProfile> {
  const text = await readTextLocally(file);
  if (!text) throw new NoReadableTextError();
  const extracted = await generateStructured(buildExtractProfilePrompt(text), isExtractedProfile, {
    maxTokens: EXTRACT_MAX_TOKENS,
    reasoningEffort: 'low',
  });
  return dropUnverified(extracted, text);
}
