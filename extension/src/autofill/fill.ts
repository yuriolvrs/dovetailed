// What this file is: writes profile values into the detected form fields of a page frame and reports what happened. It never submits a form, clicks Next, or touches checkboxes.
// In plain terms: types your details into the matching boxes, leaves boxes that already have content, and tells you what it could not do.
import { detectFields, isHidden } from './detect';
import type { DetectedField, FieldElement } from './detect';
import { formatPhone } from './phone';
import type { FrameResult } from './report';
import { pickCallingCodeOption, pickClosest, pickCountryOption, pickOption } from './select';
import type { ExtensionProfile } from '../types/profile';

const SOCIAL_HOSTS: Record<string, string[]> = {
  linkedin: ['linkedin.com'],
  github: ['github.com'],
  twitter: ['twitter.com', 'x.com'],
  facebook: ['facebook.com'],
};

function hostMatches(url: string, hosts: string[]): boolean {
  try {
    const h = new URL(url).hostname.toLowerCase();
    return hosts.some((d) => h === d || h.endsWith(`.${d}`));
  } catch {
    return false;
  }
}

function countryName(code?: string): string {
  if (!code) return '';
  try {
    return new Intl.DisplayNames(['en'], { type: 'region' }).of(code.toUpperCase()) ?? '';
  } catch {
    return '';
  }
}

/** Link of a social kind, found by URL host. */
function socialLink(profile: ExtensionProfile, kind: string): string | undefined {
  return profile.links.find((l) => hostMatches(l.url, SOCIAL_HOSTS[kind]))?.url;
}

/** First link that is not a known social profile. */
function otherLink(profile: ExtensionProfile, prefer?: RegExp): string | undefined {
  const others = profile.links.filter((l) => l.url && !Object.values(SOCIAL_HOSTS).some((h) => hostMatches(l.url, h)));
  return (prefer && others.find((l) => prefer.test(l.label))?.url) || others[0]?.url;
}

/**
 * The text value for a field kind, derived from the profile. Returns undefined when the profile has none.
 * Phone is handled apart, because its format depends on the page.
 */
export function valueFor(kind: DetectedField['kind'], p: ExtensionProfile): string | undefined {
  const current = p.experience.find((e) => e.current);
  const a = p.address ?? {};
  const v: Partial<Record<DetectedField['kind'], string | undefined>> = {
    firstName: p.firstName,
    lastName: p.lastName,
    fullName: [p.firstName, p.lastName].filter(Boolean).join(' '),
    email: p.email,
    confirmEmail: p.email,
    street: a.street,
    city: a.city,
    stateProvince: a.stateProvince,
    country: countryName(a.countryCode),
    postalCode: a.postalCode,
    location: [a.city, a.stateProvince, countryName(a.countryCode)].filter(Boolean).join(', '),
    currentCompany: current?.company,
    currentTitle: current?.title,
    linkedin: socialLink(p, 'linkedin'),
    github: socialLink(p, 'github'),
    twitter: socialLink(p, 'twitter'),
    facebook: socialLink(p, 'facebook'),
    portfolio: otherLink(p, /portfolio/i),
    website: otherLink(p),
    expectedSalary: p.expectedSalary,
    noticePeriod: p.noticePeriod,
  };
  return v[kind] || undefined;
}

/**
 * Sets a value with the native prototype setter, then fires input and change events.
 * The native setter skips any value tracker that a framework put on the element, so the framework sees a change.
 * In plain terms: types into a box in a way that React and similar libraries notice.
 */
export function setNativeValue(el: FieldElement, value: string): void {
  const proto =
    el instanceof HTMLSelectElement
      ? HTMLSelectElement.prototype
      : el instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** The visible option elements for a combobox, or an empty list. */
function findOptions(el: HTMLInputElement): HTMLElement[] {
  const root = el.getRootNode() as Document | ShadowRoot;
  const ids = `${el.getAttribute('aria-controls') ?? ''} ${el.getAttribute('aria-owns') ?? ''}`.split(/\s+/).filter(Boolean);
  const owners = ids.map((id) => root.getElementById?.(id)).filter((n): n is HTMLElement => !!n);
  const scopes: ParentNode[] = owners.length ? owners : [root];
  return scopes
    .flatMap((s) => Array.from(s.querySelectorAll<HTMLElement>('[role="option"]')))
    .filter((o) => !isHidden(o));
}

/** Clicks an option with the usual mouse event sequence. Refuses buttons that could submit a form. */
function clickOption(option: HTMLElement): boolean {
  if (option.closest('button, [type="submit"], a[href]')) return false;
  for (const type of ['mousedown', 'mouseup', 'click']) {
    option.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true }));
  }
  return true;
}

type ComboResult = 'ok' | 'no-list' | 'no-match';

/** Types into a combobox, waits for its listbox, and clicks the closest option. On failure it clears what it typed. */
async function fillCombobox(el: HTMLInputElement, text: string, timeoutMs: number): Promise<ComboResult> {
  el.focus();
  setNativeValue(el, text);
  const deadline = Date.now() + timeoutMs;
  let options: HTMLElement[] = [];
  while (Date.now() < deadline) {
    options = findOptions(el);
    if (options.length) break;
    await sleep(50);
  }
  if (options.length) {
    await sleep(100); // let an async filter finish
    options = findOptions(el);
  }
  const clear = () => setNativeValue(el, '');
  if (!options.length) {
    clear();
    return 'no-list';
  }
  const idx = pickClosest(options.map((o) => (o.textContent ?? '').trim()), text);
  if (idx < 0 || !clickOption(options[idx])) {
    clear();
    return 'no-match';
  }
  return 'ok';
}

function isEmpty(f: DetectedField): boolean {
  if (f.control === 'radio') return !f.radios?.some((r) => r.checked);
  if (f.control === 'checkbox') return !(f.el as HTMLInputElement).checked;
  return (f.el as HTMLInputElement).value.trim() === '';
}

/**
 * Detects the form on the page and fills every matched field that is empty.
 * It reports counts and labels only. It never submits, never clicks Next, and leaves checkboxes alone.
 * In plain terms: fills the page and says what worked, what stayed blank, and what failed.
 */
export async function fillPage(
  profile: ExtensionProfile,
  root: Document | ShadowRoot | Element = document,
  opts: { listboxTimeoutMs?: number } = {},
): Promise<Omit<FrameResult, 'url' | 'blocked' | 'atsIframes'>> {
  const timeout = opts.listboxTimeoutMs ?? 2000;
  const { scope, fields } = detectFields(root);
  const done = new Set<DetectedField>();
  const incomplete: FrameResult['incomplete'] = [];
  let filled = 0;
  const hasPhoneCountry = fields.some((f) => f.kind === 'phoneCountry');

  for (const f of fields) {
    if (f.kind === 'unknown') continue;
    const el = f.el;

    if (f.control === 'radio') {
      if (f.kind !== 'noticePeriod' || !profile.noticePeriod || !isEmpty(f)) continue;
      const labels = (f.radios ?? []).map((r) => (r.labels?.[0]?.textContent ?? r.value).trim());
      const i = pickClosest(labels, profile.noticePeriod);
      if (i < 0) {
        incomplete.push({ label: f.label, reason: 'no matching choice' });
      } else {
        f.radios![i].click();
        done.add(f);
        filled++;
      }
      continue;
    }
    if (f.control === 'checkbox') continue;

    if (el instanceof HTMLSelectElement) {
      const options = Array.from(el.options).map((o) => ({ text: o.text, value: o.value }));
      let idx = -1;
      let target: string | undefined;
      if (f.kind === 'phoneCountry') {
        if (!profile.phone) continue;
        idx = pickCallingCodeOption(options, profile.phone.countryCallingCode);
      } else if (f.kind === 'country') {
        if (!profile.address?.countryCode) continue;
        idx = pickCountryOption(options, profile.address.countryCode);
      } else {
        target = valueFor(f.kind, profile);
        if (!target) continue;
        idx = pickOption(options, target);
      }
      // A phone country must match the number we write, so it may replace the site default. Other selects keep a chosen value.
      if (el.value !== '' && f.kind !== 'phoneCountry') {
        done.add(f);
        continue;
      }
      if (idx < 0) {
        incomplete.push({ label: f.label, reason: 'no close option' });
      } else {
        if (el.value !== options[idx].value) setNativeValue(el, options[idx].value);
        done.add(f);
        filled++;
      }
      continue;
    }

    // Text, textarea and combobox inputs.
    if (!isEmpty(f)) {
      done.add(f);
      continue;
    }
    let text: string | undefined;
    if (f.kind === 'phone') {
      if (!profile.phone) continue;
      text = formatPhone(profile.phone, { separateCountry: hasPhoneCountry, placeholder: el.getAttribute('placeholder') ?? '' });
    } else if (f.kind === 'phoneCountry') {
      continue;
    } else {
      text = valueFor(f.kind, profile);
    }
    if (!text) continue;

    if (f.control === 'combobox') {
      const result = await fillCombobox(el as HTMLInputElement, text, timeout);
      if (result === 'ok') {
        done.add(f);
        filled++;
      } else {
        incomplete.push({ label: f.label, reason: result === 'no-list' ? 'no list appeared' : 'no close option' });
      }
    } else {
      setNativeValue(el, text);
      done.add(f);
      filled++;
    }
  }

  const requiredBlank = fields
    .filter((f) => f.required && !done.has(f) && isEmpty(f))
    .map((f) => f.label)
    .filter((label, i, all) => all.indexOf(label) === i);

  return {
    formFound: scope !== null,
    filled,
    requiredBlank,
    incomplete,
    fields: fields.map((f) => ({ control: f.control, kind: f.kind, label: f.label })),
  };
}
