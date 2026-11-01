// What this file is: tests for phone formatting and for the calling-code and country option matching.
// In plain terms: checks the phone is typed in the style the page asks for, and the right dropdown choice is picked.
import { describe, expect, it } from 'vitest';
import { formatPhone } from './phone';
import { pickCallingCodeOption, pickClosest, pickCountryOption, pickOption } from './select';

const ph = { countryCallingCode: '63', nationalNumber: '9171234567' };
const us = { countryCallingCode: '1', nationalNumber: '2025550100' };

describe('formatPhone', () => {
  it('writes the national number when a separate country control exists', () => {
    expect(formatPhone(ph, { separateCountry: true, placeholder: '+63 917' })).toBe('9171234567');
  });
  it('uses international format for a + placeholder', () => {
    expect(formatPhone(ph, { separateCountry: false, placeholder: '+44 7400 123456' })).toBe('+639171234567');
  });
  it('uses trunk 0 for a 0 placeholder in a country that has one', () => {
    expect(formatPhone(ph, { separateCountry: false, placeholder: '0917 123 4567' })).toBe('09171234567');
  });
  it('does not add a trunk 0 for a country without one', () => {
    expect(formatPhone(us, { separateCountry: false, placeholder: '0123 456' })).toBe('+12025550100');
  });
  it('uses international format with no hint', () => {
    expect(formatPhone(ph, { separateCountry: false })).toBe('+639171234567');
    expect(formatPhone(ph, { separateCountry: false, placeholder: '(555) 123-4567' })).toBe('+639171234567');
  });
});

describe('select matching', () => {
  const opts = (...t: string[]) => t.map((text) => ({ text, value: text }));
  it('picks the closest text, preferring exact and shorter', () => {
    expect(pickClosest(['Manila', 'Manila City', 'Cebu'], 'manila')).toBe(0);
    expect(pickClosest(['Metro Manila', 'Cebu'], 'Manila')).toBe(0);
    expect(pickClosest(['Cebu', 'Davao'], 'Manila')).toBe(-1);
  });
  it('skips placeholder options', () => {
    expect(pickOption([{ text: 'Select', value: '' }, { text: 'Cebu', value: 'c' }], 'Cebu')).toBe(1);
  });
  it('matches a country by name, code or value, ignoring flags', () => {
    expect(pickCountryOption(opts('United States', '\u{1F1F5}\u{1F1ED} Philippines'), 'PH')).toBe(1);
    expect(pickCountryOption([{ text: 'Philippines', value: 'PH' }], 'PH')).toBe(0);
    expect(pickCountryOption([{ text: 'Land of PH', value: 'ph' }], 'PH')).toBe(0);
    expect(pickCountryOption(opts('France'), 'PH')).toBe(-1);
  });
  it('matches a calling code in text or value, ignoring flags, and not a longer code', () => {
    const o = [
      { text: '', value: '' },
      { text: '\u{1F1FA}\u{1F1F8} +1', value: 'us' },
      { text: '\u{1F1F5}\u{1F1ED} Philippines (+63)', value: 'ph' },
      { text: '+1242', value: 'bs' },
    ];
    expect(pickCallingCodeOption(o, '63')).toBe(2);
    expect(pickCallingCodeOption(o, '1')).toBe(1);
    expect(pickCallingCodeOption([{ text: 'PH', value: '63' }], '63')).toBe(0);
    expect(pickCallingCodeOption(o, '999')).toBe(-1);
  });
});
