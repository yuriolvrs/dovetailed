# Dovetailed

A job application assistant that tailors your resume and cover letter to each posting. Enter your profile once, paste a job posting, and get documents that only use things you have actually done.

Live at https://dovetailed.pages.dev

## Why I built it

I kept seeing advice, online and from friends, that tailored resumes do better than sending the same one everywhere. A software engineer application and an AI engineer application should emphasize different things, but rewriting a resume by hand for every posting takes time I didn't want to spend.

Dovetailed is the tool I wanted: store your experience once, and let it draft a version for each job. You still review everything. The model only selects and reorders what is already in your profile, and anything it can't back up with evidence is flagged instead of presented as fact.

## How your data is handled

Dovetailed doesn't keep your data on a server. Your profile, postings, and generated documents live in your browser's IndexedDB. When you run an AI step, the text needed for that call goes through a small Cloudflare Worker that forwards the request and keeps nothing. The frontend never sees an API key, and I only use providers whose terms say they don't train on API data.

- You can export everything to JSON, import it on another machine, or wipe it at any time.
- Attached files are read once, and only the extracted text is kept. Plain-text files never leave the browser.

The full privacy contract is in the About page of the app.

## Running it locally

```bash
npm install
npm run dev
```

To run the proxy, copy `worker/.dev.vars.example` to `worker/.dev.vars`, add your own keys, then run `npx wrangler dev` from `worker/`. The frontend reads `VITE_PROXY_URL` from `.env` (see `.env.example`).

Deploy the Worker before the frontend. Both `LLM_API_KEY` and `MISTRAL_API_KEY` need to be set as Worker secrets, and `ALLOWED_ORIGINS` in `worker/wrangler.toml` has to match the frontend's origin.
