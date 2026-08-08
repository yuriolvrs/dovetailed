import { describe, expect, it } from 'vitest';
import { fillLatexTemplate, repairBareCommandBraces, TemplateSyntaxError } from './fillTemplate';

describe('fillLatexTemplate', () => {
  it('substitutes a simple scalar placeholder, escaped, inside surrounding LaTeX braces', () => {
    expect(fillLatexTemplate('\\name{{{name}}}', { name: 'A & B' })).toBe('\\name{A \\& B}');
  });

  it('renders an each loop over a list of objects', () => {
    const template = '{{#each experience}}\\job{{title}} at {{company}}\n{{/each}}';
    const out = fillLatexTemplate(template, {
      experience: [
        { title: 'Engineer', company: 'Acme' },
        { title: 'Intern', company: 'Beta' },
      ],
    });
    expect(out).toBe('\\jobEngineer at Acme\n\\jobIntern at Beta\n');
  });

  it('renders an each loop over a list of strings using {{.}}', () => {
    const template = '{{#each bullets}}\\item {{.}}\n{{/each}}';
    const out = fillLatexTemplate(template, { bullets: ['Did a thing', 'Did another'] });
    expect(out).toBe('\\item Did a thing\n\\item Did another\n');
  });

  it('renders nested each loops (experience entries each with bullets)', () => {
    const template = '{{#each experience}}{{title}}: {{#each bullets}}[{{.}}]{{/each}}\n{{/each}}';
    const out = fillLatexTemplate(template, {
      experience: [{ title: 'Engineer', bullets: ['A', 'B'] }],
    });
    expect(out).toBe('Engineer: [A][B]\n');
  });

  it('omits an if block whose path is falsy/empty, keeps it when truthy', () => {
    const template = '{{#if gpa}}GPA: {{gpa}}{{/if}}';
    expect(fillLatexTemplate(template, { gpa: '' })).toBe('');
    expect(fillLatexTemplate(template, { gpa: '3.9' })).toBe('GPA: 3.9');
  });

  it('produces byte-identical output for the same template and data (deterministic)', () => {
    const template = '{{name}} -- {{#each experience}}{{title}}{{/each}}';
    const context = { name: 'Ada', experience: [{ title: 'Engineer' }] };
    expect(fillLatexTemplate(template, context)).toBe(fillLatexTemplate(template, context));
  });

  it('renders an empty string for a missing path', () => {
    expect(fillLatexTemplate('{{missing.deeply.nested}}', {})).toBe('');
  });

  it('throws TemplateSyntaxError on an unclosed each block', () => {
    expect(() => fillLatexTemplate('{{#each experience}}{{title}}', { experience: [] })).toThrow(
      TemplateSyntaxError,
    );
  });

  it('throws TemplateSyntaxError on a stray closing tag', () => {
    expect(() => fillLatexTemplate('{{/each}}', {})).toThrow(TemplateSyntaxError);
  });
});

describe('repairBareCommandBraces', () => {
  it('wraps a bare two-brace tag directly touching a command name', () => {
    expect(repairBareCommandBraces('\\textbf{{name}}')).toBe('\\textbf{{{name}}}');
  });

  it('fixes the exact real-world case that broke a live conversion (undefined \\textbfCompany)', () => {
    // Reproduces PROGRESS.md's "CV - Harvard-like" finding: every \textbf
    // substitution in that template lost its argument brace, which once
    // filled would render as literal "\textbfAcme Corp" -- LaTeX parses
    // that whole run of letters as one undefined control sequence.
    const broken = '\\textbf{{company}} \\hfill \n\n\\textbf{{title}} \\hfill {{dateRange}}';
    const repaired = repairBareCommandBraces(broken);
    expect(repaired).toBe('\\textbf{{{company}}} \\hfill \n\n\\textbf{{{title}}} \\hfill {{dateRange}}');
    const filled = fillLatexTemplate(repaired, { company: 'Acme Corp', title: 'Engineer', dateRange: '2020 -- 2021' });
    expect(filled).toBe('\\textbf{Acme Corp} \\hfill \n\n\\textbf{Engineer} \\hfill 2020 -- 2021');
  });

  it('leaves an already-correctly-wrapped three-brace group untouched', () => {
    expect(repairBareCommandBraces('\\textbf{{{name}}}')).toBe('\\textbf{{{name}}}');
  });

  it('leaves a tag with no adjacent command untouched', () => {
    expect(repairBareCommandBraces('Manila {{location}}')).toBe('Manila {{location}}');
  });

  it('leaves a tag separated from its command by a space untouched', () => {
    expect(repairBareCommandBraces('\\textbf {{name}}')).toBe('\\textbf {{name}}');
  });

  it('fixes multiple occurrences across a template', () => {
    const broken = '\\textbf{{name}} and \\textit{{title}}';
    expect(repairBareCommandBraces(broken)).toBe('\\textbf{{{name}}} and \\textit{{{title}}}');
  });

  it('is idempotent -- running it twice does not double-wrap', () => {
    const once = repairBareCommandBraces('\\textbf{{name}}');
    expect(repairBareCommandBraces(once)).toBe(once);
  });

  it('leaves an each/if block tag touching a command untouched (not a plain var)', () => {
    // {{#each ...}} bodies aren't a single-value substitution, so wrapping
    // them the same way would be meaningless/wrong.
    expect(repairBareCommandBraces('\\foo{{#each bar}}')).toBe('\\foo{{#each bar}}');
    expect(repairBareCommandBraces('\\foo{{/each}}')).toBe('\\foo{{/each}}');
  });
});
