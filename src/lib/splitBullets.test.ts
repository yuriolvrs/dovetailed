// What this file is: unit tests for splitBullets.
// In plain terms: checks that pasted lines turn into clean bullets.

import { describe, expect, it } from 'vitest';
import { splitBullets } from './splitBullets';

describe('splitBullets', () => {
  it('returns one bullet per non-blank line', () => {
    expect(splitBullets('Built a parser\n\nShipped billing\r\nCut latency')).toEqual([
      'Built a parser',
      'Shipped billing',
      'Cut latency',
    ]);
  });

  it('strips bullet marks and list numbers', () => {
    expect(splitBullets('• Built a parser\n- Shipped billing\n* Cut latency\n1. Led a team\n2) Wrote docs')).toEqual([
      'Built a parser',
      'Shipped billing',
      'Cut latency',
      'Led a team',
      'Wrote docs',
    ]);
  });

  it('keeps a number or dash that is part of the sentence', () => {
    expect(splitBullets('3-person team lead\n-5% churn')).toEqual(['3-person team lead', '-5% churn']);
  });

  it('returns an empty list for blank input', () => {
    expect(splitBullets('  \n \n')).toEqual([]);
  });
});
