# Pimp My Resume

A privacy-first job application assistant. Store your profile (skills, experience, education) once in your browser, paste a job posting, and get an LLM-backed analysis of how you match, a tailored resume and cover letter, and an exportable filled-in LaTeX (or print-to-PDF) document — grounded strictly in your real profile, nothing invented.

## Why

Most "AI resume tailoring" tools ask you to upload your resume to their servers. This one doesn't have servers, in that sense: all your data lives in your browser's IndexedDB. The only thing that leaves your machine is what's needed for a single LLM call, sent through a stateless proxy that forwards and forgets.

## Privacy contract

- All user data (profile, job postings, generations) is stored locally in the browser via IndexedDB — there is no server-side database.
- The Cloudflare Worker proxy is stateless: it forwards each request to the LLM provider and returns the response. It does not log request/response bodies, does not persist anything, and holds the only copy of the API key.
- The frontend never contains or receives an LLM API key.
- Export your data to a JSON file at any time, and import it into another browser/machine. A "delete all data" action wipes IndexedDB.
- Full contract is also shown in-app under About/Privacy.

## Status

Deployed and live at https://pimp-my-resume.pages.dev. See [PRD.md](./PRD.md) for the full spec and [PROGRESS.md](./PROGRESS.md) for what's built and verified so far.

- [x] Phase 1 — Foundation (types, Dexie storage, routing, profile screens, JSON export/import/delete-all)
- [x] Phase 2 — Proxy & LLM layer (Cloudflare Worker, provider-agnostic `llm.ts`)
- [x] Phase 3 — Job posting analysis (paste posting → LLM-extracted requirements/keywords/matches/gaps, editable)
- [x] Phase 4 — Resume generation (evidence-grounded selection from your profile, no LLM rewriting, field editing, print-to-PDF export)
- [x] Phase 5 — Cover letter generation (evidence-grounded, optional writing-style mimicry, field editing, version history)
- [x] Phase 6 — LaTeX export pipeline (paste a template once, one-time AI conversion to placeholders, deterministic fill on every export)
- [x] Phase 7 — Polish (empty states, LLM error/rate-limit handling, generation history per job, this README)

## Tech stack

- **Frontend:** Vite + React + TypeScript (strict), React Router, Tailwind CSS
- **Local storage:** Dexie.js over IndexedDB
- **Proxy:** Cloudflare Worker (TypeScript), stateless, forwards to the LLM provider (currently Groq, `openai/gpt-oss-120b`)
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
cp .dev.vars.example .dev.vars   # add your own LLM_API_KEY
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

Deployed at https://pimp-my-resume.pages.dev (Cloudflare Pages), backed by a Cloudflare Worker proxy. To redeploy: `wrangler login`, set the `LLM_API_KEY` secret (`npx wrangler secret put LLM_API_KEY` from `worker/`), `npx wrangler deploy` (from `worker/`), then `npm run build` (with `VITE_PROXY_URL` set to the deployed Worker URL) and `npx wrangler pages deploy dist --project-name=pimp-my-resume` from the repo root. Keep `ALLOWED_ORIGINS` in `worker/wrangler.toml` in sync with the deployed frontend origin.

## License

Personal/portfolio project. No license specified yet.
