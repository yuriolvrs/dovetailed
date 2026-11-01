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
- Link rows: see Task 4.8. This replaces the earlier first-row-only rule, at the user's request after the live trellis.ph test.

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

Approved by the user on 2026-11-01. See Task 4.11. Importing a Dovetailed JSON backup stays a possible later addition.

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

## Task 4.8: All links on repeating link rows

**Goal:** Every saved link fills on forms with type-plus-URL rows, such as trellis.ph.

**Files to touch:** `extension/src/autofill/detect.ts`, `fill.ts`, tests, trellis fixture.

**Steps:**
1. Bug: `kindFromLinkTypeSelect` counts hidden controls. The live trellis.ph row (`.ja-link-row`) has a select, a hidden text input "Ex. Twitter" and a URL input. Ignore hidden controls. Add that hidden input to the fixture.
2. Fill one row per saved link. For each link, set the row's select to the matching type (LinkedIn, Github, Portfolio), else "Other". If "Other" reveals a name input, fill it with the link's label. Then fill the URL.
3. For more links, click an Add button next to the rows and wait up to 1 s for a new row. Click it only if it is a `button` with `type="button"` and its text matches "add link" or "add another". Never click any other button. Stop at 6 links.
4. Leave rows that already hold a URL. Selects may change here only, because the row's type must match its URL.

**Done when:** Tests cover the hidden input, three links filling three rows, "Other" with a label, and a refused `type="submit"` Add button. A live run on trellis.ph fills them.

## Task 4.9: Branding and popup layout

**Goal:** The Dovetailed mark appears on the toolbar, popup and options page, and the popup no longer feels cramped.

**Files to touch:** `extension/public/icon/`, `extension/entrypoints/popup/`, `extension/entrypoints/options/App.tsx`, a small shared logo component.

**Steps:**
1. Build 16, 32, 48 and 128 PNG icons from `public/favicon.svg` in the repo root, and have WXT use them. Keep the committed mark. Do not draw a new one.
2. Show the mark beside the heading in the popup and options page.
3. Popup: about 320px wide, 16px padding, generous gaps. "Fill this page" is the full-width primary action. Options moves to a quiet icon button in the header, with an accessible name. Status lines read as a short list. Result text gets space, and "Copy field report" is a quiet secondary action.

**Done when:** Screenshots of the popup, in light and dark, idle and after a fill with blanks, show no crowding, and contrast is at least 4.5:1.

## Task 4.10: Resume upload (Phase 4)

**Goal:** Fill attaches the stored resume to the right input first, waits for the site, then fills fields, and the popup says what happened.

**Files to touch:** `extension/src/autofill/resume.ts` plus test, `detect.ts`, `fill.ts`, `report.ts`, `entrypoints/fill.ts`, the popup, fixtures.

**Doc sections to read:** This plan: Phase 4.

**Steps:**
1. Add `findResumeInput`. Score by id or name, label, then nearest section heading. Use `accept` only to exclude. Reject cover letter, portfolio, photo, additional files, transcript and references.
2. Prefer a real resume field over a parser-only dropzone. If two candidates tie, attach nothing and report it as ambiguous. Hidden inputs are allowed.
3. Skip the input if it already holds a file.
4. Attach with `DataTransfer` and `input.files`, then dispatch `input` and `change` with `bubbles: true`.
5. Snapshot form values, attach, then poll until values stay stable for 1.5 s, up to 15 s. Fields that hold a value at the snapshot are kept. Fields the parser changed during the wait are replaced with our values. Fields it filled while empty are also replaced.
6. The popup shows: attached with the file name, skipped and why, ambiguous, or no resume stored. Say the file goes to the site as soon as it attaches.
7. Only the frame with the chosen input fetches the resume through `getResume()`.

**Done when:** Tests cover each fixture's choice (Teamtailor CV versus Additional files, Ashby Resume versus Cover Letter versus parser box, trellis hidden input, SmartRecruiters tie goes to ambiguous), and a simulated parser that overwrites fields and then settles. Playwright shows a `File` arrives on a local page with identical bytes.

## Task 4.11: Fill the profile from the resume

**Goal:** On request, the options page reads the stored resume and fills empty profile fields for the user to check before saving. The user asked for this on 2026-11-01, which approves this one network path.

**Files to touch:** `extension/src/lib/resumeImport.ts` plus test, `extension/src/components/ResumeSection.tsx`, `extension/entrypoints/options/App.tsx`, `extension/wxt.config.ts`, `extension/package.json`, `worker/src/lib.ts`, `worker/src/lib.test.ts`, `worker/wrangler.toml`.

**Doc sections to read:** `src/components/profile/ImportResumeSection.tsx` (lines around 100-120 for the read flow), `src/lib/llm.ts`, `src/lib/files/localText.ts`, `src/lib/files/verifyExtraction.ts`, `src/prompts/extractProfile.ts`.

**Steps:**
1. Reuse these from `../src` by relative import: `readTextLocally`, `extractText`, `generateStructured`, `llmErrorMessage`, `buildExtractProfilePrompt`, `isExtractedProfile`, `verifyExtraction`. No provider code in `extension/`. Add `pdfjs-dist` at the root's exact version, and dedupe it.
2. Set the proxy with `vite.define` for `import.meta.env.VITE_PROXY_URL`: `https://dovetailed-proxy.pimp-my-resume.workers.dev` for production builds, `http://localhost:8787` in dev. Do not commit a `.env` file.
3. `mapExtracted(extracted, profile)` is pure, and fills only empty fields:
   - First and last name: the last word is the last name, the rest is the first name. The user checks this.
   - Phone: read `+CC` if present, else strip a leading 0 and leave the calling code empty.
   - Location: split on commas into city and state or province. Match the last part against the country list. Unknown text goes to city.
   - Links through the web app's `toContactLink`. Experience and education appended only when the profile has none.
   - Returns the new profile and the count of fields filled.
4. UI: a secondary action "Fill profile from resume" in the Resume section, shown when a resume is stored. First click shows an inline note with Continue and Cancel: "Your resume's text is sent through the Dovetailed proxy to the AI provider that reads it." Nothing is sent before Continue. Then show progress, then "Filled N fields. Check them, then Save." The result is not saved until the user clicks Save.
5. Keep the anti-fabrication check: drop any value `verifyExtraction` cannot find in the document.
6. Stable Chrome ID: generate an RSA key locally with Node and put the public key in the manifest `key` for Chrome builds only. Do not use the Chrome dashboard, which costs money. Do not keep the private key. Report the resulting ID.
7. Worker: add that exact `chrome-extension://<id>` origin to `ALLOWED_ORIGINS`. Firefox gives each install a random origin, so add one literal entry `moz-extension://*`, matched as a prefix, and no other wildcards. Add tests. All other origins stay refused.
8. Firefox manifest: `data_collection_permissions: { required: ['none'], optional: ['personallyIdentifyingInfo'] }`. Request it at Continue on Firefox. Verify the API against MDN before writing it.

**Done when:** Tests cover `mapExtracted` (keeps existing values, multi-word names, each phone form), worker origins (allowed, refused, wildcard limited to moz-extension), and that no request happens before Continue. Worker `npm run test` and `npm run typecheck` pass. Playwright with an intercepted proxy route fills the form and leaves stored data unchanged until Save. Chrome's real ID equals the computed one.

**Out of scope:** Deploying the Worker. Only the main session does that, after the user confirms in this session. Do not run `wrangler deploy`. Do not edit the About page or README privacy text.

## Task 4.12: Optional in-page Fill button

**Goal:** With an off-by-default setting on, a small Dovetailed button appears when the user clicks into a field on a detected application form.

**Files to touch:** `extension/entrypoints/hint.ts`, `extension/src/autofill/hint.ts` plus test, `extension/entrypoints/background.ts`, `extension/src/components/` (the setting), `extension/entrypoints/options/App.tsx`, `extension/wxt.config.ts`, and a shared `runFill` used by this and `entrypoints/fill.ts`.

**Steps:**
1. Add `*://*/*` to `optional_host_permissions`. Do not add `host_permissions`, so nothing changes at install.
2. Add a setting section "Show Fill button on application forms", off by default, with the note that Chrome will ask for access to all sites. It is stored through the data layer.
3. Turning it on calls `permissions.request` from the click. If refused, it stays off. On success, register `hint.js` with `scripting.registerContentScripts`: `document_idle`, all frames, with `excludeMatches` for Indeed and LinkedIn. Turning it off unregisters the script and removes the permission. The background re-checks this on startup.
4. `hint.ts` checks `isBlockedSite` first. On `focusin` on a text-like field, debounced, it runs detection. Never on password fields. It does not call `getProfile()` or read values until the button is pressed.
5. The button sits inside the focused field's right edge, in an open shadow root with the mark, an accessible name "Fill with Dovetailed", and a dismiss control. Dismissal lasts for that page.
6. A click runs `runFill` only if `event.isTrusted`. A page must not be able to trigger a fill by script and read the values.
7. After a fill, show a short result by the button: filled count and required blanks.
8. No network calls. It follows every Phase 3 and 4 rule, including resume upload.

**Done when:** Tests cover: no button on a non-form, password focus or blocked site; a synthetic click does nothing; no profile read before a trusted click. Playwright shows a real click fills a fixture, and that toggling off removes the script. Screenshots in light and dark on a white and a dark page.

**Out of scope:** Auto-filling on page load, and any banner that interrupts the page.

## Task 4.13: Phone country picker

**Goal:** The user picks a country by name, flag or digits, and the calling code follows, in place of a typed number.

**Files to touch:** `extension/package.json`, `extension/src/lib/callingCodes.ts` (new) plus test, `extension/src/types/profile.ts`, `extension/src/lib/phone.ts` plus test, `extension/src/components/ProfileEditor.tsx`.

**Doc sections to read:** `docs/DECISIONS.md`, entry "Extension profile schema and blocked sites".

**Steps:**
1. Add `libphonenumber-js` (MIT, checked on npm). Read the installed package for the real API. Use its `min` metadata. Do not write a table by hand.
2. Add `callingCodes.ts`. It is imported by the options page only, so the library never enters `fill.js` or `hint.js`. Give it `callingCode(code)`, `listPhoneCountries(countries)` (only countries with a calling code; `name` becomes "Philippines (+63)", so the existing search also finds digits) and `phoneCountry(phone, addressCountry)`.
3. `phoneCountry` returns the first of these whose calling code equals the stored code: `phone.countryCode`, then the address country, then the library's main country for that code (US for 1, GB for 44, RU for 7), never the first by alphabet. Empty code gives undefined. Check how the metadata exposes the main country.
4. Add optional `countryCode?: string` to `PhoneNumber`, an ISO code for display, because +1 and others are shared. `cleanPhone` keeps it. Filling ignores it. No version bump: old profiles have none.
5. In `ProfileEditor`, replace the Calling code input with `CountryCombobox`, label "Phone country", no change to the combobox. Selecting sets `countryCode` and `countryCallingCode`; clearing empties both. Use two equal columns, stacked on narrow widths. Change the hint to "Digits only. A leading 0 is removed when you save."
6. When the address Country changes and the stored calling code is empty, set the phone country from it. Never overwrite a chosen one.

**Done when:** Vitest covers `callingCode`, `listPhoneCountries`, all three `phoneCountry` routes including a shared code, and `cleanPhone` keeping `countryCode`. `npm run test`, `npm run typecheck` and `npm run build` pass from `extension/`. `.output/chrome-mv3/fill.js` and `hint.js` do not contain the library.

**Out of scope:** `parsePhone` in `resumeImport.ts`, `CountryCombobox.tsx`, `hint.ts`, `FillButtonSection.tsx`, the filling code and any other edits in progress in this checkout. Do not commit.
