// What this file is: tests for how the fill run picks a resume: none, one, or several stored.
// In plain terms: checks that one resume attaches silently, several ask you first, and a "no" skips.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ResumeFileRef } from '../types/profile';

const listResumes = vi.fn();
const getResume = vi.fn();
const chooseResume = vi.fn();
vi.mock('../lib/data', () => ({
  getProfile: vi.fn(),
  getResume: (...a: unknown[]) => getResume(...a),
  listResumes: (...a: unknown[]) => listResumes(...a),
}));
vi.mock('./resumeChooser', () => ({ chooseResume: (...a: unknown[]) => chooseResume(...a) }));

import { getResumeFile } from './runFill';

const ref = (id: string): ResumeFileRef => ({
  id, fileName: `${id}.pdf`, mimeType: 'application/pdf', sizeBytes: 1, updatedAt: 1, storage: 'local',
});
const input = document.createElement('input');

beforeEach(() => {
  listResumes.mockReset();
  getResume.mockReset();
  chooseResume.mockReset();
  getResume.mockImplementation(async (id: string) => new File(['x'], `${id}.pdf`));
});

describe('getResumeFile', () => {
  it('returns null with no resume stored, and asks nothing', async () => {
    listResumes.mockResolvedValue([]);
    expect(await getResumeFile(input)).toBeNull();
    expect(chooseResume).not.toHaveBeenCalled();
    expect(getResume).not.toHaveBeenCalled();
  });

  it('returns the one stored file without asking', async () => {
    listResumes.mockResolvedValue([ref('a')]);
    expect(((await getResumeFile(input)) as File).name).toBe('a.pdf');
    expect(chooseResume).not.toHaveBeenCalled();
  });

  it('asks with the input as anchor, then fetches only the chosen file', async () => {
    listResumes.mockResolvedValue([ref('a'), ref('b')]);
    chooseResume.mockResolvedValue('b');
    expect(((await getResumeFile(input)) as File).name).toBe('b.pdf');
    expect(chooseResume).toHaveBeenCalledWith([ref('a'), ref('b')], input);
    expect(getResume).toHaveBeenCalledTimes(1);
    expect(getResume).toHaveBeenCalledWith('b');
  });

  it('returns skipped for the no choice and fetches no file', async () => {
    listResumes.mockResolvedValue([ref('a'), ref('b')]);
    chooseResume.mockResolvedValue(null);
    expect(await getResumeFile(input)).toBe('skipped');
    expect(getResume).not.toHaveBeenCalled();
  });
});
