// What this file is: tests for isBlockedSite.
// In plain terms: checks that Indeed and LinkedIn pages are blocked and look-alike hosts are not.
import { describe, expect, it } from 'vitest';
import { isBlockedSite } from './blockedSites';

describe('isBlockedSite', () => {
  it.each([
    'https://indeed.com/jobs',
    'https://www.indeed.com/',
    'https://ph.indeed.com/viewjob?jk=1',
    'https://smartapply.indeed.com/beta/indeedapply/form',
    'https://indeed.co.uk/',
    'https://uk.indeed.co.uk/',
    'https://www.indeed.com.ph/',
    'https://linkedin.com/jobs',
    'https://www.linkedin.com/jobs/view/1',
    'https://ph.linkedin.com/',
    'https://WWW.LinkedIn.com/',
  ])('blocks %s', (url) => {
    expect(isBlockedSite(url)).toBe(true);
  });

  it.each([
    'https://notindeed.com/',
    'https://indeed.example.com/',
    'https://example.com/?u=indeed.com',
    'https://boards.greenhouse.io/acme',
    'https://linkedin-fake.com/',
    'https://mylinkedin.com/',
    'chrome://extensions',
    'not a url',
  ])('allows %s', (url) => {
    expect(isBlockedSite(url)).toBe(false);
  });
});
