# Plan 04: Browser extension for autofill

**Goal:** A WXT Manifest V3 extension in `/extension` fills job forms and attaches a stored resume on Chrome, Brave, Edge and Firefox. It never submits a form.

**Status:** Phase 1 schema approved on 2026-11-01. Phase 2 task specs are next.

**Doc links:** `src/types/index.ts` (Contact, ExperienceEntry, EducationEntry), `src/lib/db.ts`, PRD.md §3, `docs/DECISIONS.md`.

**Out of scope:** Dovetailed sign-in or sync, tailored resumes, AI answers for free-text questions, store publishing, Indeed, LinkedIn.

**Coverage:** The engine is generic. It runs on any site except the blocked ones, with no per-site code unless a site proves it needs some. On a site that needs an account, the user signs in or signs up themself, then clicks Fill on each page. The named platforms are test targets, not a limit. The extension never fills or stores passwords. It never creates an account or clicks through a sign-up.

**Blocked sites:** The extension does not fill on `indeed.com` or `linkedin.com`, including subdomains. Their terms may ban this kind of tool, and the user does not want to risk their account. The popup says why and does nothing on those sites.

**Rollout order:** Teamtailor and trellis.ph first, then Greenhouse, Lever, Ashby, SmartRecruiters and Workable.

**Sync:** Undecided. Nothing is built for it beyond the `getProfile()` and `getResume()` seam.

## Phase 1: Profile schema (proposed)

File: `extension/src/types/profile.ts`. The extension reuses Dovetailed types with `import type`, so the shared shapes cannot drift.

```ts
import type { ContactLink, ExperienceEntry, EducationEntry } from '../../../src/types';

export const EXTENSION_PROFILE_VERSION = 1;

export interface PhoneNumber {
  /** Digits only, no plus: "63". */
  countryCallingCode: string;
  /** Digits only, no trunk 0: "9171234567". */
  nationalNumber: string;
}

export interface PostalAddress {
  street?: string;
  city?: string;
  stateProvince?: string;
  /** ISO 3166-1 alpha-2: "PH". The full name comes from Intl.DisplayNames. */
  countryCode?: string;
  postalCode?: string;
}

export interface ResumeFileRef {
  id: string;
  fileName: string;
  /** application/pdf, or the DOCX type. */
  mimeType: string;
  sizeBytes: number;
  updatedAt: number;
  /** Where the bytes live. Widen this union when an API source exists. */
  storage: 'local';
}

export interface ExtensionProfile {
  version: number;
  firstName: string;
  lastName: string;
  email: string;
  phone?: PhoneNumber;
  address?: PostalAddress;
  /** Same shape as Dovetailed. LinkedIn and similar are found by URL host at fill time. */
  links: ContactLink[];
  experience: ExperienceEntry[];
  education: EducationEntry[];
  resume?: ResumeFileRef;
  /** Plain stored answers, filled only into a clear match. */
  expectedSalary?: string;
  noticePeriod?: string;
}
```

Derived at fill time, not stored:
- Full name: `firstName lastName` (Lever "Full name", Ashby "Legal Name").
- Location: `city, stateProvince, country` (Lever, Ashby, Greenhouse single fields).
- Current company and title: the `current` entry in `experience` (Lever "Current company").
- LinkedIn, GitHub, portfolio, X, Facebook: URL host of `links`.

Not stored: EEO answers, work authorization, consents. These stay blank for the user.

## Phase 2: Scaffold

- Build with `wxt build -b chrome --mv3` and `wxt build -b firefox --mv3`. WXT targets MV2 on Firefox by default, so the flag is required.
- Set `browser_specific_settings.gecko.id`, `strict_min_version: 140.0`, and `data_collection_permissions: { required: ['none'] }`.
- **Storage:** IndexedDB (Dexie) in the extension origin, with `unlimitedStorage`.
  - IndexedDB keeps the file as a Blob. `storage.local` would need base64, which adds about a third to the size.
  - The background script owns the database. A content script cannot use it, because IndexedDB in a content script opens the page's database.
- **`getProfile()` and `getResume()`:** one module, and the only access path. Outside the background script, they send a message.
- **File transfer:** base64 in the message, rebuilt into a `File`. Chrome messaging uses JSON by default. Its structured clone option needs Chrome 148, and Firefox support is unconfirmed, so one path serves both browsers.
- **Permissions:** `activeTab` and `scripting`, with injection on click. No content script runs on pages until the user clicks.
- **Embedded forms:** `optional_host_permissions` lists known ATS hosts only (Greenhouse, Lever, Ashby, Workable, SmartRecruiters, iCIMS). There is no `<all_urls>`.
- **Field report:** a popup action copies a list of field types and labels, with no values. It lets us support logged-in sites we cannot open ourselves.

## Phase 3: Autofill engine

Find the form first, then match inside it. Do not scan the whole page. The scope is the container holding the most matched identity fields, because Ashby and SmartRecruiters have no `<form>` element. Walk open shadow roots, because the SmartRecruiters form is inside them.

Detection order: `autocomplete`, `name`/`id`, bound `<label>`, nearby text, `placeholder`, `aria-label`.

Evidence from the live forms (2026-11-01):

| Finding | Teamtailor (directio) | trellis.ph `/apply` |
| --- | --- | --- |
| Form appears | After clicking Apply | On a separate page |
| Matching signal | `autocomplete`, `name`, bound labels | `name`, `placeholder`; labels are not bound |
| Phone | One `tel` input with intl-tel-input | `<select>` with 2 options plus a national-number input |
| Links | None | Type select, URL input, Add Link |
| Decoys | Hidden country search input, consent checkboxes | Footer newsletter email input (required) |
| Custom questions | Salary, notice period, yes/no, per job | None |
| Iframe | None | None |

Wider survey (same day; labels and types only, nothing entered):

| Platform | Form markup | Name | Location | Phone | Traps |
| --- | --- | --- | --- | --- | --- |
| Greenhouse (Figma) | `<form>`, 9 comboboxes | Split, `autocomplete` | Required country and city comboboxes | intl-tel-input | EEO comboboxes, reCAPTCHA, "Autofill my application" |
| Lever (Palantir) | `<form>`, plain inputs | **One field** | One field | Plain input | Consent radios, hCaptcha, 3302-option school select |
| Ashby (Ramp) | **No `<form>`** | **One field**, "Legal Name" | Combobox | `tel` | Unlabelled parser file input, SMS consent radios, Yes/No buttons |
| SmartRecruiters (ServiceNow) | **No `<form>`, 1811 shadow roots** | Split | City combobox | Country picker plus `tel` | Confirm email, two identical file dropzones |
| Workable (Hugging Face) | `<form>` | Split | None | `tel` | GitHub and LinkedIn are textareas, GDPR checkbox, parser import |
| Airbnb careers | **Cross-origin Greenhouse iframe** | Not read | Not read | Not read | Real proof that iframes matter |
| iCIMS (Cayuse) | Same-origin content iframe | Not read | Not read | Not read | Posting was gone |
| Workday (NVIDIA) | 6-step wizard | Behind sign-in | Behind sign-in | Behind sign-in | Account required |
| Kalibrr (DHL) | Not reached | Not read | Not read | Not read | Apply button did not open a form in the test |

Indeed apply wizard, from the user's screenshot (not opened by us): one step per page, fields already filled from the account, email shown as read-only text, and a separate country picker.

Rules:
- Skip hidden inputs and anything outside the chosen form.
- Fill only text, email, tel, url, select, combobox and textarea fields with a confident match. Never touch checkboxes, radios or Yes/No buttons in v1. The only exception is `noticePeriod`, which needs a labelled radio group.
- Never interact with CAPTCHA frames, and do not count them as unreachable forms.
- Use negative terms so labels like "Referring employee (Full name)", "reference" and "emergency contact" never match identity fields.
- Skip EEO fields (gender, race, veteran, disability).
- Keep non-empty fields the site or account filled. Replace a value only if it changed during our resume-upload wait.
- Fill the current step only. Never click Continue, Next or Submit. The user clicks Fill again on each step.
- Comboboxes: set the text, wait for the listbox, then click the closest option. If none is close, leave it and report it. Test whether synthetic events work on react-select.
- Leave questions with no profile value blank. List required ones in the popup as "not filled".
- If no form is found, the popup says to open the application form first.
- Fill only the first link row on trellis.ph. Do not click Add Link.

Iframes: `activeTab` appears to cover the top-level origin only. When a frame on a known ATS host cannot be reached, the popup offers a one-click grant through `optional_host_permissions`. Neither target uses an iframe, so test on a local fixture (`localhost` embedding `127.0.0.1`) and on the embedded Greenhouse form at careers.airbnb.com.

Tests (Vitest with jsdom, HTML fixtures of both forms): field matching, closest select option, phone formats.

## Phase 4: Resume upload

- Pick the input by id or name, label, then nearest section heading. Use `accept` only to exclude. It cannot identify a resume input: Ashby's Cover Letter input has the same list as Resume, and SmartRecruiters' two dropzones are identical.
- Teamtailor's "Upload CV" input matches; its "Additional files" input must be skipped.
- Prefer the real resume field over a parser-only dropzone (Ashby's unlabelled input, Workable's import).
- If two inputs remain, skip both and flag it in the popup.
- Hidden inputs are allowed here. The trellis.ph input is hidden.
- Order: attach, wait, then fill. The wait polls form values until they stay stable, with a timeout. Then Phase 3 runs, and values the parser changed are replaced with ours.
- On wizards, a resume step may offer a stored account resume. Do not change that choice.

## Phase 5: Targets and README

- Manual test in Chrome and Firefox on both sites, up to but not including submit.
- Second tier, after the first two pass: Greenhouse, Lever, Ashby, SmartRecruiters, Workable, using saved fixtures plus one live check each.
- Confirm the popup refuses to fill on `indeed.com` and `linkedin.com`.
- For a logged-in site added later, the user runs the extension and we work from their field report. Do not store their sign-in or data in fixtures.
- Workday and other account sites are best effort. We cannot create accounts to test, so the user tries them signed in and sends a field report.
- Use a dummy resume with fake details. Attaching a file sends it to the site.
- The trellis.ph parser test is the only way to prove the overwrite order.
- The README covers load-unpacked steps. Firefox removes a temporary add-on on restart, and stored data may go with it. Confirm during testing.

## Task 4.1: WXT scaffold and manifest

**Goal:** `/extension` is its own package that builds an MV3 extension for Chrome and Firefox.

**Files to touch:** `extension/` only: `package.json`, `wxt.config.ts`, `tsconfig.json`, `.gitignore`, `vitest.config.ts`, Tailwind and PostCSS config, minimal `entrypoints/background.ts`, `entrypoints/popup/`, `entrypoints/options/`.

**Doc sections to read:** This plan: Status, Coverage, Blocked sites, Phase 2. CLAUDE.md Conventions.

**Steps:**
1. Add dependencies: `wxt@^0.21.5`, `@wxt-dev/module-react@^1.2.2`, `react@^18.3.1`, `react-dom@^18.3.1`, `dexie@^4.0.11`, `lucide-react@^1.25.0`. Dev: `typescript`, `vitest`, `tailwindcss@^3.4.17`, `postcss`, `autoprefixer`, `fake-indexeddb`, `@types/react`, `@types/react-dom`. Do not touch the root `package.json`.
2. Scripts: `dev`, `dev:firefox` (`wxt -b firefox --mv3`), `build:chrome` (`wxt build -b chrome --mv3`), `build:firefox` (`wxt build -b firefox --mv3`), `build` (both), `test` (`vitest run`), `typecheck` (`tsc --noEmit`, after `wxt prepare`).
3. In `wxt.config.ts`, set name "Dovetailed Autofill", `permissions: ['activeTab', 'scripting', 'unlimitedStorage']`, and `optional_host_permissions` for `*://*.greenhouse.io/*`, `*://*.lever.co/*`, `*://*.ashbyhq.com/*`, `*://*.workable.com/*`, `*://*.smartrecruiters.com/*`, `*://*.icims.com/*`, `*://*.teamtailor.com/*`, `*://*.myworkdayjobs.com/*`. No `host_permissions`, no `content_scripts`.
4. Add for Firefox only: `browser_specific_settings.gecko` with `id: 'autofill@dovetailed.local'`, `strict_min_version: '140.0'`, `data_collection_permissions: { required: ['none'] }`.
5. Set `vite.resolve.dedupe` to `react`, `react-dom`, `lucide-react`. Later tasks import UI from `../src`, and two copies of React would break hooks.
6. Tailwind reuses the root `tailwind.config.js` as a preset. `content` covers `extension/entrypoints` and `src/components`.
7. Popup and options pages render a heading only. Background is an empty `defineBackground`.

**Done when:** `npm run build`, `npm run typecheck` and `npm run test` (allow no tests) pass in `extension/`. Both output manifests have `manifest_version: 3`. The Firefox manifest has the gecko block and a background `scripts` entry. The Chrome manifest has a `service_worker` and no gecko block. `npx web-ext lint -s .output/firefox-mv3` reports no errors.

**Out of scope:** Storage, profile types, form filling, the README.

## Task 4.2: Profile types and the single data layer

**Goal:** `getProfile()` and `getResume()` are the only way any part of the extension reads this data.

**Files to touch:** `extension/src/types/profile.ts`, `extension/src/lib/db.ts`, `extension/src/lib/data.ts`, `extension/src/lib/messages.ts`, tests beside them, `extension/entrypoints/background.ts`.

**Doc sections to read:** This plan: Phase 1 schema, Phase 2 storage and file transfer. `src/lib/db.ts` for the Dexie style.

**Steps:**
1. Add the Phase 1 schema, including `expectedSalary` and `noticePeriod`. Import shared types with `import type` from `../../../src/types`.
2. Add a Dexie database `dovetailed-extension` with tables `profile` and `resumeFiles`. Only `db.ts` and the background handler use it.
3. In `data.ts`, export `getProfile`, `saveProfile`, `getResume`, `saveResume`, `deleteResume`. In the background these use Dexie directly. Elsewhere they send a typed message. Pages may use messages everywhere if that is simpler; one path is better than two.
4. `getResume()` returns `File | null`. Bytes cross messages as base64. Write a tested encode and decode pair that round-trips binary data and does not overflow the call stack on a 5 MB file.
5. `saveResume` accepts PDF and DOCX only, by extension and MIME type, and at most 15 MB. Replacing a file removes the old one and updates `profile.resume`.
6. `getProfile()` returns an empty default profile when none exists.

**Done when:** Vitest with `fake-indexeddb` covers: empty default, save and read profile, resume round-trip with identical bytes, replace, delete, rejected file type, rejected size. Build and typecheck pass.

**Out of scope:** UI, sync, any API call.

## Task 4.3: Options page

**Goal:** The user can view and edit the full profile and upload, replace or delete a resume.

**Files to touch:** `extension/entrypoints/options/` and `extension/src/components/` only.

**Doc sections to read:** `src/components/profile/ContactForm.tsx`, `src/components/EditableList.tsx`, `src/components/profile/DateRangeFields.tsx`.

**Steps:**
1. Reuse `Card`, `SectionTitle`, `FieldInput`, `FieldSelect`, `FieldTextarea`, `Btn`, `EditableList` and `DateRangeFields` by relative import. Do not copy them, and do not edit `src/`.
2. Sections: Name, Email, Phone (calling code, national number), Address (street, city, state or province, country select from `Intl.DisplayNames` plus postal code), Links, Experience, Education, Application answers (expected salary, notice period), Resume.
3. Strip a leading `+` from the calling code and a leading `0` from the national number on save. Keep digits only.
4. Load through `getProfile()`, save through `saveProfile()`. Show the saved indicator.
5. The resume section shows file name, size and date, and offers replace and delete.

**Done when:** Build and typecheck pass. In a loaded Chrome build, an edit survives a page reload and a PDF upload shows its details after reload. A unit test covers the phone cleanup.

**Out of scope:** Popup, importing a Dovetailed backup, changes to `src/`.

## Task 4.4: Popup and page injection

**Goal:** The popup proves that click-time injection works, and it refuses blocked sites.

**Files to touch:** `extension/entrypoints/popup/`, `extension/src/lib/blockedSites.ts` and its test, `extension/entrypoints/scan.ts` (an unlisted script).

**Doc sections to read:** This plan: Blocked sites, Phase 2 permissions.

**Steps:**
1. `isBlockedSite(url)` returns true for `indeed.com` and `linkedin.com` and any subdomain, including country domains such as `ph.indeed.com` and `smartapply.indeed.com`. `notindeed.com` must not match. Country-code domains such as `indeed.co.uk` must match too.
2. On a blocked site, the popup disables the button and explains why.
3. The popup shows whether a profile and a resume are stored, with a link to the options page.
4. "Fill this page" injects `scan.ts` with `browser.scripting.executeScript`. The script returns only a count of visible form fields. It reads no values. Show "Found N fields. Filling arrives in the next phase."
5. Show a clear message on pages that cannot be injected, such as `chrome://` and extension store pages.

**Done when:** `isBlockedSite` tests pass. Build and typecheck pass. In Chrome, the button reports a field count on a normal page.

**Out of scope:** Matching or filling fields, the field report, iframes.

## Task 4.7: Options page redesign

**Goal:** The options page reads as one continuous settings page with no nested containers, and Country is a searchable dropdown with flags. Full spec is in the implementer brief of 2026-11-01. Runs in parallel with 4.5 and 4.6 on different files.

## Later: Fill the profile from the resume

**Goal:** A user uploads a resume and the options page offers to fill the profile from it, for review before saving.

**Not started.** The web app already has this in `src/prompts/extractProfile.ts`, through the LLM proxy. The extension has no LLM path, so this needs a CORS and Worker decision first, because extension-to-proxy calls would be new network calls. A smaller first step is importing a Dovetailed JSON backup, which needs no network. Both need user approval before they start.

## Task 4.5: Field detection

**Goal:** A pure, tested function finds the application form on a page and says what each field is. It changes nothing on the page.

**Files to touch:** `extension/src/autofill/detect.ts`, `extension/src/autofill/detect.test.ts`, `extension/src/autofill/fixtures/`.

**Doc sections to read:** This plan: Phase 3, including both evidence tables and all rules.

**Steps:**
1. Collect fields, walking open shadow roots.
2. Read each field's signals in this order: `autocomplete`, `name`/`id`, bound `<label>`, nearby text, `placeholder`, `aria-label`.
3. Classify into: firstName, lastName, fullName, email, confirmEmail, phone, phoneCountry, street, city, stateProvince, country, postalCode, location, currentCompany, currentTitle, linkedin, github, portfolio, website, twitter, facebook, expectedSalary, noticePeriod, or unknown.
4. Choose the scope: the container with the most identity fields. Fields outside it are ignored. Trap fixtures: the trellis.ph footer newsletter email, and Teamtailor's visible employee email input `full_email` ("Email address without domain").
5. Negative terms beat a match: referr, reference, emergency, manager, employee, spouse, guardian, password. Skip EEO fields, passwords and hidden fields. Skip any `tel` or search input inside a phone picker's dropdown.
6. Mark required fields, so required unknown fields can be reported.
7. Write fixtures by hand as small HTML files, based on the field lists in this plan. Do not copy site pages. Cover Teamtailor, trellis.ph, Greenhouse, Lever, Ashby, SmartRecruiters (with shadow DOM built in the test) and Workable.

**Done when:** A Vitest test per fixture asserts the classification of every field, including that each trap is ignored. Build and typecheck pass.

**Out of scope:** Writing values, comboboxes, the popup, resume inputs.

## Task 4.6: Filling and popup report

**Goal:** Clicking "Fill this page" fills matched fields, in every reachable frame, and the popup reports what happened.

**Files to touch:** `extension/src/autofill/fill.ts`, `extension/src/autofill/phone.ts`, `extension/src/autofill/select.ts`, their tests, `extension/entrypoints/fill.ts` (replaces `scan.ts`), `extension/entrypoints/popup/App.tsx`.

**Doc sections to read:** This plan: Phase 3 rules, Phase 2 embedded forms and field report.

**Steps:**
1. Set values with the native prototype setter, then dispatch `input` and `change` with `bubbles: true`.
2. Keep non-empty fields. Do not click Continue, Next or Submit. Do not call `submit()` anywhere. Do not touch checkboxes or buttons. Radios only for `noticePeriod`, in a labelled group.
3. Selects: choose the closest option by normalised text. Match country by name or code, and phone country by calling code, ignoring flag emoji. If nothing is close, leave it and report it.
4. Phone: with a separate country control, write the national number. With a `tel` input alone, use the placeholder as a hint: `+` means international, a leading `0` means trunk format, and otherwise international. Use trunk `0` only for countries that use one, from a small table.
5. Comboboxes: set the text, wait up to 2 s for a listbox, click the closest option. If none appears, clear what we typed and report it.
6. Inject with `allFrames: true`. Each frame checks `isBlockedSite(location.href)` first and does nothing on a match. Each frame gets data through `getProfile()`.
7. The popup merges frame results: filled count, required fields left blank (labels only), and fields it could not complete.
8. If a known ATS iframe gave no result, the popup offers a grant button through `browser.permissions.request`, then the user clicks Fill again.
9. Add "Copy field report": field type, classification and label only. It must never contain a value.

**Done when:** Unit tests in jsdom cover the native setter with a React-style value tracker, closest option, each phone format, the keep-non-empty rule, and a test that no submit happens. Build and typecheck pass. A Playwright run on the local fixtures fills them, using a build with a test-only host permission kept in the scratchpad.

**Out of scope:** Resume upload (Phase 4), per-site code.
