// What this file is: unit tests for the country list and the country search ranking.
// In plain terms: checks that the dropdown lists real countries and ranks matches in the right order.
import { describe, expect, it } from 'vitest';
import { filterCountries, flagUrl, listCountries } from './countries';

const sample = [
  { code: 'AU', name: 'Australia' },
  { code: 'AT', name: 'Austria' },
  { code: 'IN', name: 'India' },
  { code: 'PH', name: 'Philippines' },
  { code: 'PN', name: 'Pitcairn Islands' },
  { code: 'US', name: 'United States' },
  { code: 'CI', name: 'Côte d’Ivoire' },
  { code: 'MH', name: 'Marshall Islands' },
];

describe('filterCountries', () => {
  it('returns everything for an empty query', () => {
    expect(filterCountries(sample, '  ')).toEqual(sample);
  });

  it('ranks an exact code match first', () => {
    expect(filterCountries(sample, 'IN')[0].code).toBe('IN');
    expect(filterCountries(sample, 'ph')[0].code).toBe('PH');
    expect(filterCountries(sample, 'us')[0].code).toBe('US');
  });

  it('ranks a code match before names that start with or contain the query', () => {
    // "PN" is the code of Pitcairn; no name starts with "pn".
    expect(filterCountries(sample, 'pn').map((c) => c.code)).toEqual(['PN']);
    const mixed = [
      { code: 'XX', name: 'Spain Isles' },
      { code: 'YY', name: 'Inland' },
      { code: 'IN', name: 'India' },
    ];
    // Code match (India), then starts with "in" (Inland), then contains "in" (Spain Isles).
    expect(filterCountries(mixed, 'in').map((c) => c.code)).toEqual(['IN', 'YY', 'XX']);
  });

  it('ranks names that start with the query before names that contain it', () => {
    expect(filterCountries(sample, 'au').map((c) => c.code)).toEqual(['AU', 'AT']);
    expect(filterCountries(sample, 'a').map((c) => c.code).slice(0, 2)).toEqual(['AU', 'AT']);
  });

  it('matches names that contain the text and ignores accents and case', () => {
    expect(filterCountries(sample, 'phil').map((c) => c.code)).toEqual(['PH']);
    expect(filterCountries(sample, 'COTE').map((c) => c.code)).toEqual(['CI']);
    expect(filterCountries(sample, 'states').map((c) => c.code)).toEqual(['US']);
  });

  it('returns nothing when no country matches', () => {
    expect(filterCountries(sample, 'zzzz')).toEqual([]);
  });
});

describe('listCountries', () => {
  const list = listCountries();
  const codes = new Set(list.map((c) => c.code));

  it('includes real countries with a flag', () => {
    for (const code of ['PH', 'US', 'GB', 'JP']) expect(codes.has(code)).toBe(true);
    expect(list.find((c) => c.code === 'PH')?.name).toBe('Philippines');
  });

  it('excludes regions that are not countries', () => {
    for (const code of ['EU', 'EZ', 'UN', 'QO', 'XA', 'XB', 'ZZ', 'CP', 'DG', 'IC', 'AC', 'TA']) expect(codes.has(code)).toBe(false);
  });

  it('gives every listed country a flag file', () => {
    for (const c of list) expect(flagUrl(c.code), c.code).toBeTruthy();
  });
});
