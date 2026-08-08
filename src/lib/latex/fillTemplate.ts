// What this file is: the deterministic template engine that fills a
// placeholder LaTeX template (produced once by the LLM, see
// convertLatexTemplate.ts) with real resume data -- no LLM involved here at
// all (PRD §9: "filling the template is deterministic code"). Supports a
// small Handlebars-like subset: {{path}} scalar substitution (escaped via
// escapeLatex), {{#each path}}...{{/each}} for repeating sections
// (experience entries, bullets, ...), and {{#if path}}...{{/if}} for
// optional fields. Pure and side-effect-free, so filling the same template
// with the same data always produces byte-identical output (PRD §13
// acceptance criterion).
// In plain terms: takes your placeholder-ized LaTeX template and your
// resume data and stamps out the final .tex file, the same way every time.

import { escapeLatex } from './escapeLatex';

export class TemplateSyntaxError extends Error {}

type TemplateNode =
  | { type: 'text'; value: string }
  | { type: 'var'; path: string }
  | { type: 'each'; path: string; body: TemplateNode[] }
  | { type: 'if'; path: string; body: TemplateNode[] };

interface Token {
  type: 'text' | 'tag';
  value: string;
}

const TAG_REGEX = /\{\{([^{}]+)\}\}/g;

function tokenize(template: string): Token[] {
  const tokens: Token[] = [];
  let lastIndex = 0;
  TAG_REGEX.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = TAG_REGEX.exec(template)) !== null) {
    if (match.index > lastIndex) {
      tokens.push({ type: 'text', value: template.slice(lastIndex, match.index) });
    }
    tokens.push({ type: 'tag', value: match[1].trim() });
    lastIndex = TAG_REGEX.lastIndex;
  }
  if (lastIndex < template.length) {
    tokens.push({ type: 'text', value: template.slice(lastIndex) });
  }
  return tokens;
}

// `pos` is a shared mutable cursor so nested calls (for {{#each}}/{{#if}}
// bodies) continue from where the outer call left off.
function parseNodes(tokens: Token[], pos: { i: number }, closingTag: string | null): TemplateNode[] {
  const nodes: TemplateNode[] = [];
  while (pos.i < tokens.length) {
    const token = tokens[pos.i];
    if (token.type === 'text') {
      nodes.push({ type: 'text', value: token.value });
      pos.i++;
      continue;
    }
    if (token.value === closingTag) {
      pos.i++;
      return nodes;
    }
    if (token.value.startsWith('#each ')) {
      const path = token.value.slice('#each '.length).trim();
      pos.i++;
      nodes.push({ type: 'each', path, body: parseNodes(tokens, pos, '/each') });
      continue;
    }
    if (token.value.startsWith('#if ')) {
      const path = token.value.slice('#if '.length).trim();
      pos.i++;
      nodes.push({ type: 'if', path, body: parseNodes(tokens, pos, '/if') });
      continue;
    }
    if (token.value === '/each' || token.value === '/if') {
      throw new TemplateSyntaxError(`Unexpected closing tag {{${token.value}}} with no matching opening tag.`);
    }
    nodes.push({ type: 'var', path: token.value });
    pos.i++;
  }
  if (closingTag) {
    throw new TemplateSyntaxError(`Missing closing tag {{${closingTag}}}.`);
  }
  return nodes;
}

export function parseLatexTemplate(template: string): TemplateNode[] {
  return parseNodes(tokenize(template), { i: 0 }, null);
}

function resolvePath(context: unknown, path: string): unknown {
  if (path === '.') return context;
  return path.split('.').reduce<unknown>((acc, key) => {
    if (acc === null || typeof acc !== 'object') return undefined;
    return (acc as Record<string, unknown>)[key];
  }, context);
}

function isTruthy(value: unknown): boolean {
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'string') return value.trim() !== '';
  return Boolean(value);
}

function renderNodes(nodes: TemplateNode[], context: unknown): string {
  let out = '';
  for (const node of nodes) {
    switch (node.type) {
      case 'text':
        out += node.value;
        break;
      case 'var': {
        const value = resolvePath(context, node.path);
        out += escapeLatex(value === undefined || value === null ? '' : String(value));
        break;
      }
      case 'if':
        if (isTruthy(resolvePath(context, node.path))) out += renderNodes(node.body, context);
        break;
      case 'each': {
        const value = resolvePath(context, node.path);
        if (Array.isArray(value)) {
          for (const item of value) out += renderNodes(node.body, item);
        }
        break;
      }
    }
  }
  return out;
}

/**
 * Fills a placeholder LaTeX template with resume data (see
 * templateContext.ts's buildLatexContext for the available field shape).
 * In plain terms: produces the final filled-in .tex text.
 */
export function fillLatexTemplate(compiledTemplate: string, context: Record<string, unknown>): string {
  return renderNodes(parseLatexTemplate(compiledTemplate), context);
}

// Real-model finding (recurring, and on a second template far more
// widespread than the first -- see PROGRESS.md): the one-time conversion
// regularly drops a LaTeX command's own argument brace when substituting a
// placeholder directly inside it, e.g. \textbf{Company Name} becomes
// \textbf{{company}} (2 braces: just the tag's own) instead of the correct
// \textbf{{{company}}} (3 braces: the command's own { and }, plus the tag's
// own {{ }}). Once filled, that renders as literal, brace-less text right
// after the command name (e.g. "\textbfAcme Corp"), which LaTeX parses as
// part of the *command name itself* -- an undefined control sequence, not
// merely a formatting glitch. A prompt-only fix proved unreliable in
// practice, so this repairs the specific pattern deterministically: a
// backslash-letter command immediately followed by a bare {{path}} tag
// (with nothing between them) is missing its wrapping brace pair. This is
// narrow by design -- it only matches a *plain* two-brace tag directly
// touching a command name, so an already-correctly-wrapped three-brace
// group (\textbf{{{title}}}) is left untouched (its tag isn't immediately
// preceded by only two braces -- the inner content starts with a third `{`,
// which the "no braces inside" match below can't consume), and a tag with
// no adjacent command, or one separated by a space, is never touched either.
// In plain terms: fixes the specific, recurring mistake where the AI
// forgets to keep a LaTeX command's own curly braces around a substituted
// field, which otherwise breaks the whole document.
// The negative lookahead excludes {{#each ...}}/{{/each}}/{{#if ...}}/{{/if}}
// block tags -- those aren't a single-value substitution, so wrapping them
// the same way would be meaningless.
const BARE_COMMAND_TAG = /\\([a-zA-Z]+)(\{\{(?![#/])[^{}]+\}\})/g;

export function repairBareCommandBraces(compiledTemplate: string): string {
  return compiledTemplate.replace(BARE_COMMAND_TAG, '\\$1{$2}');
}
