// What this file is: tests for the calling code helpers.
// In plain terms: checks that PH is +63 and that a shared code like 1 shows the right country.
import { describe, expect, it } from 'vitest';
import { callingCode, listPhoneCountries, phoneCountry } from './callingCodes';

const ph = (countryCallingCode: string, countryCode?: string) => ({ countryCallingCode, nationalNumber: '1', countryCode });

describe('callingCode', () => {
  it('returns the digits for a country', () => {
    expect(callingCode('PH')).toBe('63');
    expect(callingCode('ph')).toBe('63');
    expect(callingCode('CA')).toBe('1');
  });
  it('returns undefined for an unknown code', () => {
    expect(callingCode('AQ')).toBeUndefined();
    expect(callingCode('ZZ')).toBeUndefined();
  });
});

describe('listPhoneCountries', () => {
  it('adds the code to the name and drops countries without one', () => {
    const out = listPhoneCountries([
      { code: 'PH', name: 'Philippines' },
      { code: 'AQ', name: 'Antarctica' },
    ]);
    expect(out).toEqual([{ code: 'PH', name: 'Philippines (+63)' }]);
  });
});

describe('phoneCountry', () => {
  it('returns undefined for an empty code', () => {
    expect(phoneCountry(undefined, 'PH')).toBeUndefined();
    expect(phoneCountry(ph(''), 'PH')).toBeUndefined();
  });
  it('prefers the stored phone country', () => {
    expect(phoneCountry(ph('1', 'CA'), 'US')).toBe('CA');
  });
  it('uses the address country when it shares the code', () => {
    expect(phoneCountry(ph('1'), 'CA')).toBe('CA');
    expect(phoneCountry(ph('44'), 'GG')).toBe('GG');
  });
  it('ignores an address country with a different code', () => {
    expect(phoneCountry(ph('63'), 'US')).toBe('PH');
  });
  it('falls back to the main country of a shared code', () => {
    expect(phoneCountry(ph('1'), undefined)).toBe('US');
    expect(phoneCountry(ph('44'), 'PH')).toBe('GB');
    expect(phoneCountry(ph('7'), undefined)).toBe('RU');
  });
  it('returns undefined for an unknown code', () => {
    expect(phoneCountry(ph('999'), undefined)).toBeUndefined();
  });
});
