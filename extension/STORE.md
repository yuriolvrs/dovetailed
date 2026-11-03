# Store listing (draft for review)

Text to paste into the Firefox Add-ons and Microsoft Edge Add-ons forms. Review before use.

## Name

Dovetailed Autofill

## Summary (short description)

Fills job application forms from a profile stored in your browser. It never submits a form.

## Description

Dovetailed Autofill fills the name, contact, address, link, work and education fields on job application forms. It can also attach your stored resume.

- Your profile and resume are stored in this browser only.
- It fills a page only when you click Fill, or the optional in-page button.
- It never submits a form, and never fills passwords.
- Work authorization, diversity and consent questions stay blank for you.
- It does not run on Indeed or LinkedIn.

Optional: fill your profile from your resume. This sends the resume's text to an AI service. Nothing is sent until you agree.

## Category

Firefox: Other. Edge: Productivity.

## Privacy policy

Dovetailed Autofill stores your profile and resume file in your browser only. There is no account and no server-side database.

The extension reads a web page's form fields only when you start a fill. It types your stored details into that page. It does not send page content anywhere.

One optional feature sends data out of your browser. "Fill profile from resume" reads your resume's text in your browser. After you agree, it sends that text through the Dovetailed proxy to Groq, an AI provider, and returns the result. The resume file itself is not sent. The proxy does not save or log your content. Groq does not use API content to train its models and does not keep it by default, but it may keep logs for up to 30 days to fix reliability problems or look into suspected abuse.

"Copy from Dovetailed" reads your Dovetailed profile from this same browser. It does not go through a server.

The extension has no analytics and no tracking.

## Notes for reviewers

- Source: the full project is in the source zip. The extension reuses code from `src/` at the repo root.
- Build: Node 22 or later. Run `npm install` in the repo root and in `extension/`, then `npm run build:firefox` in `extension/`. Output: `extension/.output/firefox-mv3`.
- Test: no account is needed. Open the options page, enter details, open any job application form, then click the toolbar icon and Fill this page.
- Network: only the optional resume import makes a request, to the Dovetailed proxy, after the user agrees.
