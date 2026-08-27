# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

The developer of this project and their friends. One person, at a desk, in the middle of a job hunt: they have a real profile of work history already entered, they have found a posting they want, and they need a tailored resume and cover letter for it in one sitting. They install nothing and they create no account.

A second audience is the portfolio viewer: someone evaluating the developer's work who opens the live app cold. The project is a personal/portfolio project. Commercial use is a possible later step, not a requirement that current work designs for.

## Product Purpose

Dovetailed turns a stored profile plus a pasted job posting into a tailored resume and cover letter, grounded strictly in what the user actually did. The user enters their profile once; every job after that reuses it.

Success is one uninterrupted session: paste a posting, see how it matches, generate the two documents, edit the fields that are wrong, and export a PDF and a filled `.tex`. A friend opening the URL for the first time reaches that end without installing anything.

## Positioning

Two claims a neighboring product cannot truthfully copy:

- **No servers hold the user's data.** Profile, postings, and generations live only in the browser's IndexedDB. The Cloudflare Worker proxy forwards a single request and forgets it: no logging of bodies, no persistence, no analytics on content. The frontend never holds an API key. Providers are chosen for terms that do not permit training on API data, and each choice is documented with the date it was verified.
- **Nothing is invented.** The model selects, reorders, and emphasizes what is already in the profile. Every generated claim carries a sourceMap entry back to profile evidence, and anything unevidenced is flagged in the UI instead of being shown as fact.

## Operating Context

The user works through a small number of named surfaces:

- **Jobs** — the list of saved postings, doubling as the application tracker (each job carries an application status and an applied date).
- **Job detail** — the pasted posting text and its LLM analysis: role summary, requirements, keywords, matches, gaps. All of it editable.
- **Matching review** — requirement-by-requirement, which profile evidence covers it and what is missing. Reviewed before generating.
- **Generate** — the tailored resume and cover letter, edited as structured fields, with version history per job.
- **Profile** — contact, skills, experience, projects, education, writing samples. Files can be attached and read into it.
- **About** — the privacy contract, stated in the app.

Real materials in play: job postings pasted as text, an existing resume imported as a file, writing samples used for cover-letter style, and a LaTeX resume template pasted once from Overleaf. Job postings are paste-only; there is no screenshot or PDF posting input.

## Capabilities and Constraints

- Documents are structured JSON rendered into views, never opaque text blobs. Editing happens on fields; the document re-renders from data. There is no WYSIWYG editor.
- LaTeX is converted to a placeholder template once by the LLM; every fill after that is deterministic code. Filling the same template twice with the same data must produce byte-identical output. No LaTeX is compiled in-app.
- Two providers receive content: Groq for text (analysis, matching, cover letters, template conversion) and Mistral for reading attached files. Plain-text files (`.txt`, `.md`, `.tex`) are read locally and never transmitted. Attached files are sent inline, never to a file-storage API, and are never written to IndexedDB.
- The LLM provider is swappable in one module. Free tiers change; nothing else may depend on a provider.
- JSON export and import is required, not optional: local-only storage means cleared browser data is otherwise unrecoverable. A delete-all action wipes IndexedDB.
- No accounts, no auth, no multi-device sync, no mobile-native app.
- Zero cost to operate: free-tier LLM providers, free-tier hosting (Cloudflare Pages plus a Worker).
- Deferred, deliberately not built: resume-PDF parsing for profile import, posting input by screenshot or PDF, multiple saved profiles, local-model mode.

## Brand Commitments

- The product name is **Dovetailed** and is settled. The `pimp-my-resume.pages.dev` deploy URL is a leftover, not the name.
- The **quill mark** (Hugeicons) is the committed brand mark. Future work keeps it rather than drawing a new identity.
- **Light and dark themes** are a product commitment, not an incidental feature. Both are first-class and both must be correct.

## Evidence on Hand

- A working, deployed app at https://pimp-my-resume.pages.dev, with all eight build phases complete.
- The privacy contract is real and documented, including the rejection of Google Gemini's free tier for document reading (its terms permit training on submitted content and human review of it) and the Mistral training opt-out with its verification date.
- No customers, testimonials, press, benchmarks, pricing, or usage numbers exist. None may be fabricated. There is no company behind this.

## Product Principles

1. **The user's data does not leave the browser except to make one call.** Any feature that would need server-side storage, content logging, or content analytics is out of scope, whatever it would enable.
2. **Nothing is invented on the user's behalf.** Evidence or a visible flag — there is no third option, in generation or in the interface that presents it.
3. **Documents are data.** Structure first, rendering second. A feature that requires storing a generated document as text is the wrong feature.
4. **The one-session path is the product.** Posting to exported document without installing anything, without an account, and without leaving the app.
5. **Provider choices are replaceable and documented.** Free tiers and their terms change; the app absorbs that in one module and records what was verified and when.

## Accessibility & Inclusion

WCAG 2.2 AA is the required bar. Contrast, visible focus, full keyboard paths, and correct labels are non-negotiable on every surface, in both light and dark themes.
