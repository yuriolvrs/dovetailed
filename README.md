# Dovetailed

A job application assistant that keeps your data in your browser. Enter your profile once, paste a job posting, and get a tailored resume and cover letter that only uses things you have actually done.

Live at https://pimp-my-resume.pages.dev

## Why I built it

I was job hunting and kept running into resume tools that wanted my full work history and writing samples uploaded to their servers. I didn't want that. Resume data is personal, and most of these services don't say clearly what happens to it afterward.

So the app is built around one rule: your profile, job postings, and generated documents stay in your browser. The only thing that leaves your machine is the text needed for a single AI call, which goes through a small Cloudflare Worker that forwards the request and keeps nothing. The frontend never sees an API key. I only use providers whose terms say they don't train on API data, and I wrote down the date I checked each one.

The other reason was honesty. Every generated claim links back to evidence in your profile, and anything without evidence gets flagged instead of shown as fact. I didn't want the tool inventing experience for me.

I also picked this stack (Vite, React, Dexie, a Worker) partly to learn something different from my usual Next.js work.

## How your data is handled

- Profile, postings, and generations live in IndexedDB. There is no server-side database.
- The Worker is stateless and doesn't log request or response bodies.
- Attached files are read once, and only the extracted text is kept. Plain-text files never leave the browser.
- You can export everything to JSON, import it on another machine, or wipe it at any time.

The full privacy contract is in the About page of the app.

## Running it locally

```bash
npm install
npm run dev
```

To run the proxy, copy `worker/.dev.vars.example` to `worker/.dev.vars`, add your own keys, then run `npx wrangler dev` from `worker/`. The frontend reads `VITE_PROXY_URL` from `.env` (see `.env.example`).

Deploying is the Worker first, then the frontend. Both `LLM_API_KEY` and `MISTRAL_API_KEY` need to be set as Worker secrets, and `ALLOWED_ORIGINS` in `worker/wrangler.toml` has to match the frontend's origin.
