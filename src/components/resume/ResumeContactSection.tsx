// What this file is: the Generate step's Contact Information card --
// collapsible like the Work Experience/Education accordions, collapsed to a
// one-line "name · location" summary so it doesn't dominate the sticky left
// panel once it's already filled in. Clicking the contact block in the live
// preview (ResumePrintView's onNavigate) opens and scrolls to this card via
// navRequest.
// In plain terms: the contact-info box in the resume editor, collapsed to a
// single line until you click to edit it, or automatically opened and
// scrolled into view when you click the contact block in the preview.

import { useEffect, useRef, useState } from 'react';
import type { Contact } from '../../types';
import { EditableList } from '../EditableList';
import { Card, Collapsible, CollapsibleSectionHeader, FieldInput } from '../ui/primitives';

export function ResumeContactSection({
  value,
  onChange,
  navRequest,
}: {
  value: Contact;
  onChange: (contact: Contact) => void;
  /** A click on the contact block in the live preview, requesting this card open and scroll into view. */
  navRequest?: { nonce: number } | null;
}) {
  const summary = [value.name, value.location].filter(Boolean).join(' · ');
  const [open, setOpen] = useState(() => summary === '');
  const [highlighted, setHighlighted] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!navRequest) return;
    setOpen(true);
    setHighlighted(true);
    containerRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    const timer = setTimeout(() => setHighlighted(false), 1500);
    // Also unconditionally clears the highlight on cleanup -- otherwise
    // when navRequest flips to null (the user clicked a different section
    // in the preview), this effect reruns, its cleanup cancels the pending
    // "un-highlight" timeout, and the highlight is left stuck on forever.
    return () => {
      clearTimeout(timer);
      setHighlighted(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navRequest?.nonce]);

  return (
    <Card ref={containerRef} className={`p-6 transition-colors ${highlighted ? 'ring-2 ring-amber-300' : ''}`}>
      <CollapsibleSectionHeader
        title="Contact Information"
        sub={!open ? summary || 'No contact details yet' : undefined}
        open={open}
        onToggle={() => setOpen((o) => !o)}
      />
      <Collapsible open={open}>
        <div>
          <div className="grid grid-cols-2 gap-4 mb-5">
            <div className="col-span-2">
              <FieldInput label="Name" value={value.name} onChange={(name) => onChange({ ...value, name })} />
            </div>
            <FieldInput
              label="Email"
              type="email"
              value={value.email}
              onChange={(email) => onChange({ ...value, email })}
            />
            <FieldInput
              label="Phone"
              value={value.phone ?? ''}
              onChange={(phone) => onChange({ ...value, phone })}
            />
            <div className="col-span-2">
              <FieldInput
                label="Location"
                value={value.location ?? ''}
                onChange={(location) => onChange({ ...value, location })}
              />
            </div>
          </div>
          <div>
            <span className="mb-2 block text-[11px] font-semibold text-slate-400 uppercase tracking-widest">
              Links
            </span>
            <EditableList
              items={value.links}
              onChange={(links) => onChange({ ...value, links })}
              newItem={() => ({ label: '', url: '' })}
              addLabel="Add link"
              emptyLabel="No links yet."
              renderItem={(link, update) => (
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <FieldInput
                    placeholder="Label (e.g. GitHub)"
                    value={link.label}
                    onChange={(label) => update({ ...link, label })}
                  />
                  <FieldInput
                    placeholder="https://..."
                    value={link.url}
                    onChange={(url) => update({ ...link, url })}
                  />
                </div>
              )}
            />
          </div>
        </div>
      </Collapsible>
    </Card>
  );
}
