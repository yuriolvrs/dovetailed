// What this file is: the Generate step's Contact Information card --
// collapsible like the Work Experience/Education accordions, collapsed to a
// one-line "name · location" summary so it doesn't dominate the sticky left
// panel once it's already filled in.
// In plain terms: the contact-info box in the resume editor, collapsed to a
// single line until you click to edit it.

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { Contact } from '../../types';
import { EditableList } from '../EditableList';
import { Card, FieldInput } from '../ui/primitives';

export function ResumeContactSection({
  value,
  onChange,
}: {
  value: Contact;
  onChange: (contact: Contact) => void;
}) {
  const summary = [value.name, value.location].filter(Boolean).join(' · ');
  const [open, setOpen] = useState(() => summary === '');

  return (
    <Card className="p-0 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-3 px-6 py-4 text-left"
      >
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-slate-800">Contact Information</h2>
          {!open && (
            <p className="text-xs text-slate-400 mt-0.5 truncate">
              {summary || 'No contact details yet'}
            </p>
          )}
        </div>
        <ChevronDown
          size={14}
          className={`shrink-0 text-slate-400 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div className="px-6 pb-6">
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
      )}
    </Card>
  );
}
