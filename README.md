# Dovetailed

A job application assistant that tailors your resume and cover letter to each posting. Enter your profile once, paste a job posting, and get documents that only use things you have actually done. It also helps you prepare for likely interview questions.

Live at https://dovetailed.pages.dev

## Why I built it

I kept seeing advice, online and from friends, that tailored resumes do better than sending the same one everywhere. A software engineer application and an AI engineer application should emphasize different things, but rewriting a resume by hand for every posting takes time I didn't want to spend.

So I built the thing I wished I had. You type your experience in once, paste in a posting, and it drafts a version for that job. I still go over every line before I use it. The model can only rearrange what's already in my profile, and if it can't back a claim up, it flags it instead of dressing it up.

## How your data is handled

Your profile, job postings, and generated documents are stored only in your browser (IndexedDB). There is no server-side database and no account.

When you ask for output, your text passes through a small Cloudflare Worker that forwards it to an AI provider and sends the result back. The Worker keeps nothing, and the frontend never sees an API key. Neither provider is allowed to train on this content.

- PDF, Word, and PowerPoint files are read in your browser when they have text, so the file itself is never sent. Only scans and images go to Mistral to be read.
- Plain-text files (`.txt`, `.md`, `.tex`) never leave your browser.
- You can export everything to JSON, import it on another machine, or wipe it at any time.

The full privacy contract is in the About page of the app.

