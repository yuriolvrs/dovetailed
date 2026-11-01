// What this file is: the options section that turns the in-page Fill button on or off. Turning it on asks the browser for access to all sites.
// In plain terms: a switch for the small button that can appear inside application forms. It is off until you turn it on.
import { useEffect, useState } from 'react';
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
      {message && (
        <p role="alert" className="mt-2 text-sm text-red-700 dark:text-red-400">
          {message}
        </p>
      )}
    </SettingsSection>
  );
}
