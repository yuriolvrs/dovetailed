// What this file is: the list of known job-board hosts that the extension may ask extra access for. The manifest and the popup both use it.
// In plain terms: the job sites the extension knows, so it can offer to reach forms embedded from them.

export const ATS_HOSTS = [
  'greenhouse.io',
  'lever.co',
  'ashbyhq.com',
  'workable.com',
  'smartrecruiters.com',
  'icims.com',
  'teamtailor.com',
  'myworkdayjobs.com',
] as const;

/** Match patterns for optional_host_permissions. */
export const ATS_ORIGINS: string[] = ATS_HOSTS.map((h) => `*://*.${h}/*`);

/** Returns the match pattern for a known job-board URL, or null. */
export function atsOriginFor(url: string): string | null {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
  const found = ATS_HOSTS.find((h) => host === h || host.endsWith(`.${h}`));
  return found ? `*://*.${found}/*` : null;
}
