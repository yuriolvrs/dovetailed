// What this file is: the "Copy from Dovetailed" section. One button reads the Dovetailed profile from this browser, shows a notice if it would overwrite values, and updates the form.
// In plain terms: the part of the options page that copies your details over from the Dovetailed app.
import { useRef, useState } from 'react';
import { Btn } from '../../../src/components/ui/primitives';
import {
  changedCount,
  conflicts,
  DovetailedAccessError,
  mergeDovetailed,
  readDovetailedProfile,
  toExtensionFields,
  type DovetailedFields,
} from '../lib/dovetailedLink';
import type { ExtensionProfile } from '../types/profile';
import { SettingsSection } from './SettingsSection';

type State =
  | { kind: 'idle' }
  | { kind: 'working' }
  | { kind: 'confirm'; incoming: DovetailedFields; labels: string[] }
  | { kind: 'done'; message: string }
  | { kind: 'error'; message: string };

export function DovetailedSection({
  profile,
  onProfile,
}: {
  profile: ExtensionProfile;
  onProfile: (profile: ExtensionProfile) => void;
}) {
  const [state, setState] = useState<State>({ kind: 'idle' });
  // The latest profile, so edits made while the tab loads are not lost.
  const latest = useRef(profile);
  latest.current = profile;

  // Applies the copy to the form. Nothing is saved: the user still clicks Save.
  // In plain terms: puts the copied values in the form and says how many changed.
  function apply(incoming: DovetailedFields, mode: 'fillEmpty' | 'replace') {
    const next = mergeDovetailed(latest.current, incoming, mode);
    const changed = changedCount(latest.current, next);
    onProfile(next);
    setState({
      kind: 'done',
      message: changed
        ? `Changed ${changed} ${changed === 1 ? 'field' : 'fields'}. Check them, then Save.`
        : 'Nothing changed. Your form already matches.',
    });
  }

  // Runs from the click, so the permission request keeps the user gesture.
  // In plain terms: reads the Dovetailed profile, then copies it or asks first.
  function copy() {
    setState({ kind: 'working' });
    void (async () => {
      try {
        const row = await readDovetailedProfile();
        if (!row) {
          setState({ kind: 'error', message: 'No Dovetailed profile in this browser.' });
          return;
        }
        const incoming = toExtensionFields(row);
        const labels = conflicts(latest.current, incoming);
        if (labels.length) setState({ kind: 'confirm', incoming, labels });
        else apply(incoming, 'replace');
      } catch (e) {
        setState({
          kind: 'error',
          message:
            e instanceof DovetailedAccessError
              ? 'Access to Dovetailed was refused. Nothing was read.'
              : 'Could not read your Dovetailed profile.',
        });
      }
    })();
  }

  return (
    <SettingsSection
      title="Copy from Dovetailed"
      hint="Copies your Dovetailed profile from this browser. Nothing leaves your device."
    >
      {state.kind === 'confirm' ? (
        <div role="group" aria-label="Replace existing values">
          <p className="text-sm text-slate-700 dark:text-slate-300">This would replace: {state.labels.join(', ')}.</p>
          <div className="mt-3 flex gap-2">
            <Btn size="sm" onClick={() => apply(state.incoming, 'replace')}>
              Replace
            </Btn>
            <Btn variant="secondary" size="sm" onClick={() => apply(state.incoming, 'fillEmpty')}>
              Fill empty only
            </Btn>
          </div>
        </div>
      ) : (
        <Btn variant="secondary" size="sm" disabled={state.kind === 'working'} onClick={copy}>
          Copy from Dovetailed
        </Btn>
      )}
      {(state.kind === 'done' || state.kind === 'error') && (
        <p
          role={state.kind === 'error' ? 'alert' : 'status'}
          className={`mt-2 text-sm ${state.kind === 'error' ? 'text-red-700 dark:text-red-400' : 'text-slate-600 dark:text-slate-400'}`}
        >
          {state.message}
        </p>
      )}
    </SettingsSection>
  );
}
