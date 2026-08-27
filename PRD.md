# PRD — Job Application Assistant

## 1. Overview

A privacy-first web app that helps a job seeker tailor their resume and cover letter to a specific job posting. The user stores their profile (skills, experience, education) once; for each job, they paste the posting, and the app generates a tailored resume and cover letter grounded strictly in their real profile data. All user data lives in the browser (IndexedDB). A tiny stateless edge proxy forwards LLM requests so users never handle API keys.

**Audience:** the developer and friends. Personal/portfolio project; commercial use is a possible later step, not a current requirement.

## 2. Goals

- End-to-end v1 workflow: paste job posting → select/enter profile → generate tailored resume + cover letter → edit fields → export PDF and .tex.
- Zero server-side storage of user data. The proxy is stateless: no logging of request bodies, no persistence.
- Zero cost to operate: free-tier LLM provider, free-tier hosting.
- No fabrication: every generated claim must trace back to something in the user's profile.

## 3. Non-goals (v1)

- No accounts, auth, or multi-device sync.
- No screenshot/PDF input of job postings (v2).
- No resume-PDF parsing for profile import (v2) — v1 profile entry is manual/structured.
- No in-app LaTeX compilation — the app exports .tex for the user to compile in Overleaf; the default export path is HTML print-to-PDF.
- No WYSIWYG document editor — editing happens on structured fields, and documents re-render from data.
- No mobile-native app.

## 4. User stories (v1)

1. As a user, I enter my profile once (contact info, skills, work experience, projects, education, writing samples) and it persists locally.
2. As a user, I paste a job posting as text and get an analysis: role summary, key requirements, keywords, and which of my profile items match or are missing.
3. As a user, I generate a tailored resume: the app selects and rewrites bullets from my profile to emphasize fit, without inventing anything.
4. As a user, I generate a tailored cover letter that optionally mimics my writing style based on my stored writing samples.
5. As a user, I edit any generated field inline and the document re-renders instantly.
6. As a user, I export the resume as PDF (via print-friendly HTML) and as a filled .tex file based on a LaTeX template I pasted in.
7. As a user, I export all my data to a JSON file and import it on another machine/browser. (Required in v1 — local-only storage means cleared browser data is otherwise unrecoverable.)
8. As a user, I keep a local history of postings and generations per job.

## 5. v2 candidates (do not build yet)

- Job posting input via screenshot/PDF (vision model call).
- Profile import by parsing an uploaded resume PDF.
- Multiple saved profiles / personas.
- Optional local-model mode (Ollama) for power users.

Application tracker was pulled forward out of this list and built 2026-08-19 by explicit user request (overriding the "do not build yet" deferral) -- see PROGRESS.md.

A second generation route ("direct"/holistic selection) was added 2026-08-28 by explicit user request. It was never in this PRD: the original spec assumes one path (posting -> requirements -> per-requirement matching -> selection). The direct route replaces the middle two steps with a single LLM call that reads the posting and the whole profile and returns the atom ids to feature, plus a display-only explanation of the choice. It does not replace the matched route -- both run on the same posting and their outputs are stored separately so the two can be compared. §7's anti-fabrication rule is unchanged and still holds on this route: the model returns evidence ids, never generated text, and every id is validated against the offered set. The posting flow was rebuilt on 2026-08-28 so the two routes are peers rather than one being grafted onto the other's screens: `/jobs/:id` is a neutral hub that owns only posting-level data and the choice between routes, requirement extraction moved to `/jobs/:id/match/analyze` (Matching's own first screen), and `/jobs/:id/generate` became `/jobs/:id/documents`. See PROGRESS.md.

## 6. Data model (single source of truth)

All documents are views over typed JSON. Define these as TypeScript types in one shared module.

```
Profile {
  contact: { name, email, phone?, location?, links[] }
  skills: { category: string, items: string[] }[]
  experience: { company, title, start, end?, location?, bullets: string[] }[]
  projects: { name, description, bullets: string[], links[] }[]
  education: { school, degree, field?, start, end?, details?: string[] }[]
  writingSamples: string[]        // for cover letter style mimicry
}

JobPosting {
  id, createdAt
  rawText: string
  analysis?: {
    roleSummary: string
    requirements: string[]
    keywords: string[]
    matches: { requirement: string, profileEvidence: string[] }[]
    gaps: string[]
  }
}

Generation {
  id, jobPostingId, createdAt, type: "resume" | "coverLetter"
  content: ResumeContent | CoverLetterContent   // structured, field-editable
  sourceMap: { generatedText: string, profileEvidence: string[] }[]  // traceability
}

LatexTemplate {
  id, name
  rawTex: string          // as pasted by the user
  compiledTemplate: string // placeholder version, produced once by LLM
  placeholders: string[]
}
```

Storage: Dexie (IndexedDB) tables mirroring these types. Export/import = JSON dump/restore of all tables, with a schema version number for future migrations.

## 7. LLM layer

- **Provider-agnostic:** one module `llm.ts` exposing `generate(prompt, options)`. Provider, model name, and base URL are config values. Initial provider: OpenRouter free models or Groq free tier (OpenAI-compatible APIs). Must be swappable in one place — free tiers change.
- **All calls go through the proxy.** The frontend never holds an API key.
- **Structured outputs:** prompts instruct JSON-only responses matching our types; responses are parsed defensively (strip code fences, validate shape, retry once on parse failure).
- **Anti-fabrication rules baked into prompts:** the model may only rephrase, reorder, and emphasize content present in the profile. It must return a sourceMap linking each generated bullet/claim to profile evidence. Generated items without evidence are flagged in the UI for user review.

## 8. Proxy (Cloudflare Worker)

- Single endpoint, e.g. `POST /generate`, forwarding the request body to the configured LLM provider with the secret key, returning the response.
- Stateless: no request/response body logging, no storage, no analytics on content.
- CORS: allowlist only the deployed frontend origin (plus localhost during dev).
- Basic abuse protection: simple rate limit per IP; reject oversized payloads.
- Secrets via `wrangler secret`; never in code or repo.

## 9. LaTeX pipeline ("convert once, fill deterministically")

1. User pastes the raw .tex of a resume template (e.g. from Overleaf).
2. One-time LLM step converts it into a placeholder template (e.g. `{{name}}`, section/bullet loops) and returns the placeholder list. User confirms/edits the mapping.
3. From then on, filling the template is **deterministic code**: inject resume JSON into placeholders, escape LaTeX special characters, handle repeating sections (experience entries, bullets).
4. Export the filled .tex for the user to compile in Overleaf.
- The LLM never touches LaTeX during normal generation — only during the one-time conversion. This keeps output reliable.
- Also ship one built-in HTML template with print CSS as the default PDF path for users who don't care about LaTeX.

## 10. Data handling & privacy (contract)

- User content is stored only in the user's browser (IndexedDB). No server-side database exists.
- User content transits the stateless proxy to the provider solely to generate output; nothing is retained by the proxy.
- Attached files (resumes, documents) are sent **inline** through the same stateless proxy and are never uploaded to a provider's file-storage API, which would persist them provider-side. The file itself is never written to IndexedDB either — it is read, used, and dropped.
- Files whose text can be read locally (`.txt`, `.md`, `.tex`) are never transmitted at all.
- Choose providers whose terms do not permit training on API data; document each chosen provider and its policy in the README. This rule is load-bearing, not aspirational: it is why Gemini's free tier was rejected for document reading in Phase 8 (its terms permit training on submitted content and human review of it), in favour of Mistral with training opt-out disabled.
- Where a provider's no-training guarantee depends on an account setting rather than its default terms, record in the README which setting and the date it was verified — a default can change, and an account setting can be reset.
- Export/import gives users full data portability; a "delete all data" button wipes IndexedDB.
- State this contract verbatim in the app's About/Privacy section, including which providers receive content and what each does with it.

## 11. Tech stack

- Frontend: Vite + React + TypeScript, React Router. SPA, no SSR.
- Local storage: Dexie.js over IndexedDB.
- Styling: Tailwind CSS (or CSS modules — keep it simple).
- Proxy: Cloudflare Worker (TypeScript), deployed with Wrangler.
- Hosting: Cloudflare Pages (static frontend), auto-deploy from GitHub.
- Testing: Vitest for the deterministic parts (template filling, LaTeX escaping, import/export, schema validation). LLM calls mocked.

## 12. Build phases

**Phase 1 — Foundation:** Vite scaffold, TypeScript types for all models, Dexie setup, routing shell, profile input screens with local persistence, JSON export/import + delete-all.

**Phase 2 — Proxy & LLM layer:** Cloudflare Worker with CORS + rate limit, `llm.ts` provider abstraction, structured-output parsing utilities, end-to-end "hello" call from the app.

**Phase 3 — Posting analysis:** paste posting → analysis object (requirements, keywords, matches, gaps) rendered in UI, stored per posting.

**Phase 4 — Resume generation:** tailored resume generation with sourceMap traceability, field-level editing UI, HTML template + print-to-PDF export.

**Phase 5 — Cover letter:** generation with optional style mimicry from writingSamples, editable, exportable.

**Phase 6 — LaTeX:** template paste → one-time placeholder conversion → deterministic fill → .tex export. Unit tests for escaping/filling.

**Phase 7 — Polish:** empty states, error handling (rate-limited/failed LLM calls), generation history per job, README with privacy contract.

Each phase must leave the app in a working, demoable state.

## 13. Acceptance criteria (v1 done)

- A friend can open the URL, enter their profile, paste a posting, and download a tailored resume PDF and cover letter within one session, installing nothing.
- Clearing another browser and importing the exported JSON fully restores their data.
- No generated resume line lacks a sourceMap entry, or it is visibly flagged.
- Filling the same LaTeX template twice with the same data yields byte-identical .tex output.
- The proxy repo/code contains no secrets; the frontend bundle contains no API key.
