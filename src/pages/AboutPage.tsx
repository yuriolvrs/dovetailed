// What this file is: the About/Privacy route. States the app's data
// handling contract verbatim per PRD §10, including which providers receive
// content and what each of them does with it.
// In plain terms: the page that explains where your data goes and what
// happens to it.
import { Card, SectionTitle } from '../components/ui/primitives';

// Recorded here rather than only in the README because this guarantee rests
// on an account setting that could be reset, not on the provider's default
// terms -- so the date it was checked is part of the claim (PRD §10).
const OPT_OUT_VERIFIED = '16 August 2026';
const LAST_UPDATED = '29 October 2026';

export default function AboutPage() {
  return (
    <div className="space-y-4 pb-16">
      <div className="mb-3">
        <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">About &amp; Privacy</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
          A privacy-first assistant that tailors your resume and cover letter to a specific job
          posting, grounded strictly in your real profile.
        </p>
      </div>

      <Card className="p-6">
        <SectionTitle>Data Handling Contract</SectionTitle>
        <ul className="list-disc space-y-1.5 pl-5 text-sm text-slate-600 dark:text-slate-300">
          <li>
            Your content is stored only in your browser (IndexedDB). No server-side database
            exists, and this app keeps no account.
          </li>
          <li>
            When you use an AI feature, your content passes through the app's proxy server just
            long enough to forward it to an AI provider and send the result back to you. The proxy
            does not save or log your content. What each provider does with it is described below.
          </li>
          <li>
            Export/import lets you take your data with you. "Delete all data" in Settings erases
            what this app stored in this browser. It cannot reach exported files or anything a
            provider has already received.
          </li>
        </ul>
      </Card>

      <Card className="p-6">
        <SectionTitle sub="Being specific about this matters more than sounding reassuring">
          What leaves your browser
        </SectionTitle>
        <p className="text-sm text-slate-600 dark:text-slate-300 mb-3">
          "Stored only in your browser" is about <em>storage</em>. Producing a tailored resume or
          reading an attached file requires sending the relevant content to an AI provider, so this
          is exactly what goes where:
        </p>
        <ul className="list-disc space-y-1.5 pl-5 text-sm text-slate-600 dark:text-slate-300">
          <li>
            <strong>Text you enter</strong> — profile details and posting text are sent to{' '}
            <strong>Groq</strong> when you use an AI feature, such as analysis, matching, or
            generation. This includes text read from files you attach.
          </li>
          <li>
            <strong>PDF, Word and PowerPoint files</strong> are read in your browser when they
            contain text, so the file itself is not sent anywhere. Only{' '}
            <strong>scans and images</strong> (and files the browser can't read) are sent to{' '}
            <strong>Mistral</strong> to be read into text. They are sent inline and are never uploaded to a provider's file-storage service.
            This app does not save the file either. It is read once and
            dropped, and only the extracted text reaches your profile.
          </li>
          <li>
            <strong>Plain-text files</strong> (<code>.txt</code>, <code>.md</code>,{' '}
            <code>.tex</code>) are read locally, so the file itself is never sent. Its text is then
            handled like anything else you type.
          </li>
          <li>
            Under each provider's terms and the account settings checked on {OPT_OUT_VERIFIED},
            neither provider may use this content to train its models. Groq's terms say it does not
            train on API data. Mistral's free tier allows training by default, so it is turned off
            in the account settings.
          </li>
          <li>
            Groq does not keep API content by default, but it may keep logs for up to 30 days to fix
            reliability problems or look into suspected abuse. Mistral keeps API content for 30
            days for abuse monitoring. This is separate from training, and this app cannot turn it
            off.
          </li>
          <li>
            Groq processes data in the United States. Mistral hosts data in the EU by default but
            may process it elsewhere. For transfers out of the EU/EEA, both providers rely on the
            EU Standard Contractual Clauses.
          </li>
          <li>
            None of your content is sent until you take an action that needs it. Filling in your
            profile sends nothing on its own.
          </li>
        </ul>
      </Card>

      <Card className="p-6">
        <SectionTitle>Other details</SectionTitle>
        <ul className="list-disc space-y-1.5 pl-5 text-sm text-slate-600 dark:text-slate-300">
          <li>
            The proxy runs on a hosting provider. Like any web service, it handles technical data
            such as your IP address. It uses this only to deliver requests and limit abuse.
          </li>
          <li>
            Your content is sent to a provider only to run the feature you asked for (GDPR:
            performance of a contract). Technical data is used to run and protect the service
            (GDPR: legitimate interests).
          </li>
          <li>
            Your data stays in your browser, so you can view, export, or delete it yourself at any
            time.
          </li>
          <li>AI output can be wrong. Check every document before you use it.</li>
        </ul>
        <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">Last updated: {LAST_UPDATED}</p>
      </Card>
    </div>
  );
}
