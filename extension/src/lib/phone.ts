// What this file is: cleanup helpers for the stored phone number parts.
// In plain terms: strips the plus sign, the leading zero and any spaces, so only digits are stored.
import type { PhoneNumber } from '../types/profile';

/** Keeps digits only. A leading "+" drops out with all other non-digits. */
export function cleanCallingCode(raw: string): string {
  return raw.replace(/\D/g, '');
}

/** Keeps digits only, then removes the leading trunk zeros. */
export function cleanNationalNumber(raw: string): string {
  return raw.replace(/\D/g, '').replace(/^0+/, '');
}

/** Cleans both parts and keeps the display country. Returns undefined when both are empty. */
export function cleanPhone(phone: PhoneNumber | undefined): PhoneNumber | undefined {
  if (!phone) return undefined;
  const countryCallingCode = cleanCallingCode(phone.countryCallingCode);
  const nationalNumber = cleanNationalNumber(phone.nationalNumber);
  if (!countryCallingCode && !nationalNumber) return undefined;
  return phone.countryCode ? { countryCallingCode, nationalNumber, countryCode: phone.countryCode } : { countryCallingCode, nationalNumber };
}
