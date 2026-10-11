// Tests for buildRunner: one build per posting, state shared with
// subscribers, and stop/retry. buildDocuments is mocked; no AI calls.
// In plain terms: checks a build keeps going and reports to whoever watches.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { JobPosting, Profile } from '../../types';
import { buildDocuments } from './buildDocuments';
import { getBuild, startBuild, stopBuild, subscribeBuild } from './buildRunner';

vi.mock('./buildDocuments', () => ({ buildDocuments: vi.fn() }));
const mockBuild = vi.mocked(buildDocuments);

const profile = {} as Profile;
let nextId = 0;
const posting = () => ({ id: `p${nextId++}`, createdAt: 0, rawText: 'x' }) as JobPosting;
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  mockBuild.mockReset();
});

describe('buildRunner', () => {
  it('reports steps and finishes', async () => {
    mockBuild.mockImplementation(async (p, _prof, opts) => {
      opts?.onProgress?.({ step: 'read' });
      opts?.onStepDone?.('read', p);
      return p as never;
    });
    const p = posting();
    const seen: string[] = [];
    subscribeBuild(p.id, (state) => seen.push(state.status));
    startBuild(p, profile);
    await flush();
    expect(getBuild(p.id)).toMatchObject({ status: 'done', doneSteps: ['read'] });
    expect(seen[0]).toBe('running');
  });

  it('does not start a second build while one is running', () => {
    mockBuild.mockReturnValue(new Promise(() => {}));
    const p = posting();
    startBuild(p, profile);
    startBuild(p, profile);
    expect(mockBuild).toHaveBeenCalledTimes(1);
  });

  it('marks a stopped build as stopped, not failed', async () => {
    mockBuild.mockImplementation(
      (_p, _prof, opts) =>
        new Promise((_resolve, reject) => opts?.signal?.addEventListener('abort', () => reject(new Error('aborted')))),
    );
    const p = posting();
    startBuild(p, profile);
    stopBuild(p.id);
    await flush();
    expect(getBuild(p.id)?.status).toBe('stopped');
  });

  it('keeps the error, and a retry keeps the same subscribers', async () => {
    const boom = new Error('boom');
    mockBuild.mockRejectedValueOnce(boom).mockResolvedValueOnce({} as never);
    const p = posting();
    const listener = vi.fn();
    subscribeBuild(p.id, listener);
    startBuild(p, profile);
    await flush();
    expect(getBuild(p.id)).toMatchObject({ status: 'error', error: boom });
    startBuild(p, profile);
    await flush();
    expect(listener).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'done' }));
  });
});
