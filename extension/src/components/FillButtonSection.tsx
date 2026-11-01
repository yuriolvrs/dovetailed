// What this file is: the options section that turns the in-page Fill button on or off. Turning it on asks the browser for access to all sites.
// In plain terms: a switch for the small button that can appear inside application forms. It is off until you turn it on.
import { useEffect, useState } from 'react';
import Logo from '../../../src/components/ui/Logo';
import { fieldLabelClass } from '../../../src/components/ui/primitives';
import { getSettings, saveSettings } from '../lib/data';
import { disableHint, enableHint } from '../lib/hintScript';
import { SettingsSection } from './SettingsSection';

const BROWSER = import.meta.env.FIREFOX ? 'Firefox' : 'Chrome';

export function FillButtonSection() {
  const [on, setOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    getSettings().then((s) => setOn(s.showFillButton), () => setMessage('Could not load this setting.'));
  }, []);

  // The permission request starts inside the click, as the browser requires.
  // In plain terms: flips the switch, and asks for access first when turning it on.
  function toggle(next: boolean) {
    setBusy(true);
    setMessage('');
    const work = next ? enableHint() : disableHint().then(() => true);
    void work
      .then(async (done) => {
        if (!done) {
          setMessage('Access was not given, so the button stays off.');
          return;
        }
        await saveSettings({ showFillButton: next });
        setOn(next);
      })
      .catch(() => setMessage('Could not change this setting.'))
      .finally(() => setBusy(false));
  }

  return (
    <SettingsSection
      title="Show Fill button on application forms"
      hint={`Off by default. When on, ${BROWSER} will ask for access to all sites. The button reads nothing until you press it.`}
    >
      <label className="flex items-center gap-2 text-sm text-slate-900 dark:text-slate-100">
        <input
          type="checkbox"
          className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-2 focus:ring-slate-400 dark:border-slate-600"
          checked={on}
          disabled={busy}
          onChange={(e) => toggle(e.target.checked)}
        />
        Show the button
      </label>
      <p className={`${fieldLabelClass} mt-6`}>Preview</p>
      <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">This appears when you click into a field on an application form.</p>
      {/* A sample of the button above a field. It is not a working control. */}
      <div aria-hidden="true" className="mt-3 max-w-sm select-none rounded-xl border border-dashed border-slate-300 p-4 dark:border-slate-600">
        <div className="flex justify-end pb-1.5">
          <span className="flex items-center gap-1.5 rounded-lg bg-slate-900 py-1.5 pl-2 pr-3 text-[13px] font-medium text-white dark:ring-1 dark:ring-white/60">
            <Logo size={16} />
            Fill form
          </span>
        </div>
        <div className="rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-500 dark:border-slate-600 dark:text-slate-400">
          First name
        </div>
      </div>
      {message && (
        <p role="alert" className="mt-2 text-sm text-red-700 dark:text-red-400">
          {message}
        </p>
      )}
    </SettingsSection>
  );
}
