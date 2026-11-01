// What this file is: tests for mapping a resume extraction onto the profile, dropping unverified values, and the text-only read.
// In plain terms: checks that the resume fills only empty boxes, splits names, phones and places correctly, and drops invented text.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ExtractedProfile } from '../../../src/prompts/extractProfile';
import type { ExtensionProfile } from '../types/profile';

const generateStructured = vi.fn();
const readTextLocally = vi.fn();
vi.mock('../../../src/lib/llm', () => ({ generateStructured: (...a: unknown[]) => generateStructured(...a) }));
vi.mock('../../../src/lib/files/localText', () => ({ readTextLocally: (...a: unknown[]) => readTextLocally(...a) }));

import { dropUnverified, extractFromResume, mapExtracted, NoReadableTextError } from './resumeImport';

const empty: ExtensionProfile = {
  version: 1,
  firstName: '',
  lastName: '',
  email: '',
  links: [],
  experience: [],
  education: [],
};
const extracted = (over: Partial<ExtractedProfile['contact']> = {}, rest: Partial<ExtractedProfile> = {}): ExtractedProfile => ({
  contact: { name: 'Testa Examplo', email: 'testa@example.invalid', ...over },
  skills: [],
  experience: [],
  projects: [],
  education: [],
  ...rest,
});
const phoneOf = (phone: string) => mapExtracted(extracted({ phone }), empty).profile.phone;

describe('mapExtracted', () => {
  it('fills an empty profile and counts the fields', () => {
    const r = mapExtracted(extracted(), empty);
    expect(r.profile).toMatchObject({ firstName: 'Testa', lastName: 'Examplo', email: 'testa@example.invalid' });
    expect(r.filled).toBe(3);
  });

  it('keeps existing values and counts only what it filled', () => {
    const r = mapExtracted(extracted(), { ...empty, firstName: 'Mine', email: 'mine@example.invalid' });
    expect(r.profile.firstName).toBe('Mine');
    expect(r.profile.email).toBe('mine@example.invalid');
    expect(r.profile.lastName).toBe('Examplo');
    expect(r.filled).toBe(1);
  });

  it('does not change the input profile', () => {
    const before = JSON.stringify(empty);
    mapExtracted(extracted(), empty);
    expect(JSON.stringify(empty)).toBe(before);
  });

  it('uses the last word as the last name and the rest as the first name', () => {
    const p = mapExtracted(extracted({ name: 'Maria Luisa de la Cruz' }), empty).profile;
    expect(p.firstName).toBe('Maria Luisa de la');
    expect(p.lastName).toBe('Cruz');
  });

  it('gives a one-word name to the first name only', () => {
    const p = mapExtracted(extracted({ name: 'Testa' }), empty).profile;
    expect(p).toMatchObject({ firstName: 'Testa', lastName: '' });
  });

  describe('phone', () => {
    it('reads a one-digit calling code', () => {
      expect(phoneOf('+1 (415) 555-0100')).toEqual({ countryCallingCode: '1', nationalNumber: '4155550100' });
    });
    it('reads a two-digit calling code', () => {
      expect(phoneOf('+63 917 123 4567')).toEqual({ countryCallingCode: '63', nationalNumber: '9171234567' });
    });
    it('reads a three-digit calling code', () => {
      expect(phoneOf('+353 85 123 4567')).toEqual({ countryCallingCode: '353', nationalNumber: '851234567' });
    });
    it('strips a leading 0 and leaves the code empty without a plus', () => {
      expect(phoneOf('0917 123 4567')).toEqual({ countryCallingCode: '', nationalNumber: '9171234567' });
    });
    it('ignores text with no digits', () => {
      expect(phoneOf('call me')).toBeUndefined();
    });
    it('keeps an existing phone', () => {
      const phone = { countryCallingCode: '44', nationalNumber: '2079460000' };
      expect(mapExtracted(extracted({ phone: '+63 917 123 4567' }), { ...empty, phone }).profile.phone).toEqual(phone);
    });
  });

  describe('location', () => {
    it('splits city, state and a known country', () => {
      const a = mapExtracted(extracted({ location: 'Manila, Metro Manila, Philippines' }), empty).profile.address;
      expect(a).toEqual({ city: 'Manila', stateProvince: 'Metro Manila', countryCode: 'PH' });
    });
    it('puts unknown text in the city and state', () => {
      const a = mapExtracted(extracted({ location: 'Vancouver, WA' }), empty).profile.address;
      expect(a).toEqual({ city: 'Vancouver', stateProvince: 'WA' });
    });
    it('puts a single unknown word in the city', () => {
      expect(mapExtracted(extracted({ location: 'Remote' }), empty).profile.address).toEqual({ city: 'Remote' });
    });
    it('fills only the empty address fields', () => {
      const r = mapExtracted(extracted({ location: 'Manila, Philippines' }), { ...empty, address: { city: 'Cebu' } });
      expect(r.profile.address).toEqual({ city: 'Cebu', countryCode: 'PH' });
      expect(r.filled).toBe(4);
    });
  });

  it('adds links through toContactLink, only when the profile has none', () => {
    const e = extracted({ links: ['github.com/testa'] });
    expect(mapExtracted(e, empty).profile.links).toEqual([{ label: 'GitHub', url: 'https://github.com/testa' }]);
    const own = [{ label: 'Site', url: 'https://mine.example.invalid' }];
    expect(mapExtracted(e, { ...empty, links: own }).profile.links).toEqual(own);
  });

  it('appends experience and education only when the profile has none', () => {
    const e = extracted(
      {},
      {
        experience: [{ company: 'Acme', title: 'Clerk', bullets: ['Did work'] }],
        education: [{ school: 'Example University', degree: 'BSc' }],
      },
    );
    const r = mapExtracted(e, empty);
    expect(r.profile.experience).toEqual([{ company: 'Acme', title: 'Clerk', bullets: ['Did work'], current: false }]);
    expect(r.profile.education).toHaveLength(1);
    expect(r.filled).toBe(5);
    const mine = { ...empty, experience: [{ company: 'Mine', title: 'T', bullets: [], current: false }] };
    expect(mapExtracted(e, mine).profile.experience).toEqual(mine.experience);
  });
});

describe('dropUnverified', () => {
  const corpus = 'Testa Examplo\ntesta@example.invalid\nAcme Clerk\n- Did work\nExample University BSc';

  it('removes values that are not in the document', () => {
    const e = extracted(
      { name: 'Invented Person', phone: '+63 999', links: ['github.com/not-there'] },
      {
        experience: [
          { company: 'Acme', title: 'Clerk', bullets: ['Did work', 'Led a team of 50'], current: false },
          { company: 'Fake Corp', title: 'CEO', bullets: [], current: false },
        ],
        education: [{ school: 'Made Up College', degree: 'PhD', current: false }],
      },
    );
    const r = dropUnverified(e, corpus);
    expect(r.contact.name).toBeUndefined();
    expect(r.contact.phone).toBeUndefined();
    expect(r.contact.links).toEqual([]);
    expect(r.contact.email).toBe('testa@example.invalid');
    expect(r.experience).toHaveLength(1);
    expect(r.experience[0].bullets).toEqual(['Did work']);
    expect(r.education).toEqual([]);
  });
});

describe('extractFromResume', () => {
  beforeEach(() => {
    generateStructured.mockReset();
    readTextLocally.mockReset();
  });

  it('refuses a file with no readable text and sends nothing', async () => {
    readTextLocally.mockResolvedValue(null);
    await expect(extractFromResume(new File(['x'], 'scan.pdf'))).rejects.toBeInstanceOf(NoReadableTextError);
    expect(generateStructured).not.toHaveBeenCalled();
  });

  it('sends the text, not the file, and returns the checked result', async () => {
    readTextLocally.mockResolvedValue('Testa Examplo testa@example.invalid');
    generateStructured.mockResolvedValue(extracted({ name: 'Testa Examplo', phone: '+1 555' }));
    const r = await extractFromResume(new File(['x'], 'r.pdf'));
    expect(generateStructured.mock.calls[0][0]).toContain('Testa Examplo testa@example.invalid');
    expect(r.contact.phone).toBeUndefined();
    expect(r.contact.name).toBe('Testa Examplo');
  });
});
