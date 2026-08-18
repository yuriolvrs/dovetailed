// What this file is: the editable form for the Contact section of the
// profile — name, email, phone, location, and a list of links.
// In plain terms: the form where you fill in your name, email, and other
// contact details.

import type { Contact, ContactLink } from '../../types';
import { EditableList } from '../EditableList';
import { Card, FieldInput, SectionTitle } from '../ui/primitives';

export function ContactForm({
  value,
  onChange,
}: {
  value: Contact;
  onChange: (contact: Contact) => void;
}) {
  return (
    <Card className="p-6">
      <SectionTitle sub="Appears at the top of your resume">Contact Information</SectionTitle>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
        <div className="col-span-1 sm:col-span-2">
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
        <div className="col-span-1 sm:col-span-2">
          <FieldInput
            label="Location"
            value={value.location ?? ''}
            onChange={(location) => onChange({ ...value, location })}
          />
        </div>
      </div>
      <div>
        <span className="mb-2 block text-[11px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-widest">
          Links
        </span>
        <EditableList<ContactLink>
          items={value.links}
          onChange={(links) => onChange({ ...value, links })}
          newItem={() => ({ label: '', url: '' })}
          addLabel="Add link"
          emptyLabel="No links yet."
          reorderable
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
    </Card>
  );
}
