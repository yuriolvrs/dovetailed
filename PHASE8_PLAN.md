# Phase 8 Plan — File attachments (stop typing everything in)

Status: **plan only, nothing built.** One blocking verification before 8A starts (see "Provider decision").

## Goal

Let the user attach files instead of hand-typing every input: an existing resume to fill the Profile, a PDF/screenshot of a job posting instead of pasting text, supporting job-description docs, and past writing for cover-letter style mimicry. Files are read, converted to text/structured data, reviewed by the user, then applied to the existing Dexie-backed models. Everything downstream (analysis, matching, resume selection, cover letter, LaTeX fill) is unchanged.

## How we got to the provider decision

The user's initial choice was "multimodal model reads the file." Verifying that against provider terms produced a constraint chain worth recording, because it eliminated the obvious options:

1. **Groq (current provider) can't do it.** Its production model list is text + Whisper audio only — no vision, no document input. So the existing `/generate` path cannot read a file at all.
2. **Gemini free tier is disqualified by PRD §10.** Google's [Gemini API terms](https://ai.google.dev/gemini-api/terms) state that for Unpaid Services, "Google uses the content you submit ... to provide, improve, and develop Google products and services and machine learning technologies," that "human reviewers may read, annotate, and process your API input and output," and — explicitly — "Do not submit sensitive, confidential, or personal information to the Unpaid Services." A resume is name, phone, email, and full employment history. PRD §10 requires providers "whose terms do not permit training on API data." Free-tier Gemini fails that outright.
3. **Paid tiers are out** by explicit user instruction: free only, never consider paid.
4. **Gemini also can't read DOCX.** Its docs say document vision "only meaningfully understands PDFs"; other types degrade to plain text.

That leaves Mistral Document AI as the only candidate that is free, multimodal, and format-complete.

## Provider decision

**Primary: Mistral Document AI (OCR), free Experiment tier — pending one verification.**

- Accepts PDF, DOCX, PPTX, and images (PNG/JPEG/AVIF) natively. Covers every format the user asked for, and DOCX natively means **no `mammoth` dependency**.
- Returns markdown text, which is exactly the handoff we want (see Architecture).

**GATE — CLEARED 2026-08-16.** At `https://admin.mistral.ai/plateforme/privacy` (Admin Panel › API › Privacy), the setting "Data usage for improving our services" → *"Allow the use of your API calls to train Mistral's AI models"* **exists on the free plan and has been switched off**, confirmed by screenshot. Per Mistral, "if you disable this option, your new interactions ... will not be used to train our models." This is what keeps PRD §10's no-training rule true, and it is the reason Mistral was chosen over Gemini.

Two caveats the toggle does **not** cover, both of which must reach the About page rather than being glossed:

- **Labs models are exempt.** Mistral's docs state Labs models "can be used to train Mistral models, regardless of your subscription plan or opt-out settings," per their Commercial ToS. **Constraint going forward: production models only.** `mistral-ocr-latest` is production Document AI, but any future model swap must re-check this.
- **Opt-out is not zero retention.** Free-tier API data is reportedly still held ~30 days for abuse monitoring; Zero Data Retention is a paid Scale-plan feature. Documents aren't training material, but they aren't instantly discarded either.

The toggle is an org-level account setting that could be re-enabled or reset, so the README should record the date it was verified (above) rather than treating it as permanent.

**Fallback, if that setting is ever reversed:** browser-side extraction only — `pdf.js` for text-layer PDFs, `mammoth` for DOCX, plain read for TXT/MD, with **no image/scanned-PDF support**. Extracted text then goes to Groq exactly like typed text does today. Strictly a subset of the same UI and pipeline, so only the extraction layer swaps.

## Architecture

The key move is a **clean split between reading and structuring**, so none of the existing, hard-won prompt calibration is disturbed:

- **Mistral = file → text.** OCR only. No reasoning, no JSON, no schema. It transcribes the document to markdown.
- **Groq `openai/gpt-oss-120b` = text → structured JSON.** The existing, already-calibrated path. Every extraction prompt is a text prompt, so `estimateConversionMaxTokens`-style budget work, `generateStructured`'s retry, `json.ts`'s balanced-scan parser, and `fixMojibake` all keep working untouched.

This also means Mistral only ever sees the raw document and never the profile, and the fallback path above becomes a drop-in (browser-side text replaces OCR text; stage two is identical).

### Worker

New endpoint `POST /extract`, kept entirely separate from `/generate` so the working text path cannot regress.

- Forwards to Mistral's OCR endpoint with `MISTRAL_API_KEY` injected server-side. Stateless as always: forward, return, forget.
- **Inline base64 only. Never a provider file-storage/upload API** — those persist documents server-side (Gemini's Files API, for reference, stores for 48 hours). Inline keeps "nothing is stored on a server" true.
- Needs its own body cap. The current `MAX_BODY_BYTES = 100_000` is right for `/generate` and far too small for a base64 file (~33% inflation). `/extract` gets a separate, much larger cap; the client rejects oversize files before upload so the worker isn't the first line of defense.
- Needs its own rate-limit bucket — OCR calls are heavier and rarer than the burst of per-requirement matching calls the existing 60/min limit was tuned for.
- `env` gains `MISTRAL_BASE_URL`, `MISTRAL_OCR_MODEL`; secret `MISTRAL_API_KEY` via `wrangler secret put`.

### Client

- `src/lib/llm.ts` stays the single provider abstraction per CLAUDE.md. It gains one file-aware function (`extractText(file)`) alongside `generate`/`generateStructured`. No provider-specific code anywhere else.
- `src/lib/files/readFile.ts` — `File` → `{ name, mimeType, base64, size }`, plus format routing and size/type validation. Pure and unit-testable apart from the `FileReader` call.
- TXT/MD skip OCR entirely — read as text in the browser, go straight to stage two. No reason to send bytes.

### Formats

| Format | Path | Notes |
|---|---|---|
| PDF | Mistral OCR (inline base64) | Text-layer and scanned both work |
| PNG / JPG | Mistral OCR (inline base64) | Screenshots of postings |
| DOCX | Mistral OCR (inline base64) | Native — no `mammoth` needed |
| TXT / MD | Read in browser, no OCR | Straight to stage two |

Verify Mistral's exact max file size and page count at build time — the overview doc 404'd during research and the limits were not confirmed.

## Attach points

Confirmed by the user:

1. **Existing resume → Profile.** The biggest win and the hardest parse: file → text → `Profile`-shaped JSON (contact, `SkillGroup[]`, experience, projects, education). Fabrication-sensitive; see below.
2. ~~**Job posting → posting text.**~~ **Built in 8B, then removed 2026-08-16 per explicit user decision: job postings are paste-only.** The dropzone in the Add Job Posting modal and the "supporting document" attach on Job Detail (which also appended into `rawText`) were both taken out. `guessJobTitleAndCompany` still runs on paste, unchanged.
3. ~~**Job description docs → posting.**~~ Removed with #2 — same reason, same code path.
4. **Writing samples → Profile.** Extract text, append to `profile.writingSamples`. Trivial once the pipeline exists — no structuring stage, just transcription.

Additional manual-typing removals worth including, per the user's "others you can think of":

5. **`.tex` template file picker.** `TexTemplateSection` is paste-only today. Reading a `.tex` file into the existing textarea is a file read with no LLM, no OCR, and no new pipeline — highest value-per-effort item in this whole plan.
6. **Additional information / accomplishments doc.** Same shape as writing samples (extract text, append to `profile.additionalInfo`), so it comes nearly free once #4 exists.
7. **Transcripts / certificates → Education.** Folds into the resume extractor's education handling rather than being its own flow.

Explicitly **not** in scope: fetching a job posting by URL. That would be a network call beyond the LLM proxy, which CLAUDE.md prohibits without explicit approval, and browser CORS blocks most job boards anyway.

## Anti-fabrication

This is the main risk, given the Phase 4 history where LLM rewriting invented Java/Spring claims from the word "JavaScript."

Extraction is **transcription, not generation** — every extracted field must be copied from the document, never embellished, and prompts must say so in those terms.

Two-tier verification, mirroring `isResumeContentVerbatim`'s existing approach:

- The OCR markdown text is the **verification corpus**. After stage two structures it, programmatically check that each extracted string actually appears in that corpus. Anything that doesn't is flagged, not silently accepted.
- Anything unverifiable is surfaced as such in the review screen rather than presented as trustworthy — the same "flag, don't block" pattern the cover letter's amber badge already uses.

**Review before apply, always.** An uploaded resume never overwrites the profile directly. It lands in a review screen (reusing `Modal`, `Card`, and the existing profile form components) showing what was extracted section by section, with per-section apply control. **Merge, never wipe** — an existing filled profile is never clobbered by an upload. This matches the codebase's established ethos: analysis is editable, the LaTeX template is reviewable before save, a stale generation shows a rebuild notice.

*Assumption flagged for confirmation: merge-not-replace and per-section review are my call, not something you specified. Say so if you want upload to just overwrite.*

## Privacy contract changes

The user chose "soften the wording only" — zero server-side storage, but be honest that content goes to an LLM provider. Concretely:

- **PRD §10** — keep the no-training rule (line 114) intact; it is now the reason Gemini was rejected, which is worth a sentence. Add that attached files transit the proxy inline and are never sent to a provider's file-storage API.
- **About page** — state plainly: content you type *or attach* is sent to an LLM provider to process; nothing is stored on any server we run; name both providers (Groq for text, Mistral for document reading) and their data policies, including Mistral's ~30-day abuse-monitoring retention.
- **README** — document the chosen providers and policies per PRD §10, plus the date the Mistral privacy toggle was verified.
- These are wording and documentation changes only. No architectural invariant is broken: storage stays local, the proxy stays stateless, the frontend still holds no key.

## Sub-phases

Each has a concrete check, per CLAUDE.md's goal-driven execution rule.

- **8A — Plumbing.** Worker `/extract`, Mistral env/secret, `llm.ts`'s `extractText`, `readFile.ts`, separate body cap and rate bucket. *Check:* one hardcoded PDF round-trips to correct markdown text through the real worker; `/generate` regression-tested unchanged.
- **8B — Posting attachment.** Shared `FileDropzone` primitive (matching existing `Card`/`Btn` styling) + posting upload wired into the Jobs add-posting modal. *Check:* upload a PDF printout and a PNG screenshot of a real posting, confirm `rawText` fills and existing analysis runs on it unchanged.
- **8C — Resume → Profile.** Extraction prompt, validator, verbatim checker, review/merge screen. *Check:* upload a real resume against a non-empty profile; confirm nothing is overwritten without consent, confirm a deliberately unverifiable claim gets flagged.
- **8D — Cheap text paths.** Writing samples, additional info, `.tex` file picker, JD supporting docs. *Check:* each appends correctly and survives reload.
- **8E — Docs.** PRD §10, About, README, PROGRESS. *Check:* no claim in any doc contradicts the shipped behavior.

Order matters: 8B before 8C deliberately — it is the smallest change that produces real user value and it exercises the whole pipeline before the fabrication-sensitive parser is built on top.

## Tests

Per CLAUDE.md (schema validation required; all LLM calls mocked):

- `readFile.ts` — format routing, size/type rejection, base64 correctness.
- Extraction validators — the `Profile`-shaped and posting-shaped type guards, including malformed-shape rejection so `generateStructured`'s retry engages.
- Verbatim checker — extracted-string-present-in-corpus, including the flagging path.
- Merge logic — merge-not-replace behavior against a populated profile.
- Worker — `/extract` body cap, rate bucket, CORS, and that `/generate` behavior is untouched.

## Risks

- **The Mistral privacy toggle may not exist on free.** Fully mitigated by the browser-side fallback, which is a subset of the same design. This is why it's a blocking pre-check rather than a discovery mid-build.
- **Mistral free-tier limits are unpublished/unverified.** Confirm RPM/RPD and file size/page caps before relying on them.
- **Two providers, two failure modes.** `llmErrorMessage` needs to cover Mistral's error shape as well as Groq's.
- **OCR quality on multi-column resumes.** The classic failure mode of resume parsing. The review screen is the mitigation — the user sees and fixes it before anything is applied.
- **Scope.** Seven attach points is a lot. 8B alone delivers most of the day-to-day benefit; 8D items are near-free; 8C is the only genuinely hard one.

## Verified API contract

Confirmed against [Mistral's OCR docs](https://docs.mistral.ai/capabilities/OCR/basic_ocr/) — do not code against anything else without re-verifying.

**Endpoint:** `POST https://api.mistral.ai/v1/ocr`, `Authorization: Bearer <key>`

**Request:**
```json
{
  "model": "mistral-ocr-latest",
  "document": { "type": "document_url", "document_url": "data:application/pdf;base64,<b64>" }
}
```

The `document` field splits by kind, which is the one real quirk to handle:
- `type: "document_url"` + `document_url` — PDF, DOCX, PPTX
- `type: "image_url"` + `image_url` — PNG, JPEG, AVIF

Both take a base64 **data URI**, not a raw string. Inline only — never the upload/file API, which would persist the document provider-side.

**Response:** `{ pages: [{ index, markdown, ... }], model, usage_info }` — text lives in `pages[].markdown`, joined in page order.

**Still unverified:** max file size and page count. The overview doc 404'd. Confirm before setting the client-side cap; until then assume conservative.

## Implementation plan

### Seam design

One rule governs the file layout: **only two files may know that Mistral exists** — the worker's `/extract` handler and `llm.ts`'s `extractText`. Everything else consumes `File → string` and cannot tell OCR from browser-side parsing. That's what makes the fallback (if the privacy toggle fails) a swap of two files rather than a rewrite, and it's what keeps CLAUDE.md's "no provider-specific code elsewhere" true with two providers in play.

### New files

| File | Purpose |
|---|---|
| `src/lib/files/readFile.ts` | `File` → `{ name, mimeType, base64, size }`. Format classification (document / image / text / unsupported) with extension fallback, since browsers report empty or wrong MIME for `.md` and `.tex`. Size and type validation. |
| `src/lib/files/readFile.test.ts` | Classification, extension fallback, size/type rejection. |
| `src/components/ui/FileDropzone.tsx` | Shared drag-and-drop + click-to-browse input, styled to the existing `Card`/`Btn` idiom. Used by every attach point. Native HTML5 drag, no new dependency — `EditableList` already sets that precedent. |
| `src/prompts/extractProfile.ts` | Stage-two prompt: OCR markdown → `Profile`-shaped JSON. Plus `isExtractedProfile` structural validator for `generateStructured`'s retry. |
| `src/prompts/extractPosting.ts` | Stage-two prompt: OCR markdown → `{ title, company, location, arrangement, rawText }` + validator. |
| `src/lib/files/verifyExtraction.ts` | The anti-fabrication checker: every extracted string must appear in the OCR corpus. Returns per-field verified/unverified, mirroring `isResumeContentVerbatim`. |
| `src/lib/files/mergeProfile.ts` | Merge extracted profile into existing profile, per-section, never destructive. Pure and fully unit-testable. |
| `src/components/profile/ImportReviewModal.tsx` | The review-before-apply screen. Reuses `Modal` + the existing profile form components rather than inventing new editors. |

### Modified files

| File | Change |
|---|---|
| `worker/src/lib.ts` | Add `OCR_DOCUMENT_MIME_TYPES` / `OCR_IMAGE_MIME_TYPES`, `buildOcrDocument(mime, base64)` → the `document` field or null, `isExtractRequest` body guard. All pure, all testable. |
| `worker/src/index.ts` | Lift the existing `/generate` body out of `fetch()` into `handleGenerate` unchanged, add `handleExtract`, route on pathname. Client sends only `{ mimeType, base64 }` — the worker builds the provider request so the model can't be spoofed, same invariant `/generate` already holds. |
| `worker/src/lib.test.ts` | Tests for the three new helpers. |
| `worker/wrangler.toml` | `OCR_BASE_URL`, `OCR_MODEL` vars. `MISTRAL_API_KEY` is a secret — never in this file. |
| `worker/.dev.vars.example` | Document `MISTRAL_API_KEY` alongside `LLM_API_KEY` (placeholder only — a real key was once committed here by accident; see PROGRESS.md). |
| `src/lib/llm.ts` | Add `extractText(file)`: POST to `/extract`, join `pages[].markdown`. Reuses the existing 429 retry/backoff. Extend `llmErrorMessage` to cover OCR failures. |
| `src/pages/JobsPage.tsx` | `FileDropzone` in the add-posting modal. |
| `src/pages/ProfilePage.tsx` | Resume upload entry point + review modal wiring. |
| `src/components/profile/TexTemplateSection.tsx` | `.tex` file picker into the existing textarea. No LLM, no OCR — a plain text read. |
| `src/components/profile/WritingSamplesForm.tsx` | Attach-file → append extracted text. |

### Two separate size caps

`MAX_BODY_BYTES = 100_000` is correct for `/generate` and must not move. `/extract` needs its own constant (base64 inflates ~33%), deliberately a separate name so raising one can never loosen the other. Same for rate limiting: file reads are heavy and human-paced, so they get their own smaller bucket rather than sharing the 60/min headroom that exists for matching bursts.

### Step-by-step

Each step ends with the app building and the full suite green.

---

#### 8A-1 · `worker/src/lib.ts` — pure OCR helpers

Append below `isOversized` (no existing code touched):

```ts
export const OCR_DOCUMENT_MIME_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',   // .docx
  'application/vnd.openxmlformats-officedocument.presentationml.presentation', // .pptx
] as const;

export const OCR_IMAGE_MIME_TYPES = ['image/png', 'image/jpeg', 'image/avif'] as const;

export type OcrDocument =
  | { type: 'document_url'; document_url: string }
  | { type: 'image_url';    image_url: string };

export function buildOcrDocument(mimeType: string, base64: string): OcrDocument | null;

export interface ExtractRequest { mimeType: string; base64: string }
export function isExtractRequest(body: unknown): body is ExtractRequest;
```

`buildOcrDocument` composes `data:${mimeType};base64,${base64}` and picks the field by list membership, returning `null` for anything unsupported. `isExtractRequest` requires both fields to be strings with a non-empty `base64` — the client sends nothing else, so it cannot pick a model or inject provider params.

**Tests** (`worker/src/lib.test.ts`): PDF → `document_url`; PNG → `image_url`; DOCX → `document_url`; unknown MIME → `null`; data-URI prefix is exactly right; `isExtractRequest` rejects missing/empty/non-string fields.

---

#### 8A-2 · `worker/src/index.ts` — the `/extract` route

1. `Env` gains `OCR_BASE_URL: string`, `OCR_MODEL: string`, `MISTRAL_API_KEY: string`.
2. New module constants, deliberately named apart from the text ones so raising one can never loosen the other:
   ```ts
   const MAX_EXTRACT_BODY_BYTES = 22_000_000;        // base64 inflates ~33%
   const EXTRACT_RATE_LIMIT_MAX_REQUESTS = 12;       // vs 60 for /generate
   const extractRateLimiter = new RateLimiter(RATE_LIMIT_WINDOW_MS, EXTRACT_RATE_LIMIT_MAX_REQUESTS);
   ```
3. **Refactor, behavior-identical:** move the current body of `fetch()` (from the rate-limit check down) into `handleGenerate(request, env, cors, ip)`. Not one line of its logic changes — this is purely so two routes can coexist.
4. Routing becomes: method must be POST, then dispatch `/generate` → `handleGenerate`, `/extract` → `handleExtract`, else 404. Note the existing check is `pathname !== '/generate' || method !== 'POST'`, so the method test must be split out first or `/extract` is unreachable.
5. `handleExtract(request, env, cors, ip)` in order: rate bucket → 429 · oversize → 413 · JSON parse → 400 · `isExtractRequest` → 400 · `buildOcrDocument` → **415** (new status for this app; unsupported file type is genuinely distinct from malformed) → `POST ${env.OCR_BASE_URL}/ocr` with `{ model: env.OCR_MODEL, document }` → relay body and status unchanged, exactly as `/generate` does.

The worker never parses the OCR response. Relaying raw keeps the Phase 2 contract and keeps provider-shape knowledge in `llm.ts`.

---

#### 8A-3 · Worker config

- `wrangler.toml`: add `OCR_BASE_URL = "https://api.mistral.ai/v1"` and `OCR_MODEL = "mistral-ocr-latest"`, with a comment citing the docs URL and the inline-only/no-file-API rule.
- `.dev.vars.example`: add `MISTRAL_API_KEY=` **placeholder only.**

---

#### 8A-4 · `src/lib/files/readFile.ts` — new

```ts
export type FileKind = 'document' | 'image' | 'text' | 'unsupported';

export interface Attachment { name: string; mimeType: string; base64: string; size: number }

export const MAX_FILE_BYTES = 15_000_000;   // conservative: Mistral's real cap is unverified

export function normalizeMimeType(name: string, mimeType: string): string;
export function classifyFile(name: string, mimeType: string): FileKind;
export function validateFile(file: File): string | null;   // human-readable error, or null if OK
export async function fileToBase64(file: File): Promise<string>;
export async function readAttachment(file: File): Promise<Attachment>;
```

`normalizeMimeType` exists because browsers report `''` or `application/octet-stream` for `.md`, `.tex`, and sometimes `.docx` — it falls back to the file extension. Everything except `fileToBase64`/`readAttachment` is pure and directly testable; `fileToBase64` is the only `FileReader` touch and strips the `data:...;base64,` prefix so callers get a bare payload.

**Tests** (`readFile.test.ts`): each MIME → correct kind; extension fallback for empty/octet-stream MIME on `.md`/`.tex`/`.docx`; oversize rejection message; unsupported-type rejection message.

---

#### 8A-5 · `src/lib/llm.ts` — `extractText`

```ts
export async function extractText(file: File, options?: { signal?: AbortSignal }): Promise<string>;
```

- `classifyFile(...) === 'text'` short-circuits entirely — `await file.text()`, no network, no OCR. TXT/MD never leave the browser.
- Otherwise `readAttachment` → POST `/extract` → parse `interface OcrResponse { pages?: { index?: number; markdown?: string }[] }` → join `pages[].markdown` in index order with `\n\n`. Empty/missing pages throws, mirroring `generate()`'s "response had no content".
- **Small refactor:** `generate()`'s inline 429 retry/backoff loop moves into a private `postWithRetry(path, body, signal)` so `/extract` gets identical rate-limit handling for free. `generate()`'s observable behavior is unchanged.
- `llmErrorMessage` gains a branch for OCR failures so the two providers produce one consistent message shape.

**Tests:** mock `fetch`; page joining and ordering, text short-circuit makes no network call, empty-pages throws.

---

#### 8B · Posting upload

**`src/components/ui/FileDropzone.tsx` — new**
```tsx
export function FileDropzone({ onFile, accept, busy, label, sublabel }: {
  onFile: (file: File) => void;
  accept?: string;
  busy?: boolean;
  label?: string;
  sublabel?: string;
}): JSX.Element
```
Dashed-border drop target matching the Jobs empty state, click-to-browse via a hidden `<input type="file">`, native HTML5 drag events (no dependency — `EditableList` already set that precedent), spinner + disabled while `busy`.

**`src/pages/JobsPage.tsx`** — `FileDropzone` above the posting textarea in the add-posting modal. On file: `validateFile` → error inline, or `extractText` → append to the textarea (`prev ? prev + '\n\n' + text : text`, never clobbering typed text) → run the existing `guessJobTitleAndCompany` on the result so Title/Company prefill exactly as they do for a paste. No change to `jobStore`, analysis, or matching.

---

#### 8C-1 · Resume extraction logic (no UI)

**`src/prompts/extractProfile.ts` — new**
```ts
export function buildExtractProfilePrompt(documentText: string): string;
export interface ExtractedProfile {
  contact: Partial<Contact>;
  skills: SkillGroup[];
  experience: ExperienceEntry[];
  projects: ProjectEntry[];
  education: EducationEntry[];
}
export function isExtractedProfile(x: unknown): x is ExtractedProfile;
```
The prompt frames the job as **transcription, not writing**: copy text verbatim, never rephrase or embellish, omit anything absent rather than inferring it. Types reuse `src/types/` — no parallel shapes. Length-capped input like `analyzePosting.ts` does. Element-type-checked validator so malformed arrays trigger `generateStructured`'s retry instead of reaching the UI.

**`src/lib/files/verifyExtraction.ts` — new**
```ts
export interface UnverifiedField { path: string; text: string }
export function normalizeForCompare(s: string): string;
export function isPresentInCorpus(value: string, corpus: string): boolean;
export function verifyExtractedProfile(p: ExtractedProfile, corpus: string): UnverifiedField[];
```
Normalizes whitespace, case, and smart punctuation (same normalization idea `ResumeEditor`'s badge matching already uses), then checks each extracted string against the OCR markdown. `path` is a dotted locator like `experience.1.bullets.0` so the review UI can point at the exact field. Returns a list to flag — it never blocks.

**Confirmed by live testing (2026-08-16):** the reader returns **markdown, not plain text** — a heading came back as `# HELLO EXTRACT TEST 12345`, and real documents will carry `**bold**`, `-` bullets, and table pipes. So `normalizeForCompare` must strip markdown syntax as well as whitespace/case, or every extracted field will false-flag as unverified against a corpus whose copy of the same text is decorated. This is the single highest-risk detail in 8C and is why the verifier gets its own tests before any UI is built.

**Tests:** verbatim bullet passes; invented bullet is flagged; whitespace/case/curly-quote differences do **not** false-flag; empty corpus flags everything.

**`src/lib/files/mergeProfile.ts` — new**
```ts
export type SectionKey = 'contact' | 'skills' | 'experience' | 'projects' | 'education';
export type DuplicateAction = 'append' | 'replace' | 'skip';

export interface DuplicateHit {
  section: SectionKey;
  extractedIndex: number;
  existingIndex: number;
}

/** Flags extracted entries that look like ones already in the profile, before any merge happens. */
export function findDuplicates(existing: Profile, extracted: ExtractedProfile): DuplicateHit[];

export function mergeProfile(
  existing: Profile,
  extracted: ExtractedProfile,
  sections: SectionKey[],
  resolutions: Record<string, DuplicateAction>,   // keyed by `${section}.${extractedIndex}`
): Profile;
```
Only listed sections are touched. List sections **append**; contact fills **only empty** fields. `findDuplicates` reuses the same tuple keys `BulletPicker` matches on — `(company, title, dates)` for experience, `(name, description)` for projects — normalized for case/whitespace. Unresolved duplicates default to `append`, so the function is never destructive on its own; `replace` only happens when the review screen passes it explicitly. Pure, synchronous, no Dexie — same shape as `selectResumeContent.ts`.

**Tests:** unselected sections byte-identical; existing entries never dropped on append; `replace` swaps in place without reordering; `skip` leaves the profile untouched; a populated contact field is never overwritten; duplicate matching is case/whitespace insensitive but doesn't false-positive on a genuinely different role at the same company; empty profile behaves as plain import.

---

#### 8C-2 · `src/components/profile/ImportReviewModal.tsx` — new

Built on the existing `Modal`. Per-section checkbox list, each showing what would be added and an amber "not found in the document" badge on anything `verifyExtractedProfile` flagged — the same flag-don't-block treatment the cover letter already uses. Apply calls `mergeProfile` then `saveProfile`; Cancel discards. Reuses existing profile form components for previewing rather than inventing new editors.

**`src/pages/ProfilePage.tsx`** — an "Import from resume" `FileDropzone` in the Contact section (top of the left rail's order), opening this modal on success.

---

#### 8D · Cheap text paths

- **`TexTemplateSection.tsx`** — `.tex` file picker into the existing raw textarea. Plain `file.text()`; **no OCR, no LLM.** Smallest change here, highest value-per-line.
- **`WritingSamplesForm.tsx`** — attach → `extractText` → append as a new sample.
- **Additional information** (`MatchingReviewPage`) — attach → `extractText` → append.
- **JD supporting doc** (`JobDetailPage`) — attach → `extractText` → append to posting text, so analysis sees it.

---

#### 8E · Docs

`PRD.md` §10 (keep the no-training rule; note it's what disqualified Gemini; state inline-only file transit), About page, `README.md` (both providers + policies + toggle-verified date), `PROGRESS.md` session log.

---

### Live verification

Per the `verify` skill and this project's practice, 8B/8C/8D each get a Playwright pass against the running app with real files, not just green unit tests. The real risks here — multi-column resume parsing, screenshot OCR quality — are exactly what fixture tests cannot catch.

## Decisions (settled 2026-08-16)

1. **Originals are discarded.** A file is read, extracted, and dropped — never persisted to Dexie. Re-uploading is cheap and file blobs would bloat the Phase 1 export/import backup.
2. **Append by default, with duplicate detection.** An upload never destroys existing profile data. Extracted entries append; anything that looks like an entry already present is *flagged in the review screen* with a Replace/Skip choice rather than silently duplicated. Duplicate matching reuses the tuple keys `BulletPicker` already uses — `(company, title, dates)` for experience, `(name, description)` for projects — rather than inventing a second matching scheme. Contact scalars fill only-if-empty. On an empty profile (the dominant case) this is indistinguishable from a plain import.
3. **No `SCHEMA_VERSION` bump.** Following from #1, extraction adds no new persisted shape.
