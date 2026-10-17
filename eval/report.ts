// What this file is: the result types for one evaluation run and the Markdown renderer for the
// report. Pure functions, no file access.
// In plain terms: turns the measured numbers into a readable summary page.

import type { CoverageMetrics, KeyMetrics, KeywordRetention, LetterMetrics } from './metrics';

export interface RunResult {
  persona: string;
  run: number;
  /** Set when a step threw; later steps were skipped. */
  error?: { step: string; message: string };
  timingsMs: Partial<Record<'extract' | 'analyze' | 'match' | 'select' | 'letter', number>>;
  profile?: { experienceEntries: number; atoms: number; hasSummary: boolean };
  requirements?: { text: string; kind: string; severity: string; status: string; cited: string[] }[];
  coverage?: CoverageMetrics;
  fitScore?: number | null;
  key?: KeyMetrics;
  keywords?: KeywordRetention;
  selfNegative?: string[];
  letter?: LetterMetrics;
  resumeText?: string;
  letterText?: string;
}

export interface Report {
  startedAt: string;
  config: { runs: number; proxyUrl: string; origin: string };
  notes: string[];
  runs: RunResult[];
}

const secs = (ms?: number) => (ms === undefined ? '-' : (ms / 1000).toFixed(1));

function totalMs(r: RunResult): number {
  return Object.values(r.timingsMs).reduce<number>((a, b) => a + (b ?? 0), 0);
}

function row(r: RunResult): string {
  if (!r.coverage || !r.key || !r.keywords || !r.letter) {
    return `| ${r.persona} | ${r.run} | FAILED at ${r.error?.step ?? '?'} |||||||||||`;
  }
  const c = r.coverage;
  const k = r.key;
  const l = r.letter;
  const hy = l.nonAsciiHyphens.reduce((n, h) => n + h.count, 0);
  const change = l.careerChange.expected ? (l.careerChange.named ? 'named' : 'MISSING') : 'n/a';
  return [
    r.persona,
    r.run,
    `${c.full + c.partial}/${c.total} (${c.full}f ${c.partial}p)`,
    `${k.trueCovers}/${k.falseGaps}/${k.falseCovers}`,
    `${r.keywords.inBase.length} -> ${r.keywords.inResume.length} of ${r.keywords.total}`,
    r.selfNegative?.length ?? 0,
    l.wordCount,
    l.flaggedSentences.length,
    l.duplicateSentences.length,
    l.bannedPhrases.length,
    hy,
    change,
    secs(totalMs(r)),
  ].join(' | ').replace(/^/, '| ').replace(/$/, ' |');
}

function details(r: RunResult): string[] {
  const out = [`### ${r.persona} run ${r.run}`];
  if (r.error) out.push(`- ERROR at ${r.error.step}: ${r.error.message}`);
  if (r.coverage) {
    const k = r.coverage.byKind;
    out.push(
      `- By kind (covered/total): qualification ${k.qualification.full + k.qualification.partial}/${k.qualification.total}, duty ${k.duty.full + k.duty.partial}/${k.duty.total}, education ${k.education.full + k.education.partial}/${k.education.total}. Fit score: ${r.fitScore ?? 'n/a'}.`,
    );
  }
  if (r.key) {
    out.push(`- Key: ${r.key.trueCovers} true covers, ${r.key.falseGaps} false gaps, ${r.key.falseCovers} false covers, ${r.key.honestGaps} honest gaps, ${r.key.unexpectedCovers} unexpected covers, ${r.key.otherCovers} other covers, ${r.key.notExtracted} key items not extracted.`);
    for (const item of r.key.items) {
      for (const q of item.requirements) {
        if (q.verdict === 'false_gap' || q.verdict === 'false_cover' || q.verdict === 'unexpected_cover') {
          out.push(`  - ${q.verdict.toUpperCase()} [${item.id}] "${q.requirement}" (${q.status})${q.cited.length ? ' cited: ' + q.cited.map((c) => `"${c}"`).join('; ') : ''}`);
        }
      }
      if (item.notExtracted) out.push(`  - NOT EXTRACTED [${item.id}]`);
    }
  }
  if (r.keywords) out.push(`- Keywords lost from base: ${r.keywords.lost.join(', ') || 'none'}. Gained: ${r.keywords.gained.join(', ') || 'none'}.`);
  if (r.selfNegative?.length) out.push(`- Self-negative lines printed: ${r.selfNegative.map((s) => `"${s}"`).join('; ')}`);
  if (r.letter) {
    const l = r.letter;
    for (const f of l.flaggedSentences) out.push(`- Flagged sentence (${f.reason}): "${f.text}"`);
    for (const d of l.duplicateSentences) out.push(`- Duplicate (${d.overlap}): "${d.a}" ~ "${d.b}"`);
    for (const b of l.bannedPhrases) out.push(`- Banned phrase (${b.label}): "${b.match}"`);
    for (const h of l.nonAsciiHyphens) out.push(`- Non-ASCII hyphen ${h.codePoint} x${h.count}`);
    out.push(`- Career change/gap (keyword heuristic): expected ${l.careerChange.expected}, named ${l.careerChange.named}.`);
  }
  out.push(`- Timing (s): extract ${secs(r.timingsMs.extract)}, analyze ${secs(r.timingsMs.analyze)}, match ${secs(r.timingsMs.match)}, select ${secs(r.timingsMs.select)}, letter ${secs(r.timingsMs.letter)}.`);
  return out;
}

/**
 * Renders the whole report as Markdown: one summary table, then details per run.
 * In plain terms: the human-readable version of report.json.
 */
export function reportToMarkdown(report: Report): string {
  const lines = [
    `# Evaluation report ${report.startedAt}`,
    '',
    `Runs per persona: ${report.config.runs}. Proxy: ${report.config.proxyUrl}.`,
    '',
    ...report.notes.map((n) => `- ${n}`),
    '',
    '| Persona | Run | Covered | Key: true/false gap/false cover | Keywords base -> resume | Self-neg | Letter words | Flagged | Dupes | Banned | Odd hyphens | Career change | Total s |',
    '|---|---|---|---|---|---|---|---|---|---|---|---|---|',
    ...report.runs.map(row),
    '',
    '## Details',
    '',
    ...report.runs.flatMap((r) => [...details(r), '']),
  ];
  return lines.join('\n');
}
