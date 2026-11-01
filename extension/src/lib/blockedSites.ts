// What this file is: the check for sites where the extension must not fill (indeed.com, linkedin.com and any subdomain or country domain).
// In plain terms: tells the popup when it is on a site that may ban autofill tools.

const BLOCKED_BRANDS = ['indeed', 'linkedin'];

/**
 * True when the URL host is a blocked brand site: the brand as a whole label,
 * followed by a public suffix (indeed.com, ph.indeed.com, indeed.co.uk).
 * "notindeed.com" does not match, and neither does "indeed.example.com".
 * In plain terms: is this page on Indeed or LinkedIn?
 */
export function isBlockedSite(url: string): boolean {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return false;
  }
  const labels = host.split('.');
  return BLOCKED_BRANDS.some((brand) => {
    const i = labels.indexOf(brand);
    if (i < 0) return false;
    // After the brand only a public suffix may follow: "com", "co.uk", "com.ph".
    const rest = labels.slice(i + 1);
    return rest.length >= 1 && rest.length <= 2 && (rest.length === 1 || /^(co|com|org|net|gov|edu|ac)$/.test(rest[0]));
  });
}
