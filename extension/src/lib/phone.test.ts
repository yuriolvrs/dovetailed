// What this file is: tests for the phone cleanup helpers.
// In plain terms: checks that "+63" becomes "63" and "0917 123 4567" becomes "9171234567".
import { describe, expect, it } from 'vitest';
import { cleanCallingCode, cleanNationalNumber, cleanPhone } from './phone';

describe('phone cleanup', () => {
  it('strips the plus from the calling code', () => {
    expect(cleanCallingCode('+63')).toBe('63');
    expect(cleanCallingCode(' +1 ')).toBe('1');
  });

  it('strips the trunk zero and separators from the national number', () => {
    expect(cleanNationalNumber('0917 123-4567')).toBe('9171234567');
    expect(cleanNationalNumber('(917) 123 4567')).toBe('9171234567');
  });

  it('cleans both parts, or returns undefined when empty', () => {
    expect(cleanPhone({ countryCallingCode: '+63', nationalNumber: '09171234567' })).toEqual({
      countryCallingCode: '63',
      nationalNumber: '9171234567',
    });
    expect(cleanPhone({ countryCallingCode: '+', nationalNumber: '0' })).toBeUndefined();
    expect(cleanPhone(undefined)).toBeUndefined();
  });
});

describe('cleanPhone countryCode', () => {
  it('keeps the display country', () => {
    expect(cleanPhone({ countryCallingCode: '+1', nationalNumber: '2025550100', countryCode: 'CA' })).toEqual({
      countryCallingCode: '1',
      nationalNumber: '2025550100',
      countryCode: 'CA',
    });
  });
});
