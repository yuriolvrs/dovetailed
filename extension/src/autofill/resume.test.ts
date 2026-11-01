// What this file is: tests for resume input choice, attaching, and the wait-then-fill order with a simulated site parser.
// In plain terms: checks the right upload box is picked on each sample form, and that fields the site's parser touches are overwritten with your values.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { fillPage } from './fill';
import { attachResume, findResumeInput } from './resume';
import type { ExtensionProfile } from '../types/profile';

// jsdom has no DataTransfer and no writable input.files, so both are replaced with simple stand-ins.
const store = new WeakMap<HTMLInputElement, File[]>();
beforeAll(() => {
  Object.defineProperty(HTMLInputElement.prototype, 'files', {
    configurable: true,
    get(this: HTMLInputElement) {
      return store.get(this) ?? [];
    },
    set(this: HTMLInputElement, v: File[]) {
      store.set(this, Array.from(v));
    },
  });
  (globalThis as unknown as { DataTransfer: unknown }).DataTransfer = class {
    files: File[] = [];
    items = { add: (f: File) => void this.files.push(f) };
  };
});

const fixture = (name: string) => readFileSync(join(process.cwd(), 'src/autofill/fixtures', `${name}.html`), 'utf8');
const byId = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const chosenId = (name: string) => {
  document.body.innerHTML = fixture(name);
  const c = findResumeInput(document);
  return c.status === 'chosen' ? c.input.id : c.status;
};

const profile: ExtensionProfile = {
  version: 1,
  firstName: 'Testa',
  lastName: 'Examplo',
  email: 'testa@example.invalid',
  phone: { countryCallingCode: '63', nationalNumber: '9171234567' },
  links: [],
  experience: [],
  education: [],
};
const pdf = () => new File([new Uint8Array([37, 80, 68, 70])], 'test-resume.pdf', { type: 'application/pdf' });

afterEach(() => {
  document.body.innerHTML = '';
});

describe('findResumeInput', () => {
  it('Teamtailor: Upload CV, not Additional files', () => expect(chosenId('teamtailor')).toBe('cv'));
  it('Ashby: Resume, not Cover Letter or the parser box', () => expect(chosenId('ashby')).toBe('resume_upload'));
  it('trellis: the hidden input', () => expect(chosenId('trellis')).toBe('resumeFile'));
  it('a form with no file input finds none', () => expect(chosenId('lever')).toBe('none'));

  it('SmartRecruiters-style: two identical dropzones in shadow roots are ambiguous', () => {
    for (const n of [1, 2]) {
      const host = document.createElement('div');
      document.body.append(host);
      host.attachShadow({ mode: 'open' }).innerHTML = `<label for="d${n}">Resume</label><input id="d${n}" type="file" />`;
    }
    const c = findResumeInput(document);
    expect(c.status).toBe('ambiguous');
  });

  it('rejects photo, cover letter and an image-only accept list', () => {
    document.body.innerHTML =
      '<label for="a">Profile photo</label><input id="a" type="file"/>' +
      '<label for="b">Cover letter</label><input id="b" type="file"/>' +
      '<label for="c">Resume</label><input id="c" type="file" accept="image/*"/>';
    expect(findResumeInput(document).status).toBe('none');
  });

  it('uses the section heading when the input has no label', () => {
    document.body.innerHTML = '<div><h3>Upload your CV</h3><input id="x" type="file"/></div><div><h3>Photo</h3><input id="y" type="file"/></div>';
    const c = findResumeInput(document);
    expect(c.status === 'chosen' && c.input.id).toBe('x');
  });
});

describe('attachResume', () => {
  it('sets the file and fires bubbling input and change events', () => {
    document.body.innerHTML = '<div id="w"><input id="f" type="file"/></div>';
    const seen: string[] = [];
    byId('w').addEventListener('input', () => seen.push('input'));
    byId('w').addEventListener('change', () => seen.push('change'));
    const input = byId<HTMLInputElement>('f');
    const f = pdf();
    attachResume(input, f);
    expect(input.files![0]).toBe(f);
    expect(seen).toEqual(['input', 'change']);
  });
});

describe('fillPage with a resume', () => {
  const fast = { stableMs: 250, maxStableMs: 4000 };

  it('attaches, waits for the parser to settle, then overwrites what the parser changed and keeps site values', async () => {
    document.body.innerHTML = fixture('teamtailor');
    const cv = byId<HTMLInputElement>('cv');
    byId<HTMLInputElement>('email').value = 'site@example.invalid'; // site prefill, parser leaves it alone
    byId<HTMLInputElement>('phone').value = 'old'; // site prefill that the parser will change
    const events: string[] = [];
    cv.addEventListener('change', () => {
      events.push('attach');
      setTimeout(() => {
        byId<HTMLInputElement>('first_name').value = 'PARSED'; // parser fills an empty field
        byId<HTMLInputElement>('phone').value = 'parsed-phone'; // parser changes a held value
      }, 60);
      setTimeout(() => (byId<HTMLInputElement>('last_name').value = 'ParsedLast'), 200); // parser settles late
    });
    const r = await fillPage(profile, document, { resume: { getFile: async () => pdf() }, ...fast });
    expect(events).toEqual(['attach']);
    expect(r.resume).toEqual({ status: 'attached', fileName: 'test-resume.pdf' });
    expect(cv.files![0].name).toBe('test-resume.pdf');
    expect(byId<HTMLInputElement>('first_name').value).toBe('Testa');
    expect(byId<HTMLInputElement>('last_name').value).toBe('Examplo');
    expect(byId<HTMLInputElement>('phone').value).toBe('+639171234567');
    expect(byId<HTMLInputElement>('email').value).toBe('site@example.invalid');
    expect(byId<HTMLInputElement>('extra').files).toHaveLength(0);
  });

  it('skips an input that already holds a file, and never asks for the resume', async () => {
    document.body.innerHTML = fixture('teamtailor');
    store.set(byId<HTMLInputElement>('cv'), [pdf()]);
    const getFile = vi.fn(async () => pdf());
    const r = await fillPage(profile, document, { resume: { getFile }, ...fast });
    expect(r.resume).toEqual({ status: 'already' });
    expect(getFile).not.toHaveBeenCalled();
  });

  it('reports not-stored when no resume is stored', async () => {
    document.body.innerHTML = fixture('teamtailor');
    const r = await fillPage(profile, document, { resume: { getFile: async () => null }, ...fast });
    expect(r.resume).toEqual({ status: 'not-stored' });
    expect(byId<HTMLInputElement>('cv').files).toHaveLength(0);
  });

  it('attaches nothing and does not fetch the resume when the choice is ambiguous', async () => {
    document.body.innerHTML = fixture('teamtailor');
    byId('extra').previousElementSibling!.textContent = 'Resume';
    byId('extra').id = 'extra2';
    byId('extra2').setAttribute('name', 'resume');
    document.querySelector('label[for="extra"]')?.setAttribute('for', 'extra2');
    const getFile = vi.fn(async () => pdf());
    const r = await fillPage(profile, document, { resume: { getFile }, ...fast });
    expect(r.resume.status).toBe('ambiguous');
    expect(getFile).not.toHaveBeenCalled();
  });

  it('reports not-found when the page has no file input', async () => {
    document.body.innerHTML = fixture('lever');
    const r = await fillPage(profile, document, { resume: { getFile: async () => pdf() }, ...fast });
    expect(r.resume).toEqual({ status: 'not-found' });
  });
});
