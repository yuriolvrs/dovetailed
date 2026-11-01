// What this file is: picks the closest option from a list by normalised text. Also matches countries by name or code and phone countries by calling code.
// In plain terms: finds the dropdown choice that best fits a value, such as "Philippines" or "+63".
import { normalizeText } from './detect';

export interface OptionLike {
  text: string;
  value: string;
}

/** Scores how well an option text fits a target. 0 means no fit. */
function score(optionText: string, target: string): number {
  const o = normalizeText(optionText);
  const t = normalizeText(target);
  if (!o || !t) return 0;
  if (o === t) return 4;
  if (o.startsWith(`${t} `)) return 3;
  if (` ${o} `.includes(` ${t} `)) return 2;
  if (o.length >= 3 && ` ${t} `.includes(` ${o} `)) return 1;
  return 0;
}

/**
 * Returns the index of the closest text to the target, or -1 when nothing is close.
 * Ties go to the shorter text.
 * In plain terms: the best matching choice, or none.
 */
export function pickClosest(texts: string[], target: string): number {
  let best = -1;
  let bestScore = 0;
  texts.forEach((text, i) => {
    const s = score(text, target);
    if (s > bestScore || (s === bestScore && s > 0 && text.length < texts[best].length)) {
      best = i;
      bestScore = s;
    }
  });
  return best;
}

/** Closest option by its text. Options with an empty value are placeholders and are skipped. */
export function pickOption(options: OptionLike[], target: string): number {
  const real = options.map((o, i) => ({ o, i })).filter(({ o }) => o.value !== '');
  const k = pickClosest(real.map(({ o }) => o.text), target);
  return k < 0 ? -1 : real[k].i;
}

/** Closest country option, by English name or ISO code. Flag emoji are ignored. */
export function pickCountryOption(options: OptionLike[], countryCode: string): number {
  const code = countryCode.toUpperCase();
  let name = '';
  try {
    name = new Intl.DisplayNames(['en'], { type: 'region' }).of(code) ?? '';
  } catch {
    /* unknown code: only the code can match */
  }
  const lower = code.toLowerCase();
  let best = -1;
  let bestScore = 0;
  options.forEach((o, i) => {
    if (o.value === '') return;
    let s = name ? score(o.text, name) : 0;
    if (normalizeText(o.text) === lower || normalizeText(o.value) === lower) s = Math.max(s, 4);
    if (s > bestScore) {
      best = i;
      bestScore = s;
    }
  });
  return best;
}

/** Option whose text or value holds exactly this calling code, e.g. "+63" or "63". Flag emoji are ignored. */
export function pickCallingCodeOption(options: OptionLike[], callingCode: string): number {
  const want = callingCode.replace(/\D/g, '');
  if (!want) return -1;
  return options.findIndex((o) => {
    if (o.value === '' && !/\+\d/.test(o.text)) return false;
    const fromText = Array.from(o.text.matchAll(/\+\s*(\d{1,4})/g), (m) => m[1]);
    const value = o.value.trim().replace(/^\+/, '');
    return fromText.includes(want) || value === want;
  });
}
