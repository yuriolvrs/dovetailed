// What this file is: deterministic matching of a degree requirement (kind
// 'education') against the degree atoms of the profile. It ranks degree
// levels (high school < associate < bachelor < master < doctorate), checks a
// named field of study, and treats "or equivalent experience" as a soft
// requirement. No LLM call.
// In plain terms: decides whether your degree meets a job's degree
// requirement by comparing levels, so a bachelor's counts for an associate
// requirement and nobody has to ask an AI.

import type { ProfileAtom, Requirement, RequirementMatch } from '../../types';

const HIGH_SCHOOL = 1;
const ASSOCIATE = 2;
const BACHELOR = 3;
const MASTER = 4;
const DOCTORATE = 5;

// Short forms are case sensitive and must stand alone ("MS Office" is not a
// degree only when it is lower case, so we keep the capitals).
const abbr = (forms: string) => new RegExp(`(?<![A-Za-z.])(?:${forms})(?![A-Za-z])`);

const LEVEL_PATTERNS: [number, RegExp[]][] = [
  [HIGH_SCHOOL, [/high school|secondary school|\bGED\b/i]],
  [ASSOCIATE, [/associate/i, abbr('A\\.?A\\.?S?\\.?|A\\.?S\\.?N?\\.?')]],
  [
    BACHELOR,
    [
      /bachelor|undergraduate degree|college degree|university degree|four-year|4-year/i,
      abbr('B\\.?S\\.?N?\\.?|B\\.?A\\.?|BBA|B\\.?Sc\\.?|BEng|BFA'),
    ],
  ],
  [
    MASTER,
    [
      /master|graduate degree|advanced degree/i,
      abbr('M\\.?S\\.?N?\\.?|M\\.?A\\.?|MBA|M\\.?Sc\\.?|MEng|MFA|MSW|MPH|MPA|M\\.?Ed\\.?'),
    ],
  ],
  [DOCTORATE, [/doctorate|doctoral/i, abbr('Ph\\.?\\s?D\\.?|EdD|DNP|DBA')]],
];

/**
 * Every degree level named in a text. A requirement like "Bachelor's or
 * Master's" names two.
 * In plain terms: spots which kinds of degree a sentence talks about.
 */
export function degreeLevelsIn(text: string): number[] {
  const levels: number[] = [];
  for (const [level, patterns] of LEVEL_PATTERNS) {
    if (patterns.some((p) => p.test(text))) levels.push(level);
  }
  return levels;
}

const FIELD_STOPWORDS = new Set([
  'related', 'field', 'fields', 'similar', 'equivalent', 'relevant', 'discipline', 'disciplines',
  'area', 'areas', 'degree', 'program', 'studies', 'study',
]);

// Words of the field the requirement asks for ("Business, Marketing or a
// related field" gives business and marketing). Empty means no field is asked.
function requiredFieldWords(requirementText: string): string[] {
  const parts = requirementText.split(/\bin\b/i);
  if (parts.length < 2) return [];
  const tail = parts[parts.length - 1]
    .split(/\(|;|\bor equivalent\b|\bor relevant\b|\bwith\b|\bfrom\b|\bpreferred\b|\brequired\b/i)[0];
  return (tail.toLowerCase().match(/[a-z]{4,}/g) ?? []).filter((w) => !FIELD_STOPWORDS.has(w));
}

function fieldOk(words: string[], degreeText: string): boolean {
  if (words.length === 0) return true;
  let text = degreeText.toLowerCase();
  // These short forms already name their field.
  if (/\b[ABM]\.?S\.?N\b/i.test(degreeText)) text += ' nursing';
  if (/\bMBA\b/.test(degreeText)) text += ' business administration';
  return words.some((w) => text.includes(w.slice(0, 5)));
}

const EXPERIENCE_EQUIVALENT =
  /equivalent|\bor\s+(?:relevant\s+|related\s+|comparable\s+)?(?:work\s+|professional\s+)?experience/i;

/**
 * Matches one education requirement against the profile's education atoms
 * (the first atom of each education entry is its degree line; later atoms
 * are details). Equal or higher level is `full`; a named field the degree
 * does not mention is `partial`; "or equivalent experience" never leaves a
 * hard gap when the profile has experience.
 * In plain terms: says whether your degree is enough for the job's degree
 * requirement, and which line of your profile shows it.
 */
export function matchDegree(requirement: Requirement, atoms: ProfileAtom[]): RequirementMatch {
  const required = degreeLevelsIn(requirement.text);
  // A bare "degree" means any degree after school.
  const needed = required.length > 0 ? Math.min(...required) : ASSOCIATE;
  const fieldWords = requiredFieldWords(requirement.text);

  // Degree atom of each entry: the first education atom of its label.
  const degreeAtoms: ProfileAtom[] = [];
  const seen = new Set<string>();
  for (const atom of atoms) {
    if (atom.source !== 'education' || seen.has(atom.sourceLabel)) continue;
    seen.add(atom.sourceLabel);
    degreeAtoms.push(atom);
  }

  const full: ProfileAtom[] = [];
  const partial: ProfileAtom[] = [];
  for (const atom of degreeAtoms) {
    const have = degreeLevelsIn(atom.text);
    if (have.length === 0 || Math.max(...have) < needed) continue;
    (fieldOk(fieldWords, atom.text) ? full : partial).push(atom);
  }

  const id = requirement.id;
  if (full.length > 0) return { requirementId: id, status: 'full', atomIds: full.map((a) => a.id) };
  if (partial.length > 0) return { requirementId: id, status: 'partial', atomIds: partial.map((a) => a.id) };

  if (EXPERIENCE_EQUIVALENT.test(requirement.text)) {
    const experience = atoms.find((a) => a.source === 'experience');
    if (experience) return { requirementId: id, status: 'partial', atomIds: [experience.id] };
  }

  if (degreeAtoms.length === 0) return { requirementId: id, status: 'gap_no_candidates', atomIds: [] };
  return {
    requirementId: id,
    status: 'gap_unverified',
    atomIds: [],
    consideredAtomIds: degreeAtoms.map((a) => a.id),
  };
}
