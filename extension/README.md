# Dovetailed Autofill

A browser extension that fills job application forms from a profile stored in your browser. It attaches your stored resume. It never submits a form.

## Build

Node 22 or later is required. Run `npm install` in the repo root and in `extension/`, because the extension reuses code from `src/`.

```bash
npm run build
```

This builds both browsers. To build one, use `npm run build:chrome` or `npm run build:firefox`. Output goes to `.output/chrome-mv3` and `.output/firefox-mv3`.

## Load in Chrome, Brave or Edge

1. Open `chrome://extensions`, `brave://extensions` or `edge://extensions`.
2. Turn on Developer mode.
3. Click **Load unpacked** and select `extension/.output/chrome-mv3`.

After a rebuild, click the reload icon on the extension card.

## Load in Firefox

Firefox 140 or later is required.

1. Open `about:debugging#/runtime/this-firefox`.
2. Click **Load Temporary Add-on**.
3. Select `extension/.output/firefox-mv3/manifest.json`.

Firefox removes a temporary add-on when it restarts.

## Use

1. Open the options page and enter your details and resume, then click **Save**.
2. Open a job application form.
3. Click the extension icon, then **Fill this page**.
4. Check the form, then submit it yourself.

The popup lists required fields it left blank. It does not fill Indeed or LinkedIn, because their terms may ban tools like this.

## Optional features

- **Fill button on forms:** an off-by-default setting. Chrome asks for access to all sites when you turn it on.
- **Fill profile from resume:** sends your resume's text through the Dovetailed proxy to the AI provider that reads it. Nothing is sent until you click Continue.

## Test

```bash
npm run test
```
