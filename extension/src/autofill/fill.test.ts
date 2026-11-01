// What this file is: tests for filling, in jsdom. They cover the native setter with a React-style value tracker, keep-non-empty, phone, selects, comboboxes, fixtures, the no-submit rule and the report.
// In plain terms: checks that the filler writes the right values, leaves existing content alone, never submits, and never leaks values into reports.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fillPage, setNativeValue } from './fill';
import { formatFieldReport, mergeResults } from './report';
import type { FrameResult } from './report';
import type { ExtensionProfile } from '../types/profile';

const profile: ExtensionProfile = {
  version: 1,
  firstName: 'Testa',
  lastName: 'Examplo',
  email: 'testa@example.invalid',
  phone: { countryCallingCode: '63', nationalNumber: '9171234567' },
  address: { city: 'Manila', stateProvince: 'Metro Manila', countryCode: 'PH', postalCode: '1000' },
  links: [
    { label: 'LinkedIn', url: 'https://www.linkedin.com/in/testa-example' },
    { label: 'GitHub', url: 'https://github.com/testa-example' },
    { label: 'Portfolio', url: 'https://testa.example.invalid' },
  ],
  experience: [{ company: 'Example Co', title: 'Tester', current: true, bullets: [] }],
  education: [],
  expectedSalary: '1000 fake',
  noticePeriod: '30 days',
};

const fixture = (name: string) => readFileSync(join(process.cwd(), 'src/autofill/fixtures', `${name}.html`), 'utf8');
const byId = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const named = (n: string) => document.querySelector<HTMLInputElement>(`[name="${n}"]`)!;

afterEach(() => {
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('setNativeValue', () => {
  it('bypasses a React-style value tracker so the framework sees a change', () => {
    document.body.innerHTML = '<input id="a" />';
    const input = byId<HTMLInputElement>('a');
    // React-style tracker: an own `value` property that records the last value it saw.
    const proto = Object.getPrototypeOf(input);
    const nativeSet = Object.getOwnPropertyDescriptor(proto, 'value')!;
    let tracked = '';
    Object.defineProperty(input, 'value', {
      configurable: true,
      get: () => nativeSet.get!.call(input),
      set: (v: string) => {
        tracked = v;
        nativeSet.set!.call(input, v);
      },
    });
    let reactSawChange = false;
    input.addEventListener('input', () => {
      reactSawChange = nativeSet.get!.call(input) !== tracked;
    });
    setNativeValue(input, 'hello');
    expect(reactSawChange).toBe(true);
    expect(nativeSet.get!.call(input)).toBe('hello');
  });

  it('fires bubbling input and change events', () => {
    document.body.innerHTML = '<div id="w"><input id="a" /></div>';
    const seen: string[] = [];
    byId('w').addEventListener('input', () => seen.push('input'));
    byId('w').addEventListener('change', () => seen.push('change'));
    setNativeValue(byId<HTMLInputElement>('a'), 'x');
    expect(seen).toEqual(['input', 'change']);
  });
});

describe('fillPage', () => {
  it('fills a Teamtailor-style form, leaves the sign-in box and consents alone, and lists required blanks', async () => {
    document.body.innerHTML = fixture('teamtailor');
    const r = await fillPage(profile);
    expect(byId<HTMLInputElement>('first_name').value).toBe('Testa');
    expect(byId<HTMLInputElement>('email').value).toBe('testa@example.invalid');
    expect(byId<HTMLInputElement>('phone').value).toBe('+639171234567');
    expect(byId<HTMLInputElement>('q_salary').value).toBe('1000 fake');
    expect(byId<HTMLInputElement>('q_notice').value).toBe('30 days');
    expect(byId<HTMLInputElement>('full_email').value).toBe('');
    expect(byId<HTMLInputElement>('consent').checked).toBe(false);
    expect(r.filled).toBe(6);
    expect(r.requiredBlank).toEqual(['Are you allowed to work in the EU?', 'I agree to the privacy policy']);
  });

  it('keeps non-empty fields', async () => {
    document.body.innerHTML = fixture('lever');
    named('name').value = 'Prefilled Name';
    await fillPage(profile);
    expect(named('name').value).toBe('Prefilled Name');
    expect(named('email').value).toBe('testa@example.invalid');
    expect(named('urls[LinkedIn]').value).toBe('https://www.linkedin.com/in/testa-example');
    expect(named('urls[GitHub]').value).toBe('https://github.com/testa-example');
    expect(named('urls[Portfolio]').value).toBe('https://testa.example.invalid');
    expect(named('org').value).toBe('Example Co');
    expect(named('location').value).toBe('Manila, Metro Manila, Philippines');
    expect(named('referrer').value).toBe('');
  });

  it('writes only the national number when a calling-code select exists, and sets the code', async () => {
    document.body.innerHTML = fixture('trellis');
    const sel = document.querySelector<HTMLSelectElement>('[name=phoneCode]')!;
    sel.value = '1';
    await fillPage(profile);
    expect(sel.value).toBe('63');
    expect(named('phoneNumber').value).toBe('9171234567');
    expect(named('newsletter').value).toBe('');
    expect(named('linkUrl').value).toBe('https://www.linkedin.com/in/testa-example');
    expect(named('linkType').value).toBe('LinkedIn');
  });


  // Test page helper: the trellis fixture with an Add Link button that clones the row, as the real form does.
  function trellisWithAdd(extraRows = 0) {
    document.body.innerHTML = fixture('trellis');
    const container = document.querySelector('.ja-links')!;
    const first = container.querySelector('.ja-link-row') as HTMLElement;
    const addRow = () => {
      const row = first.cloneNode(true) as HTMLElement;
      row.querySelectorAll('input').forEach((i) => (i.value = ''));
      container.insertBefore(row, container.querySelector('button'));
      wire(row);
    };
    const wire = (row: HTMLElement) => {
      const sel = row.querySelector('select')!;
      const name = row.querySelector<HTMLInputElement>('[name=linkName]')!;
      sel.addEventListener('change', () => (name.style.display = sel.value === 'Other' ? '' : 'none'));
    };
    wire(first);
    for (let i = 0; i < extraRows; i++) addRow();
    container.querySelector('button')!.addEventListener('click', addRow);
    const rows = () => Array.from(container.querySelectorAll<HTMLElement>('.ja-link-row'));
    return { rows, container };
  }
  const rowState = (row: HTMLElement) => [
    row.querySelector('select')!.value,
    row.querySelector<HTMLInputElement>('[name=linkUrl]')!.value,
    row.querySelector<HTMLInputElement>('[name=linkName]')!.value,
  ];

  it('fills three links into three rows by clicking Add Link', async () => {
    const { rows } = trellisWithAdd();
    await fillPage(profile);
    expect(rows().map(rowState)).toEqual([
      ['LinkedIn', 'https://www.linkedin.com/in/testa-example', ''],
      ['Github', 'https://github.com/testa-example', ''],
      ['Portfolio', 'https://testa.example.invalid', ''],
    ]);
  });

  it('uses Other with the link label for a link of no known type', async () => {
    const { rows } = trellisWithAdd();
    await fillPage({ ...profile, links: [{ label: 'Twitter', url: 'https://x.com/testa_example' }] });
    expect(rows().map(rowState)).toEqual([['Other', 'https://x.com/testa_example', 'Twitter']]);
  });

  it('keeps a row that already has a URL, and does not repeat a link that is already there', async () => {
    const { rows } = trellisWithAdd(1);
    const [r1] = rows();
    r1.querySelector<HTMLInputElement>('[name=linkUrl]')!.value = 'https://www.linkedin.com/in/testa-example';
    r1.querySelector('select')!.value = 'Other';
    await fillPage({ ...profile, links: profile.links.slice(0, 2) });
    expect(rows()).toHaveLength(2);
    expect(rowState(rows()[0])).toEqual(['Other', 'https://www.linkedin.com/in/testa-example', '']);
    expect(rowState(rows()[1])).toEqual(['Github', 'https://github.com/testa-example', '']);
  });

  it('stops at six links', async () => {
    const { rows } = trellisWithAdd();
    const many = Array.from({ length: 9 }, (_, i) => ({ label: `L${i}`, url: `https://example.invalid/${i}` }));
    await fillPage({ ...profile, links: many });
    expect(rows()).toHaveLength(6);
  });

  it('refuses an Add button of type submit, or with no type', async () => {
    for (const html of ['<button type="submit">Add Link</button>', '<button>Add Link</button>', '<button type="button">Save draft</button>']) {
      document.body.innerHTML = fixture('trellis').replace('<button type="button">Add Link</button>', html);
      const clicks = vi.fn();
      document.querySelectorAll('.ja-links button').forEach((b) => b.addEventListener('click', clicks));
      const r = await fillPage(profile);
      expect(clicks).not.toHaveBeenCalled();
      expect(document.querySelectorAll('.ja-link-row')).toHaveLength(1);
      expect(named('linkUrl').value).toBe('https://www.linkedin.com/in/testa-example');
      expect(r.incomplete.length).toBeGreaterThan(0);
    }
  });

  it('fills nothing on a page with only a lone email box or a sign-in form', async () => {
    document.body.innerHTML = '<div><input type="email" id="n" placeholder="Your email" /></div>';
    expect((await fillPage(profile)).formFound).toBe(false);
    expect(byId<HTMLInputElement>('n').value).toBe('');
    document.body.innerHTML = '<form><label>Email<input id="e" type="email"/></label><label>Password<input id="p" type="password"/></label></form>';
    const r = await fillPage(profile);
    expect(r.formFound).toBe(false);
    expect(byId<HTMLInputElement>('e').value).toBe('');
    expect(byId<HTMLInputElement>('p').value).toBe('');
  });

  it('reports a select with no close option and leaves it', async () => {
    document.body.innerHTML =
      '<form><label>First name<input /></label><label>Email<input type="email" /></label><label>Last name<input /></label>' +
      '<label>Country<select><option value="">Select</option><option value="fr">France</option></select></label></form>';
    const r = await fillPage(profile);
    expect(document.querySelector('select')!.value).toBe('');
    expect(r.incomplete).toEqual([{ label: 'Country', reason: 'no close option' }]);
  });

  it('picks a country select by name and a notice-period radio by text', async () => {
    document.body.innerHTML =
      '<form><label>First name<input /></label><label>Email<input type="email" /></label><label>Last name<input /></label>' +
      '<label>Country<select><option value="">Select</option><option value="PH">\u{1F1F5}\u{1F1ED} Philippines</option></select></label>' +
      '<fieldset><legend>Notice period</legend><label><input type="radio" name="n" id="r1" /> 30 days</label>' +
      '<label><input type="radio" name="n" id="r2" /> 60 days</label></fieldset></form>';
    await fillPage(profile);
    expect(document.querySelector('select')!.value).toBe('PH');
    expect(byId<HTMLInputElement>('r1').checked).toBe(true);
    expect(byId<HTMLInputElement>('r2').checked).toBe(false);
  });

  it('never submits a form and never clicks buttons', async () => {
    document.body.innerHTML = fixture('greenhouse');
    const submit = vi.spyOn(HTMLFormElement.prototype, 'submit').mockImplementation(() => {});
    const requestSubmit = vi.spyOn(HTMLFormElement.prototype, 'requestSubmit').mockImplementation(() => {});
    const buttonClicks = vi.fn();
    document.querySelectorAll('button').forEach((b) => b.addEventListener('click', buttonClicks));
    let submitEvents = 0;
    document.addEventListener('submit', () => submitEvents++);
    await fillPage(profile, document, { listboxTimeoutMs: 50 });
    expect(submit).not.toHaveBeenCalled();
    expect(requestSubmit).not.toHaveBeenCalled();
    expect(buttonClicks).not.toHaveBeenCalled();
    expect(submitEvents).toBe(0);
  });

  it('fills a combobox by clicking the closest option', async () => {
    document.body.innerHTML = fixture('greenhouse');
    const country = byId<HTMLInputElement>('country');
    country.setAttribute('aria-controls', 'lb');
    document.body.insertAdjacentHTML('beforeend', '<ul id="lb" role="listbox"></ul>');
    const lb = byId('lb');
    let chosen = '';
    country.addEventListener('input', () => {
      lb.innerHTML = ['Philippines', 'Philadelphia'].map((t) => `<li role="option">${t}</li>`).join('');
      lb.querySelectorAll('li').forEach((li) => li.addEventListener('click', () => (chosen = li.textContent!)));
    });
    const r = await fillPage(profile, document, { listboxTimeoutMs: 500 });
    expect(chosen).toBe('Philippines');
    expect(r.incomplete.find((i) => i.label === 'Country')).toBeUndefined();
  });

  it('clears the typed text and reports when no listbox appears', async () => {
    document.body.innerHTML = fixture('greenhouse');
    const r = await fillPage(profile, document, { listboxTimeoutMs: 120 });
    expect(byId<HTMLInputElement>('country').value).toBe('');
    expect(r.incomplete.map((i) => i.label)).toContain('Country');
    expect(r.requiredBlank).toContain('Country');
  });
});

describe('report', () => {
  const frame = (over: Partial<FrameResult>): FrameResult => ({
    url: 'https://example.test/apply',
    blocked: false,
    formFound: true,
    filled: 0,
    requiredBlank: [],
    incomplete: [],
    fields: [],
    ...over,
  });

  it('holds no field values', async () => {
    document.body.innerHTML = fixture('lever');
    const r = await fillPage(profile);
    const text = formatFieldReport([frame({ fields: r.fields })]);
    for (const value of ['Testa', 'Examplo', 'testa@example.invalid', '9171234567', 'Example Co', 'testa-example']) {
      expect(text).not.toContain(value);
    }
    expect(text).toContain('text | fullName | Full name');
    expect(JSON.stringify(r)).not.toContain('testa@example.invalid');
  });

  it('merges frames and finds an unreachable known job-board iframe', () => {
    const merged = mergeResults([
      frame({ filled: 2, requiredBlank: ['A'], atsIframes: ['https://boards.greenhouse.io/embed/job_app?for=x'] }),
      frame({ url: 'https://other.example.test/', filled: 3, requiredBlank: ['A', 'B'] }),
      frame({ url: 'https://www.linkedin.com/', blocked: true, filled: 9 }),
    ]);
    expect(merged.filled).toBe(5);
    expect(merged.requiredBlank).toEqual(['A', 'B']);
    expect(merged.unreachable).toEqual(['*://*.greenhouse.io/*']);
    const reached = mergeResults([
      frame({ atsIframes: ['https://boards.greenhouse.io/embed/x'] }),
      frame({ url: 'https://boards.greenhouse.io/embed/x' }),
    ]);
    expect(reached.unreachable).toEqual([]);
  });
});
