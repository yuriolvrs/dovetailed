// What this file is: a minimal, dependency-free .ics (iCalendar) file
// builder for a single all-day event -- used to let the user add a job
// posting's application deadline to their calendar app. Hand-rolled rather
// than a library since the format needed (one VEVENT, no recurrence, no
// timezones) is a handful of lines of plain text.
// In plain terms: builds the little calendar-invite file your calendar app
// opens when you export an application deadline.

/** Escapes text per RFC 5545 §3.3.11 -- backslash, comma, semicolon, and newlines. */
function escapeIcsText(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;')
    .replace(/\n/g, '\\n');
}

/** Formats a Date as an all-day VALUE=DATE stamp: YYYYMMDD. */
function formatIcsDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}${m}${d}`;
}

/** Formats a Date as a UTC timestamp for DTSTAMP: YYYYMMDDTHHMMSSZ. */
function formatIcsTimestamp(date: Date): string {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

/**
 * Builds a single-event .ics calendar file for a job application deadline,
 * as an all-day event on the given date.
 * In plain terms: turns a deadline date + job title into a downloadable
 * calendar file.
 */
export function buildDeadlineIcs(params: { uid: string; deadline: number; title: string; description?: string }): string {
  const deadline = new Date(params.deadline);
  const now = new Date();
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Pimp My Resume//Application Deadline//EN',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${params.uid}`,
    `DTSTAMP:${formatIcsTimestamp(now)}`,
    `DTSTART;VALUE=DATE:${formatIcsDate(deadline)}`,
    `SUMMARY:${escapeIcsText(params.title)}`,
  ];
  if (params.description) lines.push(`DESCRIPTION:${escapeIcsText(params.description)}`);
  lines.push('END:VEVENT', 'END:VCALENDAR');
  // .ics requires CRLF line endings.
  return lines.join('\r\n') + '\r\n';
}
