// What this file is: copies the user's Dovetailed profile from the same browser into the extension profile. It reads the web app's IndexedDB through a tab, checks the row, maps it, and merges it.
// In plain terms: the one-way "copy my details from Dovetailed" feature, with no account and no server.
import { browser } from 'wxt/browser';
import type { ContactLink, EducationEntry, ExperienceEntry } from '../../../src/types';
import type { ExtensionProfile, PhoneNumber, PostalAddress } from '../types/profile';
import { parseLocation, parseName, parsePhone } from './resumeImport';

export const DOVETAILED_ORIGIN = 'https://dovetailed.pages.dev';
export const DOVETAILED_PATTERN = `${DOVETAILED_ORIGIN}/*`;
const TAB_TIMEOUT_MS = 15_000;

/** The user refused access to the Dovetailed site. */
export class DovetailedAccessError extends Error {
  constructor() {
    super('Access to Dovetailed was refused.');
  }
}

/** The tab opened but its data could not be read, or the data had an unexpected shape. */
export class DovetailedReadError extends Error {
  constructor(detail = 'Could not read the Dovetailed profile.') {
    super(detail);
  }
}

/** The part of a Dovetailed profile row that the extension reads. */
export interface DovetailedRow {
  contact: { name: string; email: string; phone?: string; location?: string; links: ContactLink[] };
  experience: ExperienceEntry[];
  education: EducationEntry[];
}

/** The values copied from Dovetailed, in extension shape. */
export interface DovetailedFields {
  firstName: string;
  lastName: string;
  email: string;
  phone?: PhoneNumber;
  address?: PostalAddress;
  links: ContactLink[];
  experience: ExperienceEntry[];
  education: EducationEntry[];
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isString = (v: unknown): v is string => typeof v === 'string';
const optString = (v: unknown) => v === undefined || isString(v);
const allObjects = (v: unknown, check: (o: Record<string, unknown>) => boolean) =>
  Array.isArray(v) && v.every((x) => isObject(x) && check(x));

/**
 * Pure. Checks that a stored row has the shape the mapping needs. The row comes from another
 * origin's storage, so it is treated as unchecked input.
 * In plain terms: refuses data that does not look like a Dovetailed profile.
 */
export function isDovetailedRow(row: unknown): row is DovetailedRow {
  if (!isObject(row) || !isObject(row.contact)) return false;
  const c = row.contact;
  return (
    isString(c.name) &&
    isString(c.email) &&
    optString(c.phone) &&
    optString(c.location) &&
    allObjects(c.links, (l) => isString(l.label) && isString(l.url)) &&
    allObjects(row.experience, (e) => isString(e.company) && isString(e.title) && Array.isArray(e.bullets) && e.bullets.every(isString)) &&
    allObjects(row.education, (e) => isString(e.school) && isString(e.degree))
  );
}

/**
 * Runs inside the Dovetailed page. It must stand alone: no outside names, because the browser
 * serialises it. It checks that the database exists first, because opening a missing one would
 * create an empty database in the app's origin. It opens without a version, reads once, closes,
 * and writes nothing.
 * In plain terms: the small script that looks up your saved profile inside the Dovetailed tab.
 */
export async function readProfileRow(): Promise<{ status: 'none' } | { status: 'ok'; row: unknown }> {
  const databases = await indexedDB.databases();
  if (!databases.some((d) => d.name === 'anti-funemployment')) return { status: 'none' };
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('anti-funemployment');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('blocked'));
  });
  try {
    if (!db.objectStoreNames.contains('profiles')) return { status: 'none' };
    const rows = await new Promise<unknown[]>((resolve, reject) => {
      const request = db.transaction('profiles', 'readonly').objectStore('profiles').getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    return rows.length ? { status: 'ok', row: rows[0] } : { status: 'none' };
  } finally {
    db.close();
  }
}

/** Resolves when the tab is complete. Rejects after the time limit. The listener is always removed. */
function waitForComplete(tabId: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const done = (error?: Error) => {
      clearTimeout(timer);
      browser.tabs.onUpdated.removeListener(onUpdated);
      error ? reject(error) : resolve();
    };
    const onUpdated = (id: number, info: { status?: string }) => {
      if (id === tabId && info.status === 'complete') done();
    };
    const timer = setTimeout(() => done(new DovetailedReadError('The Dovetailed tab took too long to load.')), TAB_TIMEOUT_MS);
    browser.tabs.onUpdated.addListener(onUpdated);
    browser.tabs.get(tabId).then(
      (tab) => tab.status === 'complete' && done(),
      (e) => done(e instanceof Error ? e : new DovetailedReadError()),
    );
  });
}

/**
 * Asks for access to the Dovetailed origin (call it straight from a click), then reads the saved
 * profile row. It uses an open Dovetailed tab if there is one. If not, it opens an inactive tab
 * and closes it again, also on failure. It never closes a tab it did not open.
 * Returns undefined when Dovetailed has no profile in this browser.
 * In plain terms: fetches your Dovetailed profile from the browser, then cleans up after itself.
 */
export async function readDovetailedProfile(): Promise<DovetailedRow | undefined> {
  if (!(await browser.permissions.request({ origins: [DOVETAILED_PATTERN] }))) throw new DovetailedAccessError();
  let openedId: number | undefined;
  try {
    let tabId = (await browser.tabs.query({ url: DOVETAILED_PATTERN })).find((t) => t.id !== undefined)?.id;
    if (tabId === undefined) {
      const tab = await browser.tabs.create({ url: `${DOVETAILED_ORIGIN}/`, active: false });
      openedId = tab.id;
      if (openedId === undefined) throw new DovetailedReadError();
      tabId = openedId;
      await waitForComplete(tabId);
    }
    const [injection] = await browser.scripting.executeScript({ target: { tabId }, func: readProfileRow });
    const result = injection?.result;
    if (!result) throw new DovetailedReadError();
    if (result.status === 'none') return undefined;
    if (!isDovetailedRow(result.row)) throw new DovetailedReadError('The Dovetailed profile has an unexpected shape.');
    return result.row;
  } catch (e) {
    throw e instanceof DovetailedReadError ? e : new DovetailedReadError();
  } finally {
    if (openedId !== undefined) await browser.tabs.remove(openedId).catch(() => undefined);
  }
}

/**
 * Pure. Maps a checked row to extension fields. It reuses the resume parsers for name, phone and
 * location. Skills, projects, summary, writing samples and additional info are not copied.
 * In plain terms: translates Dovetailed's profile into the extension's boxes.
 */
export function toExtensionFields(row: DovetailedRow): DovetailedFields {
  const c = row.contact;
  const name = parseName(c.name);
  const address = c.location?.trim() ? parseLocation(c.location) : undefined;
  return {
    firstName: name.firstName ?? '',
    lastName: name.lastName ?? '',
    email: c.email.trim(),
    phone: c.phone ? parsePhone(c.phone) : undefined,
    address: address && Object.keys(address).length ? address : undefined,
    links: c.links.filter((l) => l.url.trim()),
    experience: row.experience,
    education: row.education,
  };
}

const blank = (s: string | undefined) => !s?.trim();
const hasNumber = (p: PhoneNumber | undefined) => !!p?.nationalNumber.trim();
const ADDRESS_KEYS = [
  ['city', 'City'],
  ['stateProvince', 'State or province'],
  ['countryCode', 'Country'],
] as const;
const sameJson = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const hasLinks = (links: ContactLink[]) => links.some((l) => l.url.trim());

/**
 * Pure. Lists the labels of fields where both sides have a value and the values differ.
 * In plain terms: tells you what a copy would overwrite.
 */
export function conflicts(current: ExtensionProfile, incoming: DovetailedFields): string[] {
  const out: string[] = [];
  const text = (label: string, a: string, b: string) => {
    if (!blank(a) && !blank(b) && a.trim() !== b.trim()) out.push(label);
  };
  text('First name', current.firstName, incoming.firstName);
  text('Last name', current.lastName, incoming.lastName);
  text('Email', current.email, incoming.email);
  const [p, q] = [current.phone, incoming.phone];
  if (hasNumber(p) && hasNumber(q)) {
    const codeDiffers = !!p!.countryCallingCode && !!q!.countryCallingCode && p!.countryCallingCode !== q!.countryCallingCode;
    if (codeDiffers || p!.nationalNumber !== q!.nationalNumber) out.push('Phone');
  }
  for (const [key, label] of ADDRESS_KEYS) text(label, current.address?.[key] ?? '', incoming.address?.[key] ?? '');
  if (hasLinks(current.links) && hasLinks(incoming.links) && !sameJson(current.links, incoming.links)) out.push('Links');
  if (current.experience.length && incoming.experience.length && !sameJson(current.experience, incoming.experience)) out.push('Experience');
  if (current.education.length && incoming.education.length && !sameJson(current.education, incoming.education)) out.push('Education');
  return out;
}

/**
 * Pure. Returns the next profile. "fillEmpty" writes only empty fields. "replace" writes every
 * non-empty incoming value and keeps the current value where the incoming one is empty. Neither
 * touches the resume, salary, notice period, version, street or postal code. A phone without a
 * calling code keeps the current calling code and country.
 * In plain terms: the two ways to apply the copy, "fill the blanks" and "overwrite".
 */
export function mergeDovetailed(
  current: ExtensionProfile,
  incoming: DovetailedFields,
  mode: 'fillEmpty' | 'replace',
): ExtensionProfile {
  const next: ExtensionProfile = { ...current };
  const replace = mode === 'replace';
  const text = (key: 'firstName' | 'lastName' | 'email') => {
    if (!blank(incoming[key]) && (replace || blank(current[key]))) next[key] = incoming[key];
  };
  text('firstName');
  text('lastName');
  text('email');

  if (hasNumber(incoming.phone) && (replace || !hasNumber(current.phone))) {
    const { countryCallingCode, nationalNumber } = incoming.phone!;
    next.phone = countryCallingCode
      ? { countryCallingCode, nationalNumber }
      : {
          countryCallingCode: current.phone?.countryCallingCode ?? '',
          nationalNumber,
          ...(current.phone?.countryCode ? { countryCode: current.phone.countryCode } : {}),
        };
  }

  if (incoming.address) {
    const address: PostalAddress = { ...current.address };
    for (const [key] of ADDRESS_KEYS) {
      const value = incoming.address[key];
      if (!blank(value) && (replace || blank(address[key]))) address[key] = value;
    }
    next.address = address;
  }

  if (hasLinks(incoming.links) && (replace || !hasLinks(current.links))) next.links = incoming.links;
  if (incoming.experience.length && (replace || !current.experience.length)) next.experience = incoming.experience;
  if (incoming.education.length && (replace || !current.education.length)) next.education = incoming.education;
  return next;
}

/**
 * Pure. Counts what changed between two profiles. Each link, role and school counts as one.
 * In plain terms: the number shown as "Copied N fields".
 */
export function changedCount(before: ExtensionProfile, after: ExtensionProfile): number {
  let n = 0;
  for (const key of ['firstName', 'lastName', 'email'] as const) if (before[key] !== after[key]) n++;
  if (!sameJson(before.phone, after.phone)) n++;
  for (const [key] of ADDRESS_KEYS) if ((before.address?.[key] ?? '') !== (after.address?.[key] ?? '')) n++;
  if (!sameJson(before.links, after.links)) n += after.links.length;
  if (!sameJson(before.experience, after.experience)) n += after.experience.length;
  if (!sameJson(before.education, after.education)) n += after.education.length;
  return n;
}
