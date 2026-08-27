// What this file is: repair for text whose multi-byte UTF-8 punctuation was
// mis-decoded on the way in ("mojibake"), in both the intact form (the
// character's bytes arrive as separate Latin-1 code points) and the lossy
// form where the invisible C1 code points (U+0080-U+009F) were dropped in
// transit, leaving a bare "a-circumflex" behind. Shared by the LLM response
// path and by backup export/import.
// In plain terms: puts back the apostrophes, dashes and bullets that get
// garbled into junk letters.

// Mis-decoded UTF-8 always lands in the Latin-1 range, so a run of those code
// points is the only thing worth inspecting; plain ASCII never enters this
// path at all.
const HIGH_RANGE_RUN = /[\u0080-\u00ff]+/g;

// The lead code point of every mis-decoded three-byte character (U+00E2, the
// mis-decode of byte 0xE2), which is the whole U+2000 punctuation block:
// quotes, dashes, bullets, ellipsis.
const LEAD = '\u00e2';

const UTF8_DECODER = new TextDecoder('utf-8', { fatal: true });

// Evidence that a piece of text really is mis-decoded, rather than text that
// legitimately holds Latin-1 letters. A bare lead character is only guessed
// at once one of these has been seen, because it is also a real letter in
// French and Portuguese ("chateau" with a circumflex).
// In plain terms: proof that this text is garbled, so words that were always
// correct do not get "repaired".
const MOJIBAKE_MARKERS = [
  /[\u00c2-\u00f4][\u0080-\u00bf]/, // an intact mis-decoded sequence
  /[A-Za-z]\u00e2(?:s|t|d|m|ll|re|ve)\b/, // "McDonald[lead]s", "you[lead]ll"
  /\u00e2[\u00a0-\u00ff]/, // a bullet or ellipsis that lost its middle byte
  /\s\u00e2\s/, // the lead character standing alone as a word
];

// What a lost right single quote leaves behind in English contractions and
// possessives: the "s", "ll" or "ve" left after "McDonald[lead]s".
const CONTRACTION_SUFFIX = /^(?:s|t|d|m|ll|re|ve)\b/i;

function decodeUtf8(bytes: number[]): string | null {
  try {
    return UTF8_DECODER.decode(Uint8Array.from(bytes));
  } catch {
    return null;
  }
}

/**
 * Rebuilds a character whose C1 code points were dropped, leaving a run that
 * no longer decodes. Where one byte survived (U+00A0-U+00FF) the missing
 * middle byte is always 0x80, so the character comes back exactly. Where
 * nothing survived, only the neighbouring characters say which punctuation
 * mark it was, so this picks the likeliest one.
 * In plain terms: works out which quote or dash used to be there, from the
 * words on each side.
 */
function repairStrippedRun(run: string, text: string, offset: number): string {
  if (run[0] !== LEAD) return run;

  if (run.length === 2) {
    return decodeUtf8([0xe2, 0x80, run.charCodeAt(1)]) ?? run;
  }
  if (run.length > 2) return run;

  const before = text[offset - 1] ?? '';
  const after = text.slice(offset + 1);

  if (/[A-Za-z]/.test(before) && CONTRACTION_SUFFIX.test(after)) return '\u2019';
  if (/[A-Za-z0-9]/.test(before) && /^\s/.test(after)) return '\u2019'; // plural possessive
  if (/[A-Za-z0-9]/.test(before) && /^[A-Za-z0-9]/.test(after)) return '-'; // compound word
  if (/\s/.test(before) && /^\s/.test(after)) return '\u2014'; // em dash
  return run;
}

/**
 * Repairs mis-decoded punctuation in a piece of text and leaves everything
 * else exactly as it was. Runs of Latin-1 code points that decode as valid
 * UTF-8 are always restored; a bare lead character is guessed at only when
 * the text carries a mojibake marker, so genuine accented words survive.
 * In plain terms: fixes the garbled quotes, dashes and bullets in a piece of
 * text.
 */
export function repairText(text: string): string {
  if (!/[\u0080-\u00ff]/.test(text)) return text;

  const isGarbled = MOJIBAKE_MARKERS.some((marker) => marker.test(text));

  return text.replace(HIGH_RANGE_RUN, (run: string, offset: number) => {
    const decoded = decodeUtf8([...run].map((c) => c.charCodeAt(0)));
    if (decoded !== null) return decoded;
    return isGarbled ? repairStrippedRun(run, text, offset) : run;
  });
}
