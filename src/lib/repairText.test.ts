// What this file is: unit tests for repairText \u2014 the intact mojibake case,
// the lossy case where the invisible C1 code points were dropped, and the
// cases that must be left alone (plain ASCII, genuine accented words).
// In plain terms: tests that garbled quotes and dashes get fixed, and that
// correctly spelled foreign words do not get "fixed".

import { describe, expect, it } from 'vitest';
import { repairText } from './repairText';

// Builds the Latin-1 code points a UTF-8 character turns into when its bytes
// are read one by one, e.g. U+2019 -> three separate characters.
function misdecode(char: string): string {
  return [...new TextEncoder().encode(char)].map((b) => String.fromCharCode(b)).join('');
}

// The same damage after the invisible C1 code points (U+0080-U+009F) were
// dropped in transit, which is what the LLM responses in this app arrive as.
function stripC1(text: string): string {
  return text.replace(/[\u0080-\u009f]/g, '');
}

describe('repairText', () => {
  it('returns plain ASCII text untouched', () => {
    expect(repairText('cross-functional teams')).toBe('cross-functional teams');
  });

  it('restores an intact mis-decoded sequence', () => {
    expect(repairText(`cross${misdecode('\u2011')}functional`)).toBe('cross\u2011functional');
  });

  it('restores a character that kept its last byte after the C1 loss', () => {
    // A bullet (U+2022, bytes E2 80 A2) loses only the 0x80.
    expect(repairText(stripC1(`${misdecode('\u2022')} 2+ years`))).toBe('\u2022 2+ years');
  });

  it('reads a lost apostrophe from the possessive that follows it', () => {
    expect(repairText(stripC1(`McDonald${misdecode('\u2019')}s Philippines`))).toBe(
      'McDonald\u2019s Philippines',
    );
  });

  it('reads a lost apostrophe from a contraction', () => {
    expect(repairText(stripC1(`you${misdecode('\u2019')}ll learn`))).toBe('you\u2019ll learn');
  });

  it('reads a lost plural possessive before a space', () => {
    const damaged = stripC1(`McDonald${misdecode('\u2019')}s customers${misdecode('\u2019')} needs`);
    expect(repairText(damaged)).toBe('McDonald\u2019s customers\u2019 needs');
  });

  it('leaves a lone garbled character alone when nothing else vouches for it', () => {
    // On its own this could be a real accented word, so it is left as found.
    expect(repairText(stripC1(`customers${misdecode('\u2019')} needs`))).toBe(
      'customers\u00e2 needs',
    );
  });

  it('reads a lost hyphen joining two words', () => {
    const damaged = stripC1(
      `McDonald${misdecode('\u2019')}s cross${misdecode('\u2011')}functional e${misdecode('\u2011')}Commerce`,
    );
    expect(repairText(damaged)).toBe('McDonald\u2019s cross-functional e-Commerce');
  });

  it('reads a lost dash standing on its own between two words', () => {
    const damaged = stripC1(`Sambayan ${misdecode('\u2014')} Lasalyano, McDonald${misdecode('\u2019')}s`);
    expect(repairText(damaged)).toBe('Sambayan \u2014 Lasalyano, McDonald\u2019s');
  });

  it('leaves genuine accented words alone', () => {
    expect(repairText('caf\u00e9 in ch\u00e2teau country')).toBe('caf\u00e9 in ch\u00e2teau country');
  });

  it('restores an accented letter that went through the same damage', () => {
    // A real circumflex is one byte pair, so it survives the C1 loss intact
    // and decodes back exactly -- no guessing needed.
    const damaged = stripC1(`ch${misdecode('\u00e2')}teau ${misdecode('\u2022')} tour`);
    expect(repairText(damaged)).toBe('ch\u00e2teau \u2022 tour');
  });
});
