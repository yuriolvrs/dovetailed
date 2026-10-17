// What this file is: unit tests for the deterministic cover letter checks (wrong employer,
// duplicate sentences, meta phrases and stock phrases).
// In plain terms: tests proving the plain-code letter rules catch what they should and leave good
// sentences alone.

import { describe, expect, it } from 'vitest';
import { cleanMetaPhrases, findDuplicateSentences, findWrongEmployer } from './letterChecks';

const profile = {
  experience: [
    { company: 'St. Mary Hospital', title: 'Scribe', current: false, bullets: [] },
    { company: 'Riverside Clinic, Inc.', title: 'Volunteer', current: false, bullets: [] },
    { company: 'AB', title: 'Tiny', current: false, bullets: [] },
  ],
  projects: [{ name: 'Food Bank Tracker', description: '', bullets: [], links: [] }],
  education: [{ school: 'Lakeview University', degree: 'B.S.', current: false }],
};

describe('findWrongEmployer', () => {
  it('flags an employer named in the sentence but absent from every cited label', () => {
    const labels = ['Experience: Scribe, St. Mary Hospital'];
    expect(findWrongEmployer('At Riverside Clinic I welcomed patients.', labels, profile)).toBe('Riverside Clinic');
  });

  it('accepts a sentence whose named employer is in a cited label (case-insensitive)', () => {
    const labels = ['Experience: Volunteer, Riverside Clinic, Inc.'];
    expect(findWrongEmployer('At riverside clinic I welcomed patients.', labels, profile)).toBeUndefined();
  });

  it('accepts a sentence when any cited atom carries the name', () => {
    const labels = ['Skills: Tools', 'Project: Food Bank Tracker'];
    expect(findWrongEmployer('I built the Food Bank Tracker.', labels, profile)).toBeUndefined();
  });

  it('checks schools and projects too', () => {
    expect(findWrongEmployer('At Lakeview University I studied.', ['Project: Food Bank Tracker'], profile)).toBe(
      'Lakeview University',
    );
  });

  it('ignores names shorter than 4 characters and names not in the sentence', () => {
    expect(findWrongEmployer('I worked at AB all day.', ['Skills: X'], profile)).toBeUndefined();
    expect(findWrongEmployer('I welcomed patients.', ['Skills: X'], profile)).toBeUndefined();
  });

  it('never flags the company being applied to, even when the candidate worked there', () => {
    const labels = ['Experience: Scribe, St. Mary Hospital'];
    const sentence = 'I would value the role at Riverside Clinic.';
    expect(findWrongEmployer(sentence, labels, profile)).toBe('Riverside Clinic');
    expect(findWrongEmployer(sentence, labels, profile, 'Riverside Clinic, Inc.')).toBeUndefined();
    expect(findWrongEmployer('At St. Mary Hospital I charted.', ['Skills: X'], profile, 'Riverside Clinic')).toBe(
      'St. Mary Hospital',
    );
  });

  it('matches whole words only', () => {
    const p = { ...profile, experience: [{ company: 'Mercy', title: 't', current: false, bullets: [] }] };
    expect(findWrongEmployer('I showed mercyless courage.', [], p)).toBeUndefined();
  });
});

describe('findDuplicateSentences', () => {
  it('marks the later sentence when content words overlap by 0.6 or more', () => {
    const out = findDuplicateSentences([
      'I scheduled patient appointments at the front desk.',
      'I enjoy hiking.',
      'At the front desk I scheduled patient appointments.',
    ]);
    expect([...out]).toEqual([2]);
  });

  it('keeps sentences that share few words', () => {
    expect(
      findDuplicateSentences(['I scheduled patient appointments.', 'I translated forms for families.']).size,
    ).toBe(0);
  });

  it('compares a later sentence only with kept sentences and never marks the first', () => {
    const same = 'I tracked daily supply orders for the clinic.';
    expect([...findDuplicateSentences([same, same, same])]).toEqual([1, 2]);
  });

  it('does not treat two short different sentences as copies', () => {
    expect(findDuplicateSentences(['Thank you.', 'Thanks for reading.']).size).toBe(0);
  });
});

describe('cleanMetaPhrases', () => {
  it('removes a trailing meta clause', () => {
    expect(cleanMetaPhrases('I coordinated volunteers, as stated in my profile.')).toBe('I coordinated volunteers.');
  });

  it('removes a leading meta clause and capitalises what is left', () => {
    expect(cleanMetaPhrases('According to my resume, I coordinated volunteers.')).toBe('I coordinated volunteers.');
    expect(cleanMetaPhrases('As listed on my resume, I coordinated volunteers.')).toBe('I coordinated volunteers.');
  });

  it('drops a sentence that still mentions the profile after cleaning', () => {
    expect(cleanMetaPhrases('My profile shows steady growth in patient care.')).toBeNull();
  });

  it('drops a sentence that is only a stock opener', () => {
    expect(cleanMetaPhrases('I am excited to apply for the Scribe role at Acme.')).toBeNull();
  });

  it('strips a stock opener but keeps real content after it', () => {
    expect(cleanMetaPhrases('I am excited to apply, and I scheduled patient visits for two years.')).toBe(
      'I scheduled patient visits for two years.',
    );
  });

  it('drops the stock closer phrase', () => {
    expect(cleanMetaPhrases('I look forward to discussing how my experience can contribute to your team.')).toBeNull();
    expect(
      cleanMetaPhrases('Thank you for your time, I look forward to discussing how my background can help.'),
    ).toBe('Thank you for your time.');
  });

  it('leaves an ordinary sentence, even a short one, unchanged', () => {
    expect(cleanMetaPhrases('I assisted at the front desk.')).toBe('I assisted at the front desk.');
    expect(cleanMetaPhrases('Thank you.')).toBe('Thank you.');
  });
});
