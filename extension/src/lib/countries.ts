// What this file is: builds the country list (ISO code, English name, flag file) from Intl.DisplayNames, and filters it for a search box.
// In plain terms: gives the country dropdown its choices, its flags and its type-to-search without a hard-coded list.

export interface Country {
  code: string;
  name: string;
}

// Flag files from the flag-icons package. Vite turns each one into a URL at build time.
// '?no-inline' keeps small files as real files, so they do not bloat the JavaScript.
const flagFiles = import.meta.glob<string>('/node_modules/flag-icons/flags/4x3/*.svg', {
  query: '?url&no-inline',
  import: 'default',
  eager: true,
});

const flagUrls = new Map<string, string>();
for (const [path, url] of Object.entries(flagFiles)) {
  const match = /\/([a-z]{2})\.svg$/.exec(path);
  if (match) flagUrls.set(match[1].toUpperCase(), url);
}

/** Region codes that Intl knows but that are not countries. */
const NOT_COUNTRIES = new Set(['EU', 'EZ', 'UN', 'QO', 'XA', 'XB', 'ZZ']);

/**
 * The URL of the flag image for a two-letter code, or undefined if there is none.
 * In plain terms: where to find the little flag picture for a country.
 */
export function flagUrl(code: string | undefined): string | undefined {
  return code ? flagUrls.get(code.toUpperCase()) : undefined;
}

/**
 * All real countries the browser knows a name for and that have a flag file, sorted by name.
 * In plain terms: the list of countries shown in the dropdown.
 */
export function listCountries(): Country[] {
  const names = new Intl.DisplayNames(['en'], { type: 'region' });
  const out: Country[] = [];
  for (let a = 65; a <= 90; a++) {
    for (let b = 65; b <= 90; b++) {
      const code = String.fromCharCode(a, b);
      if (NOT_COUNTRIES.has(code) || !flagUrls.has(code)) continue;
      let name: string | undefined;
      try {
        name = names.of(code);
      } catch {
        continue;
      }
      if (name && name !== code && name !== 'Unknown Region') out.push({ code, name });
    }
  }
  return out.sort((x, y) => x.name.localeCompare(y.name));
}

// Lower case, with accents removed, so "cote" finds "Côte d'Ivoire".
const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

/**
 * Filters countries by what the user typed. An exact code match comes first
 * (for example "PH"), then names that start with the text, then names that
 * contain it. Order inside each group follows the input list.
 * In plain terms: the type-to-search ranking for the country dropdown.
 */
export function filterCountries(countries: Country[], query: string): Country[] {
  const q = fold(query.trim());
  if (!q) return countries;
  const groups: Country[][] = [[], [], []];
  for (const c of countries) {
    const name = fold(c.name);
    if (c.code.toLowerCase() === q) groups[0].push(c);
    else if (name.startsWith(q)) groups[1].push(c);
    else if (name.includes(q)) groups[2].push(c);
  }
  return groups.flat();
}
