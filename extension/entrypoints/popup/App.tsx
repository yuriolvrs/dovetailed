// What this file is: the popup. It shows what is stored, refuses blocked sites, and injects the scan script on click.
// In plain terms: the small window that opens from the toolbar. For now it only counts the fields on the page.
import { useEffect, useState } from 'react';
import { Btn } from '../../../src/components/ui/primitives';
import { getProfile } from '../../src/lib/data';
import { isBlockedSite } from '../../src/lib/blockedSites';
import type { ExtensionProfile } from '../../src/types/profile';

type TabInfo = { id?: number; url?: string };

export default function App() {
  const [profile, setProfile] = useState<ExtensionProfile | null>(null);
  const [tab, setTab] = useState<TabInfo | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getProfile().then(setProfile, () => setMessage('Could not read your stored data.'));
    browser.tabs.query({ active: true, currentWindow: true }).then(([t]) => setTab({ id: t?.id, url: t?.url }));
  }, []);

  // Fails closed: with no URL we cannot rule out a blocked site, so nothing runs.
  const blocked = tab?.url ? isBlockedSite(tab.url) : false;
  const unknownSite = tab !== null && !tab.url;
  const hasProfile = !!profile && (profile.firstName !== '' || profile.lastName !== '' || profile.email !== '');

  // Injects the scan script into the active tab and reports the count.
  // In plain terms: runs the field counter on the page you are looking at.
  async function fill() {
    if (tab?.id === undefined) return;
    setBusy(true);
    setMessage('');
    try {
      const [first] = await browser.scripting.executeScript({ target: { tabId: tab.id }, files: ['/scan.js'] });
      const n = first?.result;
      setMessage(
        typeof n === 'number'
          ? `Found ${n} fields. Filling arrives in the next phase.`
          : 'The scan returned no result. Open the application form first.',
      );
    } catch {
      setMessage('This page cannot be scanned. Browser pages and extension store pages are closed to extensions.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="w-72 space-y-3 bg-white p-4 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <h1 className="text-sm font-semibold">Dovetailed Autofill</h1>
      <ul className="text-xs text-slate-600 dark:text-slate-400">
        <li>Profile: {profile ? (hasProfile ? 'stored' : 'not set up') : '...'}</li>
        <li>Resume: {profile ? (profile.resume ? profile.resume.fileName : 'none') : '...'}</li>
      </ul>
      <Btn variant="secondary" size="sm" onClick={() => browser.runtime.openOptionsPage()}>
        Open options
      </Btn>
      {blocked ? (
        <p role="status" className="text-xs text-amber-700 dark:text-amber-400">
          Autofill is off on Indeed and LinkedIn. Their terms may ban tools like this, and your account could be at risk.
        </p>
      ) : null}
      {unknownSite ? (
        <p role="status" className="text-xs text-amber-700 dark:text-amber-400">
          Autofill cannot run here because this page's address is not available.
        </p>
      ) : null}
      <Btn onClick={fill} disabled={blocked || unknownSite || busy || tab?.id === undefined}>
        Fill this page
      </Btn>
      {message && (
        <p role="status" className="text-xs text-slate-700 dark:text-slate-300">
          {message}
        </p>
      )}
    </main>
  );
}
