import { describe, expect, it } from 'vitest';
import { escapeLatex } from './escapeLatex';

describe('escapeLatex', () => {
  it('escapes every LaTeX special character', () => {
    expect(escapeLatex('100% & $5 #1 _foo {bar} ~x ^y')).toBe(
      '100\\% \\& \\$5 \\#1 \\_foo \\{bar\\} \\textasciitilde{}x \\textasciicircum{}y',
    );
  });

  it('escapes a literal backslash without re-escaping the replacement', () => {
    expect(escapeLatex('C:\\path')).toBe('C:\\textbackslash{}path');
  });

  it('leaves plain text untouched', () => {
    expect(escapeLatex('Software Engineer at Acme Co')).toBe('Software Engineer at Acme Co');
  });

  it('handles an empty string', () => {
    expect(escapeLatex('')).toBe('');
  });
});
