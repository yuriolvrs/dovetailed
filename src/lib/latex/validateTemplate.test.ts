// What this file is: unit tests for validateTemplate.ts. The two bad
// templates are trimmed from the 2026-10-17 evaluation (eval-runs/2026-10-17/latex).
// In plain terms: proves the checker rejects the templates that broke before
// and accepts a good one.

import { describe, expect, it } from 'vitest';
import { validateTemplate } from './validateTemplate';

const PREAMBLE = String.raw`\documentclass{article}
\usepackage{enumitem}
\newcommand{\entry}[4]{\textbf{#1} \hfill #2\\ \textit{#3} \hfill \textit{#4}}
\begin{document}
`;

const SKILLS_LOOP = String.raw`{{#each skillGroups}}
{{category}}: {{itemsLine}}\\
{{/each}}`;

const GOOD =
  PREAMBLE +
  String.raw`
{\LARGE \textbf{{{name}}}}\\
{{email}} $|$ {{phone}} $|$ {{location}}
\section{Experience}
{{#each experience}}
\entry{{{title}}}{{{dateRange}}}{{{company}}}{ {{location}}}
\begin{itemize}[leftmargin=*]
  {{#each bullets}}
  \item {{.}}
  {{/each}}
\end{itemize}
{{/each}}
\section{Education}
{{#each education}}
\entry{{{degree}}}{{{dateRange}}}{{{school}}}{}
{{#if gpa}}GPA: {{gpa}}{{/if}}
{{/each}}
\section{Skills}
` +
  SKILLS_LOOP +
  String.raw`
\end{document}
`;

// Evaluation template A (trimmed): list field used outside #each, and a
// field (location) that education does not have.
const BAD_A = GOOD.replace(SKILLS_LOOP, '{{skillGroups.itemsLine}}').replace(
  '{{{school}}}{}',
  '{{{school}}}{ {{location}}}',
);

// Evaluation template C (trimmed): \item in Education, outside any list.
const BAD_C = GOOD.replace('{{#if gpa}}GPA: {{gpa}}{{/if}}', String.raw`{{#if gpa}}\item GPA: {{gpa}}{{/if}}`);

describe('validateTemplate', () => {
  it('accepts a well-formed template', () => {
    expect(validateTemplate(GOOD)).toEqual([]);
  });

  it('rejects a list field used outside its #each, with a fix hint', () => {
    const text = validateTemplate(BAD_A).join('\n');
    expect(text).toContain('`skillGroups.itemsLine` goes through the list `skillGroups`');
    expect(text).toContain('{{#each skillGroups}}');
  });

  it('rejects a field the current loop item does not have', () => {
    expect(validateTemplate(BAD_A).join('\n')).toContain('`location` is not a field available here');
  });

  it('rejects a plain tag on a list field', () => {
    const problems = validateTemplate(GOOD.replace('{{email}}', '{{skillGroups}}'));
    expect(problems.join('\n')).toContain('`skillGroups` is a list');
  });

  it('rejects {{.}} outside a list of strings', () => {
    expect(validateTemplate(GOOD.replace('{{email}}', '{{.}}')).join('\n')).toContain('`.` is not a field');
  });

  it('rejects an item command outside a list environment', () => {
    expect(validateTemplate(BAD_C).join('\n')).toContain(String.raw`\item` + '` appears outside a list');
  });

  it('accepts an item command inside a custom list environment', () => {
    const custom = GOOD.replace(
      String.raw`\begin{document}`,
      String.raw`\newenvironment{bul}{\begin{itemize}}{\end{itemize}}` + '\n' + String.raw`\begin{document}`,
    ).replace('{{#if gpa}}GPA: {{gpa}}{{/if}}', String.raw`\begin{bul}\item x\end{bul}`);
    expect(validateTemplate(custom)).toEqual([]);
  });

  it('reports a section the template never prints', () => {
    const noSkills = GOOD.replace(SKILLS_LOOP, '');
    expect(validateTemplate(noSkills).join('\n')).toContain('never prints the skills section');
  });

  it('reports unbalanced braces', () => {
    const broken = GOOD.replace(String.raw`\section{Skills}`, String.raw`\section{Skills`);
    expect(validateTemplate(broken).join('\n')).toContain('unbalanced curly braces');
  });

  it('reports mismatched environments', () => {
    const broken = GOOD.replace(String.raw`\end{itemize}`, String.raw`\end{enumerate}`);
    expect(validateTemplate(broken).join('\n')).toContain(String.raw`\end{enumerate} does not match`);
  });

  it('reports template syntax errors instead of throwing', () => {
    expect(validateTemplate('{{#each experience}}')).toEqual(['Missing closing tag {{/each}}.']);
  });
});
