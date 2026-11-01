// What this file is: the editable form for the whole extension profile (name, email, phone, address, links, experience, education, application answers). It reuses the main app's UI components.
// In plain terms: the form on the options page where you type the details used to fill job forms.
import { useMemo } from 'react';
import { EditableList } from '../../../src/components/EditableList';
import { DateRangeCompact } from '../../../src/components/profile/DateRangeFields';
import { Card, FieldInput, FieldSelect, SectionTitle } from '../../../src/components/ui/primitives';
import type { ContactLink, EducationEntry, ExperienceEntry } from '../../../src/types';
import { listCountries } from '../lib/countries';
import type { ExtensionProfile, PhoneNumber, PostalAddress } from '../types/profile';

const grid = 'grid grid-cols-1 gap-4 sm:grid-cols-2';

export function ProfileEditor({
  value,
  onChange,
}: {
  value: ExtensionProfile;
  onChange: (next: ExtensionProfile) => void;
}) {
  const countries = useMemo(listCountries, []);
  const countryNames = useMemo(() => countries.map((c) => c.name), [countries]);
  const phone: PhoneNumber = value.phone ?? { countryCallingCode: '', nationalNumber: '' };
  const address: PostalAddress = value.address ?? {};
  const set = (patch: Partial<ExtensionProfile>) => onChange({ ...value, ...patch });
  const setAddress = (patch: Partial<PostalAddress>) => set({ address: { ...address, ...patch } });
  const countryName = countries.find((c) => c.code === address.countryCode)?.name ?? '';

  return (
    <div className="space-y-5">
      <Card className="p-6">
        <SectionTitle sub="Used for name fields on application forms">Name and email</SectionTitle>
        <div className={grid}>
          <FieldInput label="First name" value={value.firstName} onChange={(firstName) => set({ firstName })} />
          <FieldInput label="Last name" value={value.lastName} onChange={(lastName) => set({ lastName })} />
          <FieldInput label="Email" type="email" value={value.email} onChange={(email) => set({ email })} />
        </div>
      </Card>

      <Card className="p-6">
        <SectionTitle sub="Digits only. A leading + or 0 is removed when you save">Phone</SectionTitle>
        <div className={grid}>
          <FieldInput
            label="Calling code"
            placeholder="63"
            value={phone.countryCallingCode}
            onChange={(countryCallingCode) => set({ phone: { ...phone, countryCallingCode } })}
          />
          <FieldInput
            label="National number"
            placeholder="9171234567"
            value={phone.nationalNumber}
            onChange={(nationalNumber) => set({ phone: { ...phone, nationalNumber } })}
          />
        </div>
      </Card>

      <Card className="p-6">
        <SectionTitle>Address</SectionTitle>
        <div className={grid}>
          <div className="sm:col-span-2">
            <FieldInput label="Street" value={address.street ?? ''} onChange={(street) => setAddress({ street })} />
          </div>
          <FieldInput label="City" value={address.city ?? ''} onChange={(city) => setAddress({ city })} />
          <FieldInput
            label="State or province"
            value={address.stateProvince ?? ''}
            onChange={(stateProvince) => setAddress({ stateProvince })}
          />
          <FieldSelect
            label="Country"
            value={countryName}
            options={countryNames}
            onChange={(name) => setAddress({ countryCode: countries.find((c) => c.name === name)?.code })}
          />
          <FieldInput
            label="Postal code"
            value={address.postalCode ?? ''}
            onChange={(postalCode) => setAddress({ postalCode })}
          />
        </div>
      </Card>

      <Card className="p-6">
        <SectionTitle sub="LinkedIn, GitHub and similar are found by the web address">Links</SectionTitle>
        <EditableList<ContactLink>
          items={value.links}
          onChange={(links) => set({ links })}
          newItem={() => ({ label: '', url: '' })}
          addLabel="Add link"
          emptyLabel="No links yet."
          renderItem={(link, update) => (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <FieldInput placeholder="Label (e.g. GitHub)" value={link.label} onChange={(label) => update({ ...link, label })} />
              <FieldInput placeholder="https://..." value={link.url} onChange={(url) => update({ ...link, url })} />
            </div>
          )}
        />
      </Card>

      <Card className="p-6">
        <SectionTitle>Experience</SectionTitle>
        <EditableList<ExperienceEntry>
          items={value.experience}
          onChange={(experience) => set({ experience })}
          newItem={() => ({ company: '', title: '', current: false, bullets: [] })}
          addLabel="Add job"
          emptyLabel="No jobs yet."
          renderItem={(job, update) => (
            <div className="space-y-3">
              <div className={grid}>
                <FieldInput label="Company" value={job.company} onChange={(company) => update({ ...job, company })} />
                <FieldInput label="Title" value={job.title} onChange={(title) => update({ ...job, title })} />
                <FieldInput label="Location" value={job.location ?? ''} onChange={(location) => update({ ...job, location })} />
              </div>
              <DateRangeCompact entry={job} update={update} currentLabel="I work here now" />
            </div>
          )}
        />
      </Card>

      <Card className="p-6">
        <SectionTitle>Education</SectionTitle>
        <EditableList<EducationEntry>
          items={value.education}
          onChange={(education) => set({ education })}
          newItem={() => ({ school: '', degree: '', current: false })}
          addLabel="Add school"
          emptyLabel="No schools yet."
          renderItem={(school, update) => (
            <div className="space-y-3">
              <div className={grid}>
                <FieldInput label="School" value={school.school} onChange={(s) => update({ ...school, school: s })} />
                <FieldInput label="Degree" value={school.degree} onChange={(degree) => update({ ...school, degree })} />
                <FieldInput label="Field" value={school.field ?? ''} onChange={(field) => update({ ...school, field })} />
              </div>
              <DateRangeCompact entry={school} update={update} currentLabel="Still studying" />
            </div>
          )}
        />
      </Card>

      <Card className="p-6">
        <SectionTitle sub="Filled only into a clear match">Application answers</SectionTitle>
        <div className={grid}>
          <FieldInput
            label="Expected salary"
            value={value.expectedSalary ?? ''}
            onChange={(expectedSalary) => set({ expectedSalary })}
          />
          <FieldInput
            label="Notice period"
            value={value.noticePeriod ?? ''}
            onChange={(noticePeriod) => set({ noticePeriod })}
          />
        </div>
      </Card>
    </div>
  );
}
