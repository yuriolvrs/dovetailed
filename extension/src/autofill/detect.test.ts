// What this file is: tests for field detection, one per hand-made fixture (Teamtailor, trellis.ph, Greenhouse, Lever, Ashby, SmartRecruiters, Workable).
// In plain terms: checks that each sample form has every box classified correctly and that look-alike traps are ignored.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { detectFields } from './detect';
import type { DetectResult } from './detect';

function load(name: string): DetectResult {
  document.body.innerHTML = readFileSync(join(process.cwd(), 'src/autofill/fixtures', `${name}.html`), 'utf8');
  return detectFields(document);
}

const kinds = (r: DetectResult) => Object.fromEntries(r.fields.map((f) => [f.key, f.kind]));
const requiredKeys = (r: DetectResult) => r.fields.filter((f) => f.required).map((f) => f.key);

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('Teamtailor fixture', () => {
  it('classifies every field and ignores the employee sign-in email and the phone dropdown inputs', () => {
    const r = load('teamtailor');
    expect(kinds(r)).toEqual({
      first_name: 'firstName',
      last_name: 'lastName',
      email: 'email',
      phone: 'phone',
      q_salary: 'expectedSalary',
      q_notice: 'noticePeriod',
      eu_yes: 'unknown',
      consent: 'unknown',
    });
    expect(r.fields.find((f) => f.key === 'full_email')).toBeUndefined();
    expect(r.fields.find((f) => f.key.startsWith('country_search'))).toBeUndefined();
    expect(r.scope).toBe(document.getElementById('apply'));
    expect(requiredKeys(r)).toEqual(['first_name', 'last_name', 'email', 'eu_yes', 'consent']);
  });

  it('classifies the sign-in email as unknown even when no scope separates it', () => {
    document.body.innerHTML =
      '<form><label for="full_email">Email address without domain</label><input id="full_email"/>' +
      '<label for="first_name">First name</label><input id="first_name"/><label for="e">Email</label><input id="e"/></form>';
    const r = detectFields(document);
    expect(kinds(r).full_email).toBe('unknown');
  });
});

describe('trellis.ph fixture', () => {
  it('uses name and placeholder, and ignores the footer newsletter email', () => {
    const r = load('trellis');
    expect(kinds(r)).toEqual({
      firstName: 'firstName',
      lastName: 'lastName',
      email: 'email',
      phoneCode: 'phoneCountry',
      phoneNumber: 'phone',
      linkType: 'unknown',
      linkUrl: 'linkedin',
    });
    expect(r.fields.find((f) => f.key === 'newsletter')).toBeUndefined();
    expect(r.scope).toBe(document.getElementById('apply'));
  });
});

describe('link-type rows', () => {
  const kindWith = (type: string) => {
    load('trellis');
    document.querySelector<HTMLSelectElement>('[name=linkType]')!.value = type;
    return kinds(detectFields(document)).linkUrl;
  };
  it('follows the select current value and leaves the select alone', () => {
    expect(kindWith('LinkedIn')).toBe('linkedin');
    expect(kindWith('Portfolio')).toBe('portfolio');
    expect(kindWith('GitHub')).toBe('github');
    expect(kindWith('Google Drive')).toBe('unknown');
    expect(kindWith('Other')).toBe('unknown');
    expect(document.querySelector<HTMLSelectElement>('[name=linkType]')!.value).toBe('Other');
  });
});

describe('Greenhouse fixture', () => {
  it('classifies comboboxes and skips EEO fields', () => {
    const r = load('greenhouse');
    expect(kinds(r)).toEqual({
      first_name: 'firstName',
      last_name: 'lastName',
      email: 'email',
      phone: 'phone',
      country: 'country',
      'candidate-location': 'city',
      gender: 'unknown',
      race: 'unknown',
      veteran_status: 'unknown',
      disability_status: 'unknown',
    });
    expect(r.fields.find((f) => f.key === 'country')?.control).toBe('combobox');
    expect(r.fields.find((f) => f.key === 'g-recaptcha-response')).toBeUndefined();
  });
});

describe('Lever fixture', () => {
  it('treats the name as one field and ignores the referring employee', () => {
    const r = load('lever');
    expect(kinds(r)).toEqual({
      name: 'fullName',
      email: 'email',
      phone: 'phone',
      location: 'location',
      org: 'currentCompany',
      'urls[LinkedIn]': 'linkedin',
      'urls[Twitter]': 'twitter',
      'urls[GitHub]': 'github',
      'urls[Portfolio]': 'portfolio',
      'urls[Other]': 'website',
      referrer: 'unknown',
      school: 'unknown',
      consent: 'unknown',
    });
    expect(r.fields.find((f) => f.key === 'h-captcha-response')).toBeUndefined();
    expect(r.fields.filter((f) => f.control === 'radio')).toHaveLength(1);
  });
});

describe('Ashby fixture', () => {
  it('finds the fields without a form element', () => {
    const r = load('ashby');
    expect(kinds(r)).toEqual({
      _systemfield_name: 'fullName',
      _systemfield_email: 'email',
      phone: 'phone',
      loc: 'location',
      li: 'linkedin',
      sms: 'unknown',
    });
    expect(r.scope).toBe(document.getElementById('app'));
  });
});

describe('Workable fixture', () => {
  it('classifies GitHub and LinkedIn textareas', () => {
    const r = load('workable');
    expect(kinds(r)).toEqual({
      firstname: 'firstName',
      lastname: 'lastName',
      email: 'email',
      phone: 'phone',
      gh: 'github',
      li: 'linkedin',
      gdpr: 'unknown',
    });
    expect(requiredKeys(r)).toEqual(['firstname', 'lastname', 'email', 'gdpr']);
  });
});

describe('SmartRecruiters-style shadow DOM', () => {
  it('walks nested open shadow roots', () => {
    const host = document.createElement('div');
    document.body.append(host);
    const outer = host.attachShadow({ mode: 'open' });
    outer.innerHTML =
      '<label for="fn">First name *</label><input id="fn" required />' +
      '<label for="ln">Last name *</label><input id="ln" required />' +
      '<label for="em">Email *</label><input id="em" type="email" required />' +
      '<label for="em2">Confirm email *</label><input id="em2" type="email" required />' +
      '<label for="city">City</label><input id="city" role="combobox" />' +
      '<div id="inner-host"></div>' +
      '<input id="drop1" type="file" /><input id="drop2" type="file" />';
    const inner = outer.getElementById('inner-host')!.attachShadow({ mode: 'open' });
    inner.innerHTML =
      '<select id="cc"><option value="">Country</option><option value="63">\u{1F1F5}\u{1F1ED} +63</option><option value="1">\u{1F1FA}\u{1F1F8} +1</option></select>' +
      '<label for="tel">Phone</label><input id="tel" type="tel" />';
    const r = detectFields(document);
    expect(kinds(r)).toEqual({
      fn: 'firstName',
      ln: 'lastName',
      em: 'email',
      em2: 'confirmEmail',
      city: 'city',
      cc: 'phoneCountry',
      tel: 'phone',
    });
  });
});

describe('lone fields', () => {
  it('does not treat a page with one email input as a form', () => {
    document.body.innerHTML = '<div><label for="n">Email</label><input id="n" type="email"/><button>Subscribe</button></div>';
    expect(detectFields(document)).toEqual({ scope: null, fields: [] });
  });

  it('does not treat an email and password sign-in as a form', () => {
    document.body.innerHTML = '<form><label for="e">Email</label><input id="e" type="email"/><label for="p">Password</label><input id="p" type="password"/></form>';
    expect(detectFields(document)).toEqual({ scope: null, fields: [] });
  });

  it('needs two distinct identity kinds', () => {
    document.body.innerHTML = '<form><label for="a">Email</label><input id="a"/><label for="b">Confirm email</label><input id="b"/></form>';
    expect(detectFields(document).fields).toEqual([]);
  });
});

describe('negative terms and hidden fields', () => {
  it('rejects reference, emergency and password labels and hidden inputs', () => {
    document.body.innerHTML =
      '<form><label for="a">First name</label><input id="a"/><label for="b">Email</label><input id="b" type="email"/>' +
      '<label for="c">Last name</label><input id="c"/>' +
      '<label for="d">Emergency contact phone</label><input id="d" type="tel"/>' +
      '<label for="e">Reference email</label><input id="e" type="email"/>' +
      '<label for="f">Password</label><input id="f" type="password"/>' +
      '<label for="g">Email</label><input id="g" style="display:none"/>' +
      '<input id="h" type="hidden" name="email"/></form>';
    const r = detectFields(document);
    expect(kinds(r)).toEqual({ a: 'firstName', b: 'email', c: 'lastName', d: 'unknown', e: 'unknown' });
  });

  it('finds no form on a page without identity fields', () => {
    document.body.innerHTML = '<input id="q" placeholder="Search jobs" />';
    expect(detectFields(document)).toEqual({ scope: null, fields: [] });
  });
});
