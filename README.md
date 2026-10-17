# Dovetailed

A job application assistant that tailors your resume and cover letter to each posting. Enter your profile once, paste a job posting, and get documents that only use things you have actually done.

Live at https://dovetailed.pages.dev

## Why I built it

I kept seeing advice, online and from friends, that tailored resumes do better than sending the same one everywhere. A software engineer application and an AI engineer application should emphasize different things, but rewriting a resume by hand for every posting takes time I didn't want to spend.

So I built the thing I wished I had. You type your experience in once, paste in a posting, and it drafts a version for that job. I still go over every line before I use it. The model can only rearrange what's already in my profile, and if it can't back a claim up, it flags it instead of dressing it up.

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
