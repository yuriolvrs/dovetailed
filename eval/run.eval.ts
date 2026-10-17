// What this file is: the live evaluation runner (Vitest). For each fixture persona and each
// generation it calls the real app modules in order -- profile extraction, atoms, posting
// analysis, matching, resume selection, cover letter -- against the real proxy, scores the
// result with eval/metrics.ts, and writes report.json, report.md and blind-judging stacks to
// eval/out/<timestamp>/. Run it with `npm run eval`. It is NOT part of `npm run test`.
// In plain terms: the script that runs the whole tailoring pipeline on three fake job seekers
// and grades the output, so we can see if a change made things better or worse.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import type { JobPosting, Profile } from '../src/types';
import { generateStructured } from '../src/lib/llm';
import { buildExtractProfilePrompt, isExtractedProfile } from '../src/prompts/extractProfile';
import { buildAnalyzePostingPrompt, isExtractedAnalysis, toJobAnalysis } from '../src/prompts/analyzePosting';
import { mergeProfile } from '../src/lib/files/mergeProfile';
import { buildProfileAtoms } from '../src/lib/profileAtoms';
import { runMatching } from '../src/lib/matching/runMatching';
import { computeFitScore } from '../src/lib/matching/fitScore';
import { selectResumeContent } from '../src/lib/generation/selectResumeContent';
import { generateCoverLetterContent } from '../src/lib/generation/generateCoverLetterContent';
import {
  coverageMetrics,
  keywordRetention,
  letterMetrics,
  scoreAnswerKey,
  selfNegativeLines,
  type AnswerKey,
} from './metrics';
import { letterToText, resumeToText, stackText } from './exportText';
import { reportToMarkdown, type Report, type RunResult } from './report';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const PERSONAS = ['A', 'B', 'C'];
const RUNS = Math.max(1, Number.parseInt(process.env.EVAL_RUNS ?? '1', 10) || 1);
const FIXTURES = join(HERE, 'fixtures');
const STAMP = new Date().toISOString().replace(/[:.]/g, '-');
const OUT_DIR = join(HERE, 'out', STAMP);

// Same settings the app uses: ImportResumeSection.tsx and buildDocuments.ts.
const EXTRACT_OPTIONS = { maxTokens: 6000, reasoningEffort: 'low' as const };
const ANALYZE_OPTIONS = { temperature: 0.2, maxTokens: 4000 };

const read = (name: string) => readFileSync(join(FIXTURES, name), 'utf8');

function emptyProfile(): Profile {
  return {
    id: 'eval',
    contact: { name: '', email: '', links: [] },
    skills: [],
    experience: [],
    projects: [],
    education: [],
    writingSamples: [],
    additionalInfo: [],
  };
}

const report: Report = {
  startedAt: STAMP,
  config: {
    runs: RUNS,
    proxyUrl: (import.meta.env.VITE_PROXY_URL as string | undefined) ?? '',
    origin: process.env.EVAL_ORIGIN ?? 'http://localhost:5173',
  },
  notes: [
    'fitToOnePage is skipped (it needs a browser to measure page height). Resumes are the selectResumeContent output, so they may run longer than one page.',
    'Writing-style samples are off (the fixture profiles have none).',
    'Each generation repeats profile extraction, so extraction variance is part of the result.',
  ],
  runs: [],
};

/** Writes report.json and report.md. Called after every run so a crash keeps partial results. */
function writeReport(): void {
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(join(OUT_DIR, 'report.json'), JSON.stringify(report, null, 2));
  writeFileSync(join(OUT_DIR, 'report.md'), reportToMarkdown(report));
}

/** Runs one persona through the whole pipeline once. Never throws; failures go in `error`. */
async function runOnce(persona: string, run: number): Promise<RunResult> {
  const result: RunResult = { persona, run, timingsMs: {} };
  let step = 'extract';
  const timed = async <T>(name: keyof RunResult['timingsMs'], fn: () => Promise<T> | T): Promise<T> => {
    step = name;
    const t0 = Date.now();
    try {
      return await fn();
    } finally {
      result.timingsMs[name] = Date.now() - t0;
    }
  };

  try {
    const resumeText = read(`${persona}-resume.txt`);
    const postingText = read(`${persona}-posting.txt`);
    const key = JSON.parse(read(`${persona}-key.json`)) as AnswerKey;
    const keywords = JSON.parse(read(`${persona}-keywords.json`)) as string[];

    // 1. Profile extraction, then the same merge the import screen uses (empty profile, all sections).
    const extracted = await timed('extract', () =>
      generateStructured(buildExtractProfilePrompt(resumeText), isExtractedProfile, EXTRACT_OPTIONS),
    );
    const profile = mergeProfile(emptyProfile(), extracted, ['contact', 'skills', 'experience', 'projects', 'education']);
    const atoms = buildProfileAtoms(profile);
    result.profile = {
      experienceEntries: profile.experience.length,
      atoms: atoms.length,
      hasSummary: (profile.summary ?? '').trim() !== '',
    };

    // 2. Posting analysis.
    const analyzed = await timed('analyze', () =>
      generateStructured(buildAnalyzePostingPrompt(postingText), isExtractedAnalysis, ANALYZE_OPTIONS),
    );
    const analysis = toJobAnalysis(analyzed);

    // 3. Matching.
    const matches = await timed('match', () => runMatching(analysis.requirements, atoms));
    analysis.matches = matches;
    const posting: JobPosting = {
      id: `eval-${persona}`,
      createdAt: Date.now(),
      title: analyzed.title,
      company: analyzed.company,
      rawText: postingText,
      analysis,
    };

    const atomText = new Map(atoms.map((a) => [a.id, a.text]));
    result.requirements = analysis.requirements.map((r) => {
      const m = matches.find((x) => x.requirementId === r.id);
      return {
        text: r.text,
        kind: r.kind ?? 'qualification',
        severity: r.severity,
        status: m?.status ?? 'gap_no_candidates',
        cited: (m?.atomIds ?? []).map((id) => atomText.get(id) ?? id),
      };
    });
    result.coverage = coverageMetrics(analysis.requirements, matches);
    result.fitScore = computeFitScore(analysis);
    result.key = scoreAnswerKey(key, analysis.requirements, matches, atoms);

    // 4. Resume selection (no fitToOnePage).
    const selected = await timed('select', () => selectResumeContent(profile, analysis, atoms));
    const resumeOut = resumeToText(selected.content);
    result.resumeText = resumeOut;
    result.keywords = keywordRetention(keywords, resumeText, resumeOut);
    result.selfNegative = selfNegativeLines(selected.content);

    // 5. Cover letter.
    const letter = await timed('letter', () => generateCoverLetterContent(profile, posting, atoms, {}));
    result.letter = letterMetrics(letter.content, letter.sourceMap, profile);
    result.letterText = letterToText(letter.content, selected.content.contact.name);

    // Blind-judging stack: run 1 is <P>.txt, later runs <P>-r<N>.txt.
    mkdirSync(join(OUT_DIR, 'stacks'), { recursive: true });
    const file = run === 1 ? `${persona}.txt` : `${persona}-r${run}.txt`;
    writeFileSync(join(OUT_DIR, 'stacks', file), stackText(selected.content, letter.content));
  } catch (err) {
    result.error = { step, message: err instanceof Error ? err.message : String(err) };
  }
  return result;
}

describe('tailoring evaluation (live, uses the proxy)', () => {
  afterAll(() => {
    writeReport();
    console.log(`\nEval report written to ${OUT_DIR}\n`);
  });

  it(`runs ${PERSONAS.join(', ')} x ${RUNS} generation(s), personas one at a time`, async () => {
    // Sequential on purpose: the provider has per-minute limits.
    for (const persona of PERSONAS) {
      for (let run = 1; run <= RUNS; run++) {
        const result = await runOnce(persona, run);
        report.runs.push(result);
        writeReport();
        const mark = result.error ? `FAILED at ${result.error.step}: ${result.error.message}` : 'ok';
        console.log(`[eval] ${persona} run ${run}: ${mark}`);
      }
    }
    const failed = report.runs.filter((r) => r.error);
    expect(failed.map((r) => `${r.persona}#${r.run} ${r.error?.step}`)).toEqual([]);
  });
});
