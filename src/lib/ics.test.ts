import { describe, expect, it } from 'vitest';
import { buildDeadlineIcs } from './ics';

describe('buildDeadlineIcs', () => {
  it('builds a well-formed single-event VCALENDAR', () => {
    const ics = buildDeadlineIcs({
      uid: 'abc-123',
      deadline: new Date(2026, 8, 15).getTime(),
      title: 'Apply: Senior Engineer at Acme',
    });
    expect(ics).toContain('BEGIN:VCALENDAR');
    expect(ics).toContain('BEGIN:VEVENT');
    expect(ics).toContain('UID:abc-123');
    expect(ics).toContain('DTSTART;VALUE=DATE:20260915');
    expect(ics).toContain('SUMMARY:Apply: Senior Engineer at Acme');
    expect(ics).toContain('END:VEVENT');
    expect(ics).toContain('END:VCALENDAR');
  });

  it('uses CRLF line endings', () => {
    const ics = buildDeadlineIcs({ uid: 'x', deadline: Date.now(), title: 'Test' });
    expect(ics.includes('\r\n')).toBe(true);
    expect(ics.split('\n').every((line) => line === '' || line.endsWith('\r'))).toBe(true);
  });

  it('escapes commas, semicolons, and newlines in text fields', () => {
    const ics = buildDeadlineIcs({
      uid: 'x',
      deadline: Date.now(),
      title: 'Role, Team; Group',
      description: 'Line one\nLine two',
    });
    expect(ics).toContain('SUMMARY:Role\\, Team\\; Group');
    expect(ics).toContain('DESCRIPTION:Line one\\nLine two');
  });

  it('omits DESCRIPTION when none is given', () => {
    const ics = buildDeadlineIcs({ uid: 'x', deadline: Date.now(), title: 'Test' });
    expect(ics).not.toContain('DESCRIPTION');
  });
});
