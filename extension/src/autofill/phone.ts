// What this file is: formats the stored phone number for a form field, using the placeholder as a hint.
// In plain terms: decides whether to type "+639171234567", "09171234567" or just the local part.
import type { PhoneNumber } from '../types/profile';

// Calling codes of countries that dial a leading 0 for national calls.
const TRUNK_ZERO_CODES = new Set(['63', '44', '61', '49', '33', '91', '81', '27', '64', '62', '60', '66', '84', '31']);

/**
 * Returns the text to type into a phone field.
 * With a separate country control, only the national number is written.
 * With a `tel` input alone: a "+" placeholder means international, a leading "0"
 * means trunk format (only for countries that use one), and anything else means international.
 * In plain terms: writes the phone number in the style the box asks for.
 */
export function formatPhone(phone: PhoneNumber, opts: { separateCountry: boolean; placeholder?: string }): string {
  const { countryCallingCode: cc, nationalNumber: nn } = phone;
  if (opts.separateCountry) return nn;
  const hint = (opts.placeholder ?? '').trim();
  const international = `+${cc}${nn}`;
  if (hint.startsWith('+')) return international;
  if (/^\(?0\d/.test(hint) && TRUNK_ZERO_CODES.has(cc)) return `0${nn}`;
  return international;
}
