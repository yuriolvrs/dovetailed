// What this file is: the print/export layout for a CoverLetterContent.
// Rendered twice on the Generate page, same convention as
// ResumePrintView: once as the actual print target (`variant` defaults to
// 'print' -- hidden on screen via `hidden print:block`), and once as a
// visible, non-interactive live preview next to the editor (`variant="preview"`).
// On the 'preview' variant, the greeting, each paragraph, and the closing
// are also clickable -- clicking calls onNavigate with a
// CoverLetterNavTarget, which CoverLetterSection uses to scroll the editor
// to and flash that same field.
// In plain terms: the plain, print-friendly layout of your cover letter --
// shown live as a preview while editing (click any line to jump to it in
// the editor), and used as-is when you print or "Save as PDF."

import { useEffect, useRef } from 'react';
import type { Contact, CoverLetterContent } from '../../types';
import type { CoverLetterNavTarget } from './coverLetterNav';

function today(): string {
  return new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
}

// Shared styling for a clickable preview line -- only applied on the
// 'preview' variant.
const navClickableClass = 'cursor-pointer rounded transition-colors hover:bg-slate-50 -mx-1 px-1';

export function CoverLetterPrintView({
  content,
  contact,
  variant = 'print',
  focusedParagraph = null,
  onNavigate,
}: {
  content: CoverLetterContent;
  contact: Contact;
  /** 'print': hidden on screen, the actual print target. 'preview': visible live preview, excluded from print output. */
  variant?: 'print' | 'preview';
  /** The paragraph currently focused in the editor, if any -- highlighted here on the 'preview' variant. */
  focusedParagraph?: number | null;
  /** Fired when a field is clicked on the 'preview' variant, so the editor can scroll to and open the matching field. */
  onNavigate?: (target: CoverLetterNavTarget) => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (focusedParagraph === null || variant !== 'preview' || !rootRef.current) return;
    const el = rootRef.current.querySelector(`[data-focus-key="paragraph:${focusedParagraph}"]`);
    el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [focusedParagraph, variant]);

  const rootClass =
    variant === 'preview'
      ? 'print:hidden text-slate-900 text-[15px] leading-relaxed font-sans bg-white rounded-2xl border border-slate-200 shadow-[0_1px_4px_rgba(15,23,42,0.06)] p-8'
      : 'hidden print:block text-slate-900 text-[15px] leading-relaxed font-sans';

  return (
    <div ref={rootRef} className={rootClass}>
      {variant === 'print' && (
        <style>{'@page { size: letter; margin: 0.75in; } p { orphans: 3; widows: 3; }'}</style>
      )}

      <div className="mb-6">
        <p className="text-[18px] font-bold tracking-wide">{contact.name}</p>
        {[contact.location, contact.phone, contact.email, ...contact.links.map((l) => l.url)]
          .filter(Boolean)
          .map((line, i) => (
            <p key={i} className="text-[15px] mt-0.5">
              {line}
            </p>
          ))}
      </div>

      <p className="mb-4">{today()}</p>

      {content.greeting.trim() !== '' && (
        <p
          className={`mb-4 ${variant === 'preview' && onNavigate ? navClickableClass : ''}`}
          onClick={variant === 'preview' ? () => onNavigate?.({ section: 'greeting' }) : undefined}
        >
          {content.greeting}
        </p>
      )}

      {content.paragraphs.map((p, i) => {
        if (p.trim() === '') return null;
        const focused = variant === 'preview' && focusedParagraph === i;
        return (
          <p
            key={i}
            data-focus-key={`paragraph:${i}`}
            style={variant === 'print' ? { breakInside: 'avoid' } : undefined}
            onClick={variant === 'preview' ? () => onNavigate?.({ section: 'paragraph', index: i }) : undefined}
            className={[
              'mb-4',
              focused ? 'bg-emerald-100' : '',
              variant === 'preview' && onNavigate ? navClickableClass : 'transition-colors',
            ].join(' ')}
          >
            {p}
          </p>
        );
      })}

      {content.closing.trim() !== '' && (
        <p
          style={variant === 'print' ? { breakInside: 'avoid' } : undefined}
          className={variant === 'preview' && onNavigate ? navClickableClass : ''}
          onClick={variant === 'preview' ? () => onNavigate?.({ section: 'closing' }) : undefined}
        >
          {content.closing}
          <br />
          {contact.name}
        </p>
      )}
    </div>
  );
}
