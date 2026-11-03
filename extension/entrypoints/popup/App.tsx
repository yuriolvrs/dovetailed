// What this file is: the popup. It shows what is stored, refuses blocked sites, injects the fill script into all frames on click, and shows the merged result.
// In plain terms: the small window that opens from the toolbar. It fills the form on the page and tells you what it did.
import { useEffect, useState } from 'react';
import { Settings } from 'lucide-react';
import { Btn } from '../../../src/components/ui/primitives';
import { BrandHeader } from '../../src/components/BrandHeader';
import { getProfile } from '../../src/lib/data';
import { formatFieldReport, mergeResults } from '../../src/autofill/report';
import type { FrameResult, MergedResult, ResumeOutcome } from '../../src/autofill/report';
import { isBlockedSite } from '../../src/lib/blockedSites';
import type { ExtensionProfile } from '../../src/types/profile';

type TabInfo = { id?: number; url?: string };

// The one-line resume message. Says plainly that an attached file goes to the site at once.
function resumeMessage(r: ResumeOutcome): string | null {
  switch (r.status) {
    case 'attached':
      return `Resume attached: ${r.fileName}. The file goes to the site as soon as it attaches.`;
    case 'already':
      return 'Resume skipped: the form already holds a file.';
    case 'ambiguous':
      return `Resume not attached: more than one upload box looked like the resume field (${r.labels.join(', ')}).`;
    case 'skipped':
      return 'Resume not attached: you chose not to attach one.';
    case 'not-stored':
      return 'Resume not attached: no resume is stored. Add one on the options page.';
    default:
      return null;
  }
}

// The Resume row: the file name for one resume, a count for several.
function resumeSummary(resumes: ExtensionProfile['resumes']): string {
  return resumes.length === 0 ? 'None' : resumes.length === 1 ? resumes[0].fileName : `${resumes.length} resumes`;
}

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

  const note = 'text-sm leading-relaxed text-amber-800 dark:text-amber-300';
  return (
    <main className="w-80 space-y-5 bg-white p-4 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <header className="flex items-center justify-between gap-3">
        <BrandHeader />
        <Btn variant="ghost" size="sm" ariaLabel="Open options" onClick={() => browser.runtime.openOptionsPage()}>
          <Settings size={16} />
        </Btn>
      </header>
      <ul className="space-y-1.5 text-sm">
        <li className="flex justify-between gap-3">
          <span className="text-slate-600 dark:text-slate-400">Profile</span>
          <span>{profile ? (hasProfile ? 'Stored' : 'Not set up') : '...'}</span>
        </li>
        <li className="flex justify-between gap-3">
          <span className="text-slate-600 dark:text-slate-400">Resume</span>
          <span className="truncate">{profile ? resumeSummary(profile.resumes) : '...'}</span>
        </li>
      </ul>
      {busy && (profile?.resumes.length ?? 0) > 1 && (
        <p role="status" className="text-sm text-slate-700 dark:text-slate-300">
          If asked, pick a resume on the page.
        </p>
      )}
      {blocked && (
        <p role="status" className={note}>
          Autofill is off on Indeed and LinkedIn. Their terms may ban tools like this, and your account could be at risk.
        </p>
      )}
      {unknownSite && (
        <p role="status" className={note}>
          Autofill cannot run here because this page's address is not available.
        </p>
      )}
      <Btn
        className="w-full justify-center"
        onClick={fill}
        disabled={blocked || unknownSite || busy || tab?.id === undefined}
      >
        {busy ? 'Filling...' : 'Fill this page'}
      </Btn>
      {result && result.formFound && (
        <div role="status" className="space-y-3 text-sm text-slate-700 dark:text-slate-300">
          <p>Filled {result.filled} fields. Check the form, then submit it yourself.</p>
          {resumeMessage(result.resume) && <p>{resumeMessage(result.resume)}</p>}
          {result.requiredBlank.length > 0 && (
            <div className="space-y-1">
              <p className="font-medium text-slate-900 dark:text-slate-100">Not filled (required)</p>
              <ul className="list-disc space-y-0.5 pl-5">
                {result.requiredBlank.map((l) => (
                  <li key={l}>{l}</li>
                ))}
              </ul>
            </div>
          )}
          {result.incomplete.length > 0 && (
            <div className="space-y-1">
              <p className="font-medium text-slate-900 dark:text-slate-100">Could not complete</p>
              <ul className="list-disc space-y-0.5 pl-5">
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
        <div key={origin} className="space-y-2">
          <p role="status" className="text-sm text-slate-700 dark:text-slate-300">
            A form from {origin.replace('*://*.', '').replace('/*', '')} is embedded here and could not be reached.
          </p>
          <Btn size="sm" variant="secondary" onClick={() => void grant(origin)}>
            Allow access
          </Btn>
        </div>
      ))}
      {message && (
        <p role="status" className="text-sm text-slate-700 dark:text-slate-300">
          {message}
        </p>
      )}
      {frames.some((f) => f.fields.length > 0) && (
        <Btn size="sm" variant="ghost" className="-ml-3" onClick={() => void copyReport()}>
          Copy field report
        </Btn>
      )}
    </main>
  );
}
