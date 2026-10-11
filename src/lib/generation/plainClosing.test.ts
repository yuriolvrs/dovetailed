// What this file is: unit tests for isPlainClosing, the check that keeps a
// claim-free cover letter closing from being flagged as "not traceable".
// In plain terms: proves a plain thank-you passes, and a closing that slips
// in a tool, employer or number is still flagged.

import { describe, expect, it } from 'vitest';
import { isPlainClosing } from './plainClosing';

const context = [
  'Backend Engineer - Northwind Freight (Austin, TX, Hybrid)',
  'Northwind Freight is hiring a Backend Engineer to build our shipment tracking platform.',
  'Backend Engineer',
  'Northwind Freight',
  'Alex Rivera',
].join('\n');

describe('isPlainClosing', () => {
  it('passes the closing from a real generated letter', () => {
    const closing =
      'Thank you for reviewing my application. I look forward to discussing how my experience aligns with Northwind Freight’s goals.';
    expect(isPlainClosing(closing, context)).toBe(true);
  });

  it('passes a closing that names the role from the posting', () => {
    expect(isPlainClosing('Thank you for your time. I would welcome the chance to discuss the Backend Engineer role.', context)).toBe(true);
  });

  it('flags a closing that names a tool not in the posting', () => {
    expect(isPlainClosing('Thank you for your time. My Kubernetes work would help your team.', context)).toBe(false);
  });

  it('flags a closing that adds a number', () => {
    expect(isPlainClosing('Thank you. I bring 8 years of experience to this role.', context)).toBe(false);
  });

  it('flags a closing that names an employer not in the posting', () => {
    expect(isPlainClosing('Thank you. My time at Brightline Logistics prepared me well.', context)).toBe(false);
  });
});
