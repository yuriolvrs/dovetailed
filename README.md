# Dovetailed

A privacy-first job application assistant. Store your profile (skills, experience, education) once in your browser, paste a job posting, and get an LLM-backed analysis of how you match, a tailored resume and cover letter, and an exportable filled-in LaTeX (or print-to-PDF) document — grounded strictly in your real profile, nothing invented.

## Why

Most "AI resume tailoring" tools ask you to upload your resume to their servers. This one doesn't have servers, in that sense: all your data lives in your browser's IndexedDB. The only thing that leaves your machine is what's needed for a single AI call, sent through a stateless proxy that forwards and forgets.

## Privacy contract

- All user data (profile, job postings, generations) is stored locally in the browser via IndexedDB — there is no server-side database.
- The Cloudflare Worker proxy is stateless: it forwards each request to the provider and returns the response. It does not log request/response bodies, does not persist anything, and holds the only copy of the API keys.
- The frontend never contains or receives an API key.
- Attached files are sent **inline** through the same proxy and never to a provider's file-storage API, so no copy is retained provider-side. The file is not written to IndexedDB either — it is read once, and only the extracted text is kept. Plain-text files (`.txt`, `.md`, `.tex`) are read locally and never transmitted at all.
- Export your data to a JSON file at any time, and import it into another browser/machine. A "delete all data" action wipes IndexedDB.
- Full contract is also shown in-app under About/Privacy.

### Providers and their data policies

PRD §10 requires providers whose terms do not permit training on API data. Two are used:

| Provider | Used for | Training on your data |
| --- | --- | --- |
| **Groq** (`openai/gpt-oss-120b`) | Text: analysis, matching, cover letters, template conversion | Not used for training |
| **Mistral** (`mistral-ocr-latest`) | Reading attached files (PDF/DOCX/PPTX/images) into text | Free tier permits it **by default**; opted out via Admin Console → Privacy → "Data usage for improving our services". **Verified disabled 2026-08-16.** |

Two caveats recorded deliberately, because neither is covered by that opt-out:

- Mistral's **Labs** models are exempt from the setting and may train on submitted data regardless of plan. Only production models are used, and any future model change must re-check this.
- Opting out of training is not zero retention — Mistral retains API data briefly for abuse monitoring. Zero Data Retention is a paid-plan feature.

Google's Gemini was evaluated first for document reading and **rejected**: its free-tier terms permit training on submitted content and human review of it, and its own documentation says not to submit personal information. A resume is precisely that.

## Status

Deployed and live at https://pimp-my-resume.pages.dev. See [PRD.md](./PRD.md) for the full spec and [PROGRESS.md](./PROGRESS.md) for what's built and verified so far.

- [x] Phase 1 — Foundation (types, Dexie storage, routing, profile screens, JSON export/import/delete-all)
- [x] Phase 2 — Proxy & LLM layer (Cloudflare Worker, provider-agnostic `llm.ts`)
- [x] Phase 3 — Job posting analysis (paste posting → LLM-extracted requirements/keywords/matches/gaps, editable)
- [x] Phase 4 — Resume generation (evidence-grounded selection from your profile, no LLM rewriting, field editing, print-to-PDF export)
- [x] Phase 5 — Cover letter generation (evidence-grounded, optional writing-style mimicry, field editing, version history)
- [x] Phase 6 — LaTeX export pipeline (paste a template once, one-time AI conversion to placeholders, deterministic fill on every export)
- [x] Phase 7 — Polish (empty states, LLM error/rate-limit handling, generation history per job, this README)
- [x] Phase 8 — File attachments (import an existing resume into your profile; attach writing samples, `.tex` templates, and documents as accomplishments, read via OCR. Job postings stay paste-only.)

## Tech stack

- **Frontend:** Vite + React + TypeScript (strict), React Router, Tailwind CSS
- **Local storage:** Dexie.js over IndexedDB
- **Proxy:** Cloudflare Worker (TypeScript), stateless. Two routes: `/generate` forwards to the text provider (Groq, `openai/gpt-oss-120b`), `/extract` forwards attached files to the document reader (Mistral, `mistral-ocr-latest`)
- **Testing:** Vitest, LLM calls mocked

## Getting started

Requires Node.js and npm.

```bash
npm install
npm run dev
```

The frontend expects a proxy URL in `.env` (see `.env.example`). To run the proxy locally:

```bash
cd worker
npm install
cp .dev.vars.example .dev.vars   # add your own LLM_API_KEY and MISTRAL_API_KEY
npx wrangler dev
```

### Other commands

```bash
npm run build      # typecheck + production build
npm run test        # run frontend unit tests (Vitest)
npm run preview     # preview the production build
```

The worker has its own `npm run test` in `worker/`.

## Deployment

Deployed at https://pimp-my-resume.pages.dev (Cloudflare Pages), backed by a Cloudflare Worker proxy.

**Deploy the Worker before the frontend.** The frontend auto-deploys from GitHub, so pushing a commit that adds a feature the deployed Worker can't serve yet will ship a broken build. Both secrets must be set or file attachments fail in production.

To redeploy:

1. `wrangler login`
2. From `worker/`: `npx wrangler secret put LLM_API_KEY` and `npx wrangler secret put MISTRAL_API_KEY`
3. From `worker/`: `npx wrangler deploy`
4. From the repo root: `npm run build` (with `VITE_PROXY_URL` set to the deployed Worker URL), then `npx wrangler pages deploy dist --project-name=pimp-my-resume`

Keep `ALLOWED_ORIGINS` in `worker/wrangler.toml` in sync with the deployed frontend origin.

## License

Personal/portfolio project. No license specified yet.
