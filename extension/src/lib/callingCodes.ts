// What this file is: country calling codes and the phone country lookup, from libphonenumber-js "min" metadata.
// In plain terms: knows that the Philippines is +63, and which country to show when only "1" or "44" is stored.
// Only the options page imports this file. The library must not enter fill.js or hint.js.
import { getCountryCallingCode, isSupportedCountry } from 'libphonenumber-js/min';
import metadata from 'libphonenumber-js/metadata.min.json';
import type { Country } from './countries';
import type { PhoneNumber } from '../types/profile';

/**
 * The calling code (digits only) for an ISO country code, or undefined if the library has none.
 * In plain terms: "PH" gives "63".
 */
export function callingCode(code: string): string | undefined {
  const upper = code.toUpperCase();
  return isSupportedCountry(upper) ? getCountryCallingCode(upper) : undefined;
}

/**
 * The countries that have a calling code, with the code added to the name: "Philippines (+63)".
 * In plain terms: the phone country list. The search box then also finds digits.
 */
export function listPhoneCountries(countries: Country[]): Country[] {
  const out: Country[] = [];
  for (const c of countries) {
    const cc = callingCode(c.code);
    if (cc) out.push({ code: c.code, name: `${c.name} (+${cc})` });
  }
  return out;
}

/**
 * The ISO country to show for the stored calling code. It tries the chosen phone country,
 * then the address country, then the library's main country for that code (US for 1).
 * Returns undefined when the code is empty or unknown.
 * In plain terms: picks the flag that goes with the stored number.
 */
export function phoneCountry(phone: PhoneNumber | undefined, addressCountry: string | undefined): string | undefined {
  const cc = phone?.countryCallingCode;
  if (!cc) return undefined;
  for (const candidate of [phone.countryCode, addressCountry]) {
    if (candidate && callingCode(candidate) === cc) return candidate.toUpperCase();
  }
  // In the metadata, the first country listed for a calling code is its main country.
  return metadata.country_calling_codes[cc]?.[0];
}
