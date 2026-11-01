// What this file is: the popup. It shows what is stored, refuses blocked sites, injects the fill script into all frames on click, and shows the merged result.
// In plain terms: the small window that opens from the toolbar. It fills the form on the page and tells you what it did.
import { useEffect, useState } from 'react';
import { Btn } from '../../../src/components/ui/primitives';
import { getProfile } from '../../src/lib/data';
import { formatFieldReport, mergeResults } from '../../src/autofill/report';
import type { FrameResult, MergedResult } from '../../src/autofill/report';
import { isBlockedSite } from '../../src/lib/blockedSites';
import type { ExtensionProfile } from '../../src/types/profile';

type TabInfo = { id?: number; url?: string };

export default function App() {
  const [profile, setProfile] = useState<ExtensionProfile | null>(null);
  const [tab, setTab] = useState<TabInfo | null>(null);
  const [message, setMessage] = useState('');
  const [result, setResult] = useState<MergedResult | null>(null);
  const [frames, setFrames] = useState<FrameResult[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getProfile().then(setProfile, () => setMessage('Could not read your stored data.'));
    browser.tabs.query({ active: true, currentWindow: true }).then(([t]) => setTab({ id: t?.id, url: t?.url }));
  }, []);

  // Fails closed: with no URL we cannot rule out a blocked site, so nothing runs.
  const blocked = tab?.url ? isBlockedSite(tab.url) : false;
  const unknownSite = tab !== null && !tab.url;
  const hasProfile = !!profile && (profile.firstName !== '' || profile.lastName !== '' || profile.email !== '');

  // Injects the fill script into every frame of the active tab and merges the answers.
  // In plain terms: the Fill button.
  async function fill() {
    if (tab?.id === undefined) return;
    setBusy(true);
    setMessage('');
    setResult(null);
    try {
      const injected = await browser.scripting.executeScript({
        target: { tabId: tab.id, allFrames: true },
        files: ['/fill.js'],
      });
      const got = injected.map((r) => r.result as FrameResult | undefined).filter((r): r is FrameResult => !!r);
      setFrames(got);
      const merged = mergeResults(got);
      setResult(merged);
      if (!merged.formFound && merged.unreachable.length === 0) {
        setMessage('No application form found. Open the application form first, then click Fill.');
      }
    } catch {
      setMessage('This page cannot be filled. Browser pages and extension store pages are closed to extensions.');
    } finally {
      setBusy(false);
    }
  }

  // Asks for access to a known job-board host. The user must click Fill again afterwards.
  async function grant(origin: string) {
    const ok = await browser.permissions.request({ origins: [origin] });
    setMessage(ok ? 'Access granted. Click Fill again.' : 'Access was not granted.');
    if (ok) setResult(null);
  }

  // Copies field types, classifications and labels. It holds no values.
  async function copyReport() {
    await navigator.clipboard.writeText(formatFieldReport(frames));
    setMessage('Field report copied.');
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
      {result && result.formFound && (
        <div role="status" className="space-y-1 text-xs text-slate-700 dark:text-slate-300">
          <p>Filled {result.filled} fields. Check the form, then submit it yourself.</p>
          {result.requiredBlank.length > 0 && (
            <div>
              <p className="font-medium">Not filled (required):</p>
              <ul className="list-disc pl-4">
                {result.requiredBlank.map((l) => (
                  <li key={l}>{l}</li>
                ))}
              </ul>
            </div>
          )}
          {result.incomplete.length > 0 && (
            <div>
              <p className="font-medium">Could not complete:</p>
              <ul className="list-disc pl-4">
                {result.incomplete.map((i, n) => (
                  <li key={n}>
                    {i.label} ({i.reason})
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
      {result?.unreachable.map((origin) => (
        <div key={origin} className="space-y-1">
          <p role="status" className="text-xs text-slate-700 dark:text-slate-300">
            A form from {origin.replace('*://*.', '').replace('/*', '')} is embedded here and could not be reached.
          </p>
          <Btn size="sm" variant="secondary" onClick={() => void grant(origin)}>
            Allow access
          </Btn>
        </div>
      ))}
      {frames.some((f) => f.fields.length > 0) && (
        <Btn size="sm" variant="secondary" onClick={() => void copyReport()}>
          Copy field report
        </Btn>
      )}
      {message && (
        <p role="status" className="text-xs text-slate-700 dark:text-slate-300">
          {message}
        </p>
      )}
    </main>
  );
}
