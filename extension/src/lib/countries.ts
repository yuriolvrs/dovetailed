// What this file is: builds the country list (ISO code and English name) from Intl.DisplayNames.
// In plain terms: gives the country dropdown its choices without a hard-coded list.

export interface Country {
  code: string;
  name: string;
}

/** All two-letter region codes the browser knows a name for, sorted by name. */
export function listCountries(): Country[] {
  const names = new Intl.DisplayNames(['en'], { type: 'region' });
  const out: Country[] = [];
  for (let a = 65; a <= 90; a++) {
    for (let b = 65; b <= 90; b++) {
      const code = String.fromCharCode(a, b);
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
