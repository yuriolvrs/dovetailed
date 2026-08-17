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

export default function AboutPage() {
  return (
    <div className="space-y-4 pb-16">
      <div className="mb-3">
        <h1 className="text-lg font-semibold text-slate-900">About &amp; Privacy</h1>
        <p className="text-sm text-slate-400 mt-0.5">
          A privacy-first assistant that tailors your resume and cover letter to a specific job
          posting, grounded strictly in your real profile.
        </p>
      </div>

      <Card className="p-6">
        <SectionTitle>Data Handling Contract</SectionTitle>
        <ul className="list-disc space-y-1.5 pl-5 text-sm text-slate-600">
          <li>
            Your content is stored only in your browser (IndexedDB). No server-side database
            exists, and this app keeps no account.
          </li>
          <li>
            Your content transits a stateless proxy to an AI provider solely to produce the output
            you asked for. The proxy forwards, returns, and forgets — it stores and logs nothing.
          </li>
          <li>
            Export/import gives you full data portability, and a "delete all data" action wipes
            local storage.
          </li>
        </ul>
      </Card>

      <Card className="p-6">
        <SectionTitle sub="Being specific about this matters more than sounding reassuring">
          What leaves your browser
        </SectionTitle>
        <p className="text-sm text-slate-600 mb-3">
          "Stored only in your browser" is about <em>storage</em>. Producing a tailored resume or
          reading an attached file requires sending the relevant content to an AI provider, so this
          is exactly what goes where:
        </p>
        <ul className="list-disc space-y-1.5 pl-5 text-sm text-slate-600">
          <li>
            <strong>Text you enter</strong> — profile details and posting text — is sent to{' '}
            <strong>Groq</strong> when you run analysis, matching, or generation.
          </li>
          <li>
            <strong>Files you attach</strong> are sent to <strong>Mistral</strong> to be read into
            text. They are sent inline and are never uploaded to a provider's file-storage service,
            so no copy is kept there. This app does not save the file either — it is read once and
            dropped, and only the extracted text reaches your profile.
          </li>
          <li>
            <strong>Plain-text files</strong> (<code>.txt</code>, <code>.md</code>,{' '}
            <code>.tex</code>) never leave your browser at all — they are read locally, with no
            network request.
          </li>
          <li>
            Neither provider is permitted to train on this content. Groq does not train on API
            data; Mistral's free tier allows it by default, so training is opted out of in the
            account settings — verified {OPT_OUT_VERIFIED}. Mistral does retain API data briefly
            for abuse monitoring, which is separate from training and is not something this app can
            switch off.
          </li>
          <li>
            Nothing is sent anywhere until you take an action that needs it. Filling in your
            profile transmits nothing on its own.
          </li>
        </ul>
      </Card>
    </div>
  );
}
