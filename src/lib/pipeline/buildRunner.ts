// What this file is: keeps document builds running outside any one screen.
// Each posting has at most one build in flight; screens subscribe to its
// state and can leave without stopping it. State lives in memory only, so a
// build lasts as long as the tab does (finished steps are saved as they land,
// so a reload resumes from there).
// In plain terms: lets a build carry on while you look at other pages.

import type { JobPosting, Profile } from '../../types';
import { buildDocuments, type PipelineProgress, type PipelineStep } from './buildDocuments';

export interface BuildState {
  status: 'running' | 'error' | 'stopped' | 'done';
  progress: PipelineProgress | null;
  doneSteps: PipelineStep[];
  /** The thrown error when status is 'error'; screens turn it into words. */
  error: unknown;
}

interface Run {
  state: BuildState;
  controller: AbortController;
  listeners: Set<(state: BuildState) => void>;
}

const runs = new Map<string, Run>();

/**
 * Replaces a run's state and tells every subscriber.
 * In plain terms: updates a build's status and lets the screens know.
 */
function update(run: Run, patch: Partial<BuildState>) {
  run.state = { ...run.state, ...patch };
  run.listeners.forEach((listener) => listener(run.state));
}

/** The current state of a posting's build, if one has been started this session. */
export function getBuild(postingId: string): BuildState | undefined {
  return runs.get(postingId)?.state;
}

/**
 * Starts building documents for a posting, unless a build for it is already
 * running. Subscribers carry over to the new run, so a retry from the same
 * screen keeps updating it.
 * In plain terms: starts the build, or leaves the one already going alone.
 */
export function startBuild(posting: JobPosting, profile: Profile): void {
  const existing = runs.get(posting.id);
  if (existing?.state.status === 'running') return;
  const run: Run = {
    state: { status: 'running', progress: null, doneSteps: [], error: null },
    controller: new AbortController(),
    listeners: existing?.listeners ?? new Set(),
  };
  runs.set(posting.id, run);
  update(run, {});
  buildDocuments(posting, profile, {
    signal: run.controller.signal,
    onProgress: (progress) => update(run, { progress }),
    onStepDone: (step) => update(run, { doneSteps: [...run.state.doneSteps, step] }),
  }).then(
    () => update(run, { status: 'done' }),
    (error) =>
      update(run, run.controller.signal.aborted ? { status: 'stopped' } : { status: 'error', error }),
  );
}

/** Stops a posting's running build. Finished steps stay saved. */
export function stopBuild(postingId: string): void {
  runs.get(postingId)?.controller.abort();
}

/**
 * Calls `listener` whenever a posting's build changes. Returns the
 * unsubscribe function. Works before the build has started.
 * In plain terms: lets a screen watch a build.
 */
export function subscribeBuild(postingId: string, listener: (state: BuildState) => void): () => void {
  let run = runs.get(postingId);
  if (!run) {
    // A placeholder that startBuild will pick the listeners up from.
    run = {
      state: { status: 'stopped', progress: null, doneSteps: [], error: null },
      controller: new AbortController(),
      listeners: new Set(),
    };
    runs.set(postingId, run);
  }
  const listeners = run.listeners;
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
