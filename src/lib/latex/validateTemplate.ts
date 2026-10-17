// What this file is: a deterministic check of a converted LaTeX placeholder
// template. It finds placeholders that cannot resolve against the real fill
// context, resume sections the template never prints, and filled output that
// would not compile (unbalanced braces, mismatched \begin/\end, \item outside
// a list). No LLM involved.
// In plain terms: catches a broken converted template before it is saved, so
// an empty Skills section or a LaTeX error does not surprise you later.

import type { ResumeContent } from '../../types';
import { fillLatexTemplate, parseLatexTemplate, TemplateSyntaxError } from './fillTemplate';
import { buildLatexContext } from './templateContext';

/**
 * A resume with every field filled (gpa, summary, links, details, projects),
 * used to learn the context shape and to fill the template for the static
 * output check.
 * In plain terms: a made-up, complete resume used only for testing templates.
 */
export const SAMPLE_RESUME: ResumeContent = {
  contact: {
    name: 'Jane Doe',
    email: 'jane@example.com',
    phone: '555-0100',
    location: 'Austin, TX',
    links: [{ label: 'GitHub', url: 'https://github.com/janedoe' }],
  },
  summary: 'Operations coordinator with five years of scheduling experience.',
  skills: [{ category: 'Tools', items: ['Excel', 'Shopify'] }],
  experience: [
    {
      company: 'Acme Corp',
      title: 'Coordinator',
      startMonth: '01',
      startYear: '2020',
      endMonth: '06',
      endYear: '2023',
      current: false,
      location: 'Austin, TX',
      bullets: ['Scheduled client visits.', 'Tracked no-shows in a spreadsheet.'],
    },
  ],
  projects: [
    {
      name: 'Booking tool',
      description: 'A small scheduling app.',
      bullets: ['Built a booking form.'],
      links: [{ label: 'Repo', url: 'https://github.com/janedoe/booking' }],
    },
  ],
  education: [
    {
      school: 'State University',
      degree: 'B.S.',
      field: 'Business',
      startYear: '2016',
      endYear: '2020',
      current: false,
      gpa: '3.8',
      details: ['Dean\'s list'],
    },
  ],
};

// What a name in the context is: a plain value, a list of plain strings, or a
// list of objects (each with its own fields).
type Shape =
  | { kind: 'scalar' }
  | { kind: 'strings' }
  | { kind: 'objects'; item: Record<string, Shape> };

function shapeOf(value: unknown): Shape {
  if (Array.isArray(value)) {
    const first = value[0];
    if (first !== null && typeof first === 'object') return { kind: 'objects', item: objectShape(first) };
    return { kind: 'strings' };
  }
  return { kind: 'scalar' };
}

function objectShape(obj: object): Record<string, Shape> {
  return Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, shapeOf(v)]));
}

// Sections that must be printed. The key is the context root name.
const REQUIRED_SECTIONS: Record<string, string> = {
  experience: 'experience',
  education: 'education',
  skillGroups: 'skills',
};

type Nodes = ReturnType<typeof parseLatexTemplate>;
// The scope a tag resolves against: an object's fields, or a string item.
type Scope = { fields: Record<string, Shape> } | { stringItem: true };

function checkNodes(nodes: Nodes, scope: Scope, isRoot: boolean, problems: string[], roots: Set<string>): void {
  const resolve = (path: string): Shape | 'unknown' | 'self' => {
    if (path === '.') return 'stringItem' in scope ? 'self' : 'unknown';
    if ('stringItem' in scope) return 'unknown';
    const first = path.split('.')[0];
    if (isRoot) roots.add(first);
    let fields: Record<string, Shape> | undefined = scope.fields;
    let shape: Shape | undefined;
    for (const [i, key] of path.split('.').entries()) {
      shape = fields?.[key];
      if (!shape) return 'unknown';
      if (i < path.split('.').length - 1) {
        // Walking through a list outside its #each cannot work.
        if (shape.kind !== 'scalar') {
          problems.push(
            `\`${path}\` goes through the list \`${key}\`; use {{#each ${key}}}...{{/each}} and name the field inside it.`,
          );
          return 'self';
        }
        fields = undefined;
      }
    }
    return shape ?? 'unknown';
  };

  for (const node of nodes) {
    if (node.type === 'text') continue;
    const found = resolve(node.path);
    if (node.type === 'var') {
      if (found === 'unknown') {
        problems.push(`\`${node.path}\` is not a field available here; check the field name and that it is inside the right {{#each}}.`);
      } else if (found !== 'self' && found.kind !== 'scalar') {
        const item = found.kind === 'strings' ? '{{.}}' : 'its fields';
        problems.push(`\`${node.path}\` is a list; use {{#each ${node.path}}}...{{/each}} and put ${item} inside.`);
      }
    } else if (node.type === 'each') {
      if (found === 'unknown') {
        problems.push(`\`${node.path}\` in {{#each}} is not a field available here.`);
      } else if (found === 'self' || found.kind === 'scalar') {
        if (found !== 'self') problems.push(`\`${node.path}\` is a single value, not a list; do not use {{#each}} on it.`);
      } else {
        const inner: Scope = found.kind === 'objects' ? { fields: found.item } : { stringItem: true };
        checkNodes(node.body, inner, false, problems, roots);
      }
    } else if (found === 'unknown') {
      problems.push(`\`${node.path}\` in {{#if}} is not a field available here.`);
    } else {
      checkNodes(node.body, scope, isRoot, problems, roots);
    }
  }
}

// Drops % comments, keeping \% (escaped percent) text.
function stripComments(tex: string): string {
  return tex
    .split('\n')
    .map((line) => {
      for (let i = 0; i < line.length; i++) {
        if (line[i] === '\\') i++;
        else if (line[i] === '%') return line.slice(0, i);
      }
      return line;
    })
    .join('\n');
}

function bracesBalanced(tex: string): boolean {
  let depth = 0;
  for (let i = 0; i < tex.length; i++) {
    const ch = tex[i];
    if (ch === '\\') i++;
    else if (ch === '{') depth++;
    else if (ch === '}' && --depth < 0) return false;
  }
  return depth === 0;
}

const BASE_LIST_ENVS = ['itemize', 'enumerate', 'description'];

// Environments the template defines that behave like lists.
function customListEnvs(tex: string): string[] {
  const names: string[] = [];
  for (const m of tex.matchAll(/\\(?:re)?newlist\{(\w+)\}/g)) names.push(m[1]);
  for (const m of tex.matchAll(/\\(?:re)?newenvironment\{(\w+)\}/g)) {
    const definition = tex.slice(m.index, m.index + 400);
    if (/\\begin\{(itemize|enumerate|description)\}/.test(definition)) names.push(m[1]);
  }
  return names;
}

// Checks \begin/\end pairing and \item placement in the document body.
function checkEnvironments(tex: string, problems: string[]): void {
  const listEnvs = new Set([...BASE_LIST_ENVS, ...customListEnvs(tex)]);
  const start = tex.indexOf('\\begin{document}');
  const body = start >= 0 ? tex.slice(start) : tex;
  const stack: string[] = [];
  for (const m of body.matchAll(/\\(begin|end)\{([^}]+)\}|\\item(?![a-zA-Z])/g)) {
    if (m[1] === 'begin') {
      stack.push(m[2]);
    } else if (m[1] === 'end') {
      const top = stack.pop();
      if (top !== m[2]) {
        problems.push(`\\end{${m[2]}} does not match the open \\begin{${top ?? 'nothing'}}.`);
        return;
      }
    } else if (!stack.some((env) => listEnvs.has(env))) {
      problems.push('`\\item` appears outside a list; put it inside \\begin{itemize}...\\end{itemize}.');
    }
  }
  if (stack.length > 0) problems.push(`\\begin{${stack[stack.length - 1]}} is never closed.`);
}

/**
 * Checks a placeholder template and returns a list of plain-language
 * problems. An empty list means no problem was found.
 * In plain terms: tells you what is wrong with a converted template, in words.
 */
export function validateTemplate(template: string): string[] {
  const problems: string[] = [];
  let nodes: Nodes;
  try {
    nodes = parseLatexTemplate(template);
  } catch (err) {
    if (err instanceof TemplateSyntaxError) return [err.message];
    throw err;
  }

  const context = buildLatexContext(SAMPLE_RESUME);
  const roots = new Set<string>();
  checkNodes(nodes, { fields: objectShape(context) }, true, problems, roots);
  for (const [root, label] of Object.entries(REQUIRED_SECTIONS)) {
    if (!roots.has(root)) {
      problems.push(`The template never prints the ${label} section; use {{#each ${root}}}...{{/each}}.`);
    }
  }

  const filled = stripComments(fillLatexTemplate(template, context));
  if (!bracesBalanced(filled)) problems.push('The filled template has unbalanced curly braces.');
  checkEnvironments(filled, problems);

  return [...new Set(problems)];
}
