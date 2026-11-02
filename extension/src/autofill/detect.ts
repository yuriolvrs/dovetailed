// What this file is: finds the application form on a page and classifies each field (first name, email, phone and so on). It only reads the page and never changes it.
// In plain terms: looks at a page and works out which boxes are for your name, email, phone and similar details.

export type FieldKind =
  | 'firstName'
  | 'lastName'
  | 'fullName'
  | 'email'
  | 'confirmEmail'
  | 'phone'
  | 'phoneCountry'
  | 'street'
  | 'city'
  | 'stateProvince'
  | 'country'
  | 'postalCode'
  | 'location'
  | 'currentCompany'
  | 'currentTitle'
  | 'linkedin'
  | 'github'
  | 'portfolio'
  | 'website'
  | 'twitter'
  | 'facebook'
  | 'expectedSalary'
  | 'noticePeriod'
  | 'unknown';

export type FieldControl = 'text' | 'select' | 'textarea' | 'combobox' | 'radio' | 'checkbox';

export type FieldElement = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

export interface DetectedField {
  el: FieldElement;
  kind: FieldKind;
  control: FieldControl;
  /** Best human label we found. Used in reports, so it never holds a value. */
  label: string;
  /** name or id, for tests and debugging. */
  key: string;
  required: boolean;
  /** For radios: every radio of the group. The first one is `el`. */
  radios?: HTMLInputElement[];
  /** Set for a URL or name input that sits in a link row. */
  linkRow?: LinkRow;
}

export interface DetectResult {
  /** The container that holds the form fields, or null when no form was found. */
  scope: Node | null;
  fields: DetectedField[];
}

const FLAGS = /[\u{1F1E6}-\u{1F1FF}]/gu;

/**
 * Lower-cases text, splits camelCase, drops flag emoji and punctuation, and collapses spaces.
 * In plain terms: makes two spellings of the same words comparable.
 */
export function normalizeText(s: string): string {
  return s
    .replace(FLAGS, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}+]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const NEGATIVE = /\b(referr\w*|reference\w*|emergency|manager|employee|spouse|guardian|password|without domain|search by)\b|referr|password/;
const EEO = /\b(gender|sex|race|ethnic\w*|veteran|disabilit\w*|pronouns?|hispanic|latino|sexual orientation|transgender)\b/;

// Work-authorization questions often name a country or location. They must stay blank.
const WORK_AUTH = /\b(authori[sz]ed|authori[sz]ation|sponsor\w*|visas?|work permit|right to work|legally|eligible to work)\b/;

const AUTOCOMPLETE: Record<string, FieldKind> = {
  'given-name': 'firstName',
  'family-name': 'lastName',
  name: 'fullName',
  email: 'email',
  tel: 'phone',
  'tel-national': 'phone',
  'tel-country-code': 'phoneCountry',
  'street-address': 'street',
  'address-line1': 'street',
  'address-level2': 'city',
  'address-level1': 'stateProvince',
  country: 'country',
  'country-name': 'country',
  'postal-code': 'postalCode',
  organization: 'currentCompany',
  'organization-title': 'currentTitle',
  url: 'website',
};

// Order matters: the first rule that matches wins.
const RULES: Array<[FieldKind, RegExp]> = [
  ['confirmEmail', /\b(confirm|verify|repeat|re enter)\b.*\be ?mail\b|\be ?mail\b.*\b(confirm|confirmation|verify)\b/],
  ['email', /\be ?mail\b/],
  ['firstName', /\b(first|given) name\b|\bforename\b|\bfname\b|\bfirstname\b/],
  ['lastName', /\b(last|family) name\b|\bsurname\b|\blname\b|\blastname\b/],
  ['fullName', /\bfull name\b|\blegal name\b|\byour name\b|^(candidate |applicant )?name$/],
  ['phoneCountry', /\b(country|calling|dial|dialing) code\b|\bphone country\b|\bcountry phone\b/],
  ['phone', /\b(phone|mobile|cell|cellphone|telephone|tel|contact number)\b/],
  ['postalCode', /\b(postal|post ?code|zip)\b/],
  ['street', /\bstreet\b|\baddress line 1\b|\baddress 1\b|^address$/],
  ['city', /\bcity\b|\btown\b/],
  ['location', /\blocation\b|\bwhere are you (based|located)\b/],
  ['stateProvince', /\b(state|province|region)\b/],
  ['country', /\bcountry\b/],
  ['currentCompany', /\bcurrent (company|employer|organi[sz]ation)\b/],
  ['currentTitle', /\bcurrent (job )?title\b|\bcurrent (position|role)\b|\bjob title\b/],
  ['linkedin', /\blinked ?in\b/],
  ['github', /\bgit ?hub\b/],
  ['twitter', /\btwitter\b|\bx (com|profile|url|handle|account)\b/],
  ['facebook', /\bfacebook\b/],
  ['portfolio', /\bportfolio\b/],
  ['website', /\b(website|web site|personal site|homepage|link url)\b|\bother (url|link)\b/],
  ['expectedSalary', /\bsalary\b|\bcompensation\b|\bpay expectations?\b/],
  ['noticePeriod', /\bnotice\b/],
];

const IDENTITY: ReadonlySet<FieldKind> = new Set(['firstName', 'lastName', 'fullName', 'email', 'phone']);
const SKIPPED_INPUT_TYPES = new Set(['hidden', 'password', 'submit', 'button', 'reset', 'image', 'file', 'search']);

/** True when a label reads as a long question, e.g. "Are you subject to ... your current employer?". */
function isQuestion(text: string): boolean {
  const words = normalizeText(text).split(' ').length;
  return (text.includes('?') && words >= 9) || words >= 15;
}

/** Matches the text of one signal against the rules. */
function matchText(text: string): FieldKind | null {
  const n = normalizeText(text);
  if (!n) return null;
  for (const [kind, re] of RULES) if (re.test(n)) return kind;
  return null;
}

/** Collects every input, select and textarea, walking open shadow roots. */
function collectControls(root: Document | ShadowRoot | Element, out: FieldElement[] = []): FieldElement[] {
  for (const el of Array.from(root.querySelectorAll('*'))) {
    const tag = el.tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') out.push(el as FieldElement);
    if (el.shadowRoot) collectControls(el.shadowRoot, out);
  }
  return out;
}

/** The parent in the flat tree: crosses a shadow root up to its host. */
function parentOf(node: Node): Node | null {
  if (node.parentNode) return node.parentNode;
  return (node as ShadowRoot).host ?? null;
}

/** True when the element, or an ancestor, is hidden. */
export function isHidden(el: Element): boolean {
  for (let n: Node | null = el; n; n = parentOf(n)) {
    if (!(n instanceof Element)) continue;
    if (n.hasAttribute('hidden')) return true;
    const style = n.ownerDocument.defaultView?.getComputedStyle(n);
    if (style && (style.display === 'none' || (n === el && style.visibility === 'hidden'))) return true;
  }
  return false;
}

/** True for a search or tel input inside a phone picker's country dropdown. */
function inPhoneDropdown(el: Element): boolean {
  return !!el.closest('[class*="iti__dropdown"], [class*="iti__country"], [class*="country-list"], [role="listbox"]');
}

/** Text of a label element without the text of controls nested in it. */
function labelOwnText(label: Element): string {
  const clone = label.cloneNode(true) as Element;
  clone.querySelectorAll('input, select, textarea, option').forEach((c) => c.remove());
  return (clone.textContent ?? '').replace(/\s+/g, ' ').trim();
}

/** The bound label text: aria-labelledby, then label elements. */
function boundLabel(el: FieldElement): string {
  const root = el.getRootNode() as Document | ShadowRoot;
  const ids = el.getAttribute('aria-labelledby')?.split(/\s+/).filter(Boolean) ?? [];
  const fromAria = ids
    .map((id) => root.getElementById?.(id))
    .filter((n): n is HTMLElement => !!n)
    .map((n) => (n.textContent ?? '').replace(/\s+/g, ' ').trim())
    .join(' ');
  if (fromAria) return fromAria;
  const labels = (el as HTMLInputElement).labels;
  if (labels && labels.length) return Array.from(labels).map(labelOwnText).join(' ').trim();
  const wrap = el.closest('label');
  return wrap ? labelOwnText(wrap) : '';
}

/** Text next to a field that has no bound label. Stops at a parent that holds more than one control. */
function nearbyText(el: Element): string {
  let p = el.parentElement;
  for (let depth = 0; p && depth < 3; depth++, p = p.parentElement) {
    const controls = Array.from(p.querySelectorAll('input, select, textarea')).filter(
      (c) => !(c instanceof HTMLInputElement && c.type === 'hidden'),
    );
    if (controls.length > 1) return '';
    const clone = p.cloneNode(true) as Element;
    clone.querySelectorAll('input, select, textarea, option, script, style').forEach((c) => c.remove());
    const text = (clone.textContent ?? '').replace(/\s+/g, ' ').trim();
    if (text) return text.slice(0, 120);
  }
  return '';
}

/** A radio group label: fieldset legend, radiogroup label, or nearby text. */
function groupLabel(el: HTMLInputElement): string {
  const fs = el.closest('fieldset');
  const legend = fs?.querySelector('legend');
  if (legend) return (legend.textContent ?? '').replace(/\s+/g, ' ').trim();
  const rg = el.closest('[role="radiogroup"], [role="group"]');
  if (rg) {
    const aria = rg.getAttribute('aria-label');
    if (aria) return aria;
    const by = rg.getAttribute('aria-labelledby');
    const node = by ? (el.getRootNode() as Document | ShadowRoot).getElementById?.(by) : null;
    if (node) return (node.textContent ?? '').trim();
    const prev = rg.previousElementSibling;
    if (prev) return (prev.textContent ?? '').replace(/\s+/g, ' ').trim();
  }
  return '';
}

function controlOf(el: FieldElement): FieldControl {
  if (el instanceof HTMLSelectElement) return 'select';
  if (el instanceof HTMLTextAreaElement) return 'textarea';
  if (el.type === 'radio') return 'radio';
  if (el.type === 'checkbox') return 'checkbox';
  if (el.getAttribute('role') === 'combobox' || el.getAttribute('aria-haspopup') === 'listbox') return 'combobox';
  return 'text';
}

/** True when every non-empty option of a select looks like a calling code, e.g. "+63". */
function isCallingCodeSelect(el: HTMLSelectElement): boolean {
  const opts = Array.from(el.options).filter((o) => o.value !== '');
  return opts.length > 0 && opts.every((o) => /\+\d{1,4}/.test(`${o.text} ${o.value}`));
}

/** Classifies one control and returns its label. */
function classify(el: FieldElement, control: FieldControl, group?: string): { kind: FieldKind; label: string } {
  const bound = group ?? boundLabel(el);
  const nearby = bound ? '' : nearbyText(el);
  const placeholder = el.getAttribute('placeholder') ?? '';
  const aria = el.getAttribute('aria-label') ?? '';
  const name = el.getAttribute('name') ?? '';
  const id = el.id;
  const label = bound || nearby || aria || placeholder || name || id;

  const signals = [name, id, bound, nearby, placeholder, aria];
  if (signals.some((s) => NEGATIVE.test(normalizeText(s)))) return { kind: 'unknown', label };
  if (signals.some((s) => EEO.test(normalizeText(s)) || WORK_AUTH.test(normalizeText(s)))) return { kind: 'unknown', label };

  // Radios and checkboxes: only a notice-period group may be classified.
  if (control === 'radio' || control === 'checkbox') {
    const kind = matchText(bound || nearby);
    return { kind: control === 'radio' && kind === 'noticePeriod' ? kind : 'unknown', label };
  }

  // Signal order: autocomplete, name/id, bound label, nearby text, placeholder, aria-label.
  const ac = (el.getAttribute('autocomplete') ?? '').trim().split(/\s+/).pop() ?? '';
  if (AUTOCOMPLETE[ac]) return { kind: AUTOCOMPLETE[ac], label };
  if (el instanceof HTMLSelectElement && isCallingCodeSelect(el)) return { kind: 'phoneCountry', label };
  for (const s of [name, id, bound, nearby, placeholder, aria]) {
    // A long question that names a place or an employer is a question, not an address or company box.
    const k = (s === bound || s === nearby) && isQuestion(s) ? null : matchText(s);
    // A generic "location" id with a label that says "(City)" is a city field.
    if (k === 'location' && matchText(bound) === 'city') return { kind: 'city', label };
    if (k) return { kind: k, label };
  }
  if (el instanceof HTMLInputElement) {
    if (el.type === 'email') return { kind: 'email', label };
    if (el.type === 'tel') return { kind: 'phone', label };
  }
  return { kind: 'unknown', label };
}


const LINK_TYPE_WORDS = /\blinked ?in\b|\bgit ?hub\b|\bportfolio\b|\btwitter\b|\bfacebook\b|\bwebsite\b/;

/** One repeating link row: a type select, a URL input, and maybe a name input that "Other" reveals. */
export interface LinkRow {
  select: HTMLSelectElement;
  urlInput: HTMLInputElement;
  /** The extra text input, visible or hidden. */
  nameInput?: HTMLInputElement;
}

/**
 * Finds the link row that holds this input: a select with link-type options (LinkedIn, GitHub, Portfolio...)
 * plus a URL input and, optionally, one more text input. Hidden controls count, because "Other" reveals one.
 * Returns null when the input is not in such a row.
 * In plain terms: spots the "type of link" dropdown and the boxes beside it.
 */
export function linkRowFor(el: Element): LinkRow | null {
  if (!(el instanceof HTMLInputElement) || (el.type !== 'text' && el.type !== 'url')) return null;
  let p = el.parentElement;
  for (let depth = 0; p && depth < 3; depth++, p = p.parentElement) {
    const controls = Array.from(p.querySelectorAll<FieldElement>('input, select, textarea')).filter(
      (c) => !(c instanceof HTMLInputElement && c.type === 'hidden'),
    );
    const selects = controls.filter((c): c is HTMLSelectElement => c instanceof HTMLSelectElement);
    const others = controls.filter((c): c is HTMLInputElement => c instanceof HTMLInputElement);
    if (selects.length > 1 || others.length > 2 || controls.length !== selects.length + others.length) return null;
    if (selects.length === 0) continue;
    const texts = Array.from(selects[0].options).map((o) => normalizeText(o.text || o.value));
    if (!texts.some((t) => LINK_TYPE_WORDS.test(t))) return null;
    const urlInput = others.find((c) => c.type === 'url') ?? (others.length === 1 ? others[0] : undefined);
    if (!urlInput) return null;
    const nameInput = others.find((c) => c !== urlInput);
    return { select: selects[0], urlInput, nameInput };
  }
  return null;
}

/** The kind a link row's URL input takes from the select's current value. Other types give 'unknown'. */
function kindFromLinkRow(row: LinkRow): FieldKind {
  const chosen = row.select.options[row.select.selectedIndex];
  const k = matchText(chosen ? chosen.text || chosen.value : '');
  return k && ['linkedin', 'github', 'portfolio', 'twitter', 'facebook', 'website'].includes(k) ? k : 'unknown';
}

function isRequired(el: FieldElement, label: string): boolean {
  return el.required || el.getAttribute('aria-required') === 'true' || /\*/.test(label);
}

/** All ancestors of a node, root first, crossing shadow roots. */
function chainOf(node: Node): Node[] {
  const out: Node[] = [];
  for (let n: Node | null = node; n; n = parentOf(n)) out.unshift(n);
  return out;
}

/**
 * Picks the container that holds the form's identity fields. It starts at the
 * common ancestor of all identity fields, then steps into the one child that
 * holds nearly all of them, so a stray field elsewhere (a newsletter box) is left out.
 */
function chooseScope(identity: FieldElement[]): Node | null {
  if (identity.length === 0) return null;
  const chains = identity.map(chainOf);
  let depth = 0;
  // Common ancestor of all identity fields.
  while (chains.every((c) => c[depth + 1] && c[depth + 1] === chains[0][depth + 1])) depth++;
  let node = chains[0][depth];
  let active = chains;
  for (;;) {
    if (node instanceof Element && node.tagName === 'FORM') break;
    const groups = new Map<Node, Node[][]>();
    for (const c of active) {
      const next = c[depth + 1];
      if (next) groups.set(next, [...(groups.get(next) ?? []), c]);
    }
    let best: [Node, Node[][]] | null = null;
    for (const g of groups) if (!best || g[1].length > best[1].length) best = g;
    if (!best) break;
    const excluded = active.length - best[1].length;
    if (best[1].length < 3 || excluded > best[1].length / 3) break;
    node = best[0];
    active = best[1];
    depth++;
  }
  return node;
}

/**
 * Widens the scope to the form that holds it, unless another identity field (name, email, phone) sits
 * in that form outside the scope. Real sites put the questions in later sections of the same form.
 * In plain terms: a form split into sections is filled in every section, but a stray newsletter box stays out.
 */
function widenToForm(scope: Node, all: DetectedField[]): Node {
  const form = chainOf(scope).reverse().find((n) => n instanceof Element && n.tagName === 'FORM');
  if (!form || form === scope) return scope;
  const stray = all.some((f) => {
    const chain = chainOf(f.el);
    return IDENTITY.has(f.kind) && chain.includes(form) && !chain.includes(scope);
  });
  return stray ? scope : form;
}

/**
 * Finds the form on the page and classifies its fields. It reads the page only.
 * In plain terms: tells which boxes are name, email, phone and so on, and ignores unrelated boxes such as a newsletter signup.
 */
export function detectFields(root: Document | ShadowRoot | Element = document): DetectResult {
  const seenRadios = new Set<HTMLInputElement>();
  const all: DetectedField[] = [];
  for (const el of collectControls(root)) {
    if (el instanceof HTMLInputElement && SKIPPED_INPUT_TYPES.has(el.type)) continue;
    if (isHidden(el) || inPhoneDropdown(el)) continue;
    const control = controlOf(el);
    let radios: HTMLInputElement[] | undefined;
    let group: string | undefined;
    if (control === 'radio') {
      const input = el as HTMLInputElement;
      if (seenRadios.has(input)) continue;
      radios = radioGroup(input);
      radios.forEach((r) => seenRadios.add(r));
      group = groupLabel(input);
    }
    const classified = classify(el, control, group);
    const { label } = classified;
    let kind = classified.kind;
    const row = linkRowFor(el);
    if (row) {
      if (el === row.nameInput) kind = 'unknown';
      else if (kind === 'website' || kind === 'unknown') kind = kindFromLinkRow(row);
    }
    all.push({
      el,
      kind,
      control,
      label: label.replace(/\s*\*+\s*$/, '').trim(),
      key: el.id || el.getAttribute('name') || '',
      required: isRequired(el, label) || (radios?.some((r) => r.required) ?? false),
      radios,
      linkRow: row ?? undefined,
    });
  }

  const identity = all.filter((f) => IDENTITY.has(f.kind)).map((f) => f.el);
  const narrow = chooseScope(identity);
  if (!narrow) return { scope: null, fields: [] };
  const scope = widenToForm(narrow, all);
  const inScope = all.filter((f) => chainOf(f.el).includes(scope));
  // A lone email box (newsletter, chat widget, sign-in) is not an application form.
  const identityKinds = new Set(inScope.map((f) => f.kind).filter((k) => IDENTITY.has(k)));
  if (identityKinds.size < 2) return { scope: null, fields: [] };
  return { scope, fields: inScope };
}

/** Every radio that shares the name and form of this radio, in the same root. */
function radioGroup(input: HTMLInputElement): HTMLInputElement[] {
  if (!input.name) return [input];
  const root = input.getRootNode() as Document | ShadowRoot;
  return Array.from(root.querySelectorAll<HTMLInputElement>('input[type="radio"]')).filter(
    (r) => r.name === input.name && r.form === input.form,
  );
}
