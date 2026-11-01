// What this file is: the editable form for the whole extension profile (contact, address, links, experience, education, application answers), laid out as flat sections. It reuses the main app's UI components.
// In plain terms: the form on the options page where you type the details used to fill job forms.
import { useMemo } from 'react';
import type { ReactNode } from 'react';
import { Plus } from 'lucide-react';
import { EditableList } from '../../../src/components/EditableList';
import { DateRangeCompact } from '../../../src/components/profile/DateRangeFields';
import { Btn, FieldInput, fieldLabelClass } from '../../../src/components/ui/primitives';
import type { ContactLink, EducationEntry, ExperienceEntry } from '../../../src/types';
import { callingCode, listPhoneCountries, phoneCountry } from '../lib/callingCodes';
import { listCountries } from '../lib/countries';
import type { ExtensionProfile, PhoneNumber, PostalAddress } from '../types/profile';
import { CountryCombobox } from './CountryCombobox';
import { SettingsSection } from './SettingsSection';

const grid = 'grid grid-cols-1 gap-4 sm:grid-cols-2';

// Rows of a flat list are inset by their border and padding (7px). Pulling the list
// left by that much lines the fields up with the other sections. The shared empty
// state is restyled here from a dashed box to plain muted text.
// From md up the list is also pulled right by the remove button's width (17px button,
// 8px gap, 7px row inset), so field edges match the other sections.
// Prose rows get a wide gap (!mt-8) so each entry reads as a group.
const listClass =
  '-ml-[7px] md:-mr-[32px] [&>.border-2]:border-0 [&>.border-2]:py-0 [&>.border-2]:pl-[7px] [&>.border-2]:text-left [&>.border-2]:text-sm';
const proseGap = '[&>div>[data-index]:not(:first-child)]:!mt-8';

/**
 * A list of rows with no boxes and its own Add button, aligned to the fields.
 * In plain terms: the "add another link, job or school" list.
 */
function FlatList<T>({
  variant,
  items,
  onChange,
  newItem,
  addLabel,
  emptyLabel,
  renderItem,
}: {
  variant: 'flat' | 'prose';
  items: T[];
  onChange: (items: T[]) => void;
  newItem: () => T;
  addLabel: string;
  emptyLabel: string;
  renderItem: (item: T, update: (next: T) => void) => ReactNode;
}) {
  return (
    <div>
      <div className={`${listClass} ${variant === 'prose' ? proseGap : ''}`}>
        <EditableList<T>
          variant={variant}
          items={items}
          onChange={onChange}
          newItem={newItem}
          emptyLabel={emptyLabel}
          hideAddButton
          renderItem={renderItem}
        />
      </div>
      <div className="mt-3">
        <Btn size="sm" variant="secondary" onClick={() => onChange([...items, newItem()])}>
          <Plus size={13} />
          {addLabel}
        </Btn>
      </div>
    </div>
  );
}

/** The date range under a small label, so it lines up with the field beside it. */
function Dates({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className={fieldLabelClass}>Dates</span>
      {children}
    </div>
  );
}

export function ProfileEditor({
  value,
  onChange,
}: {
  value: ExtensionProfile;
  onChange: (next: ExtensionProfile) => void;
}) {
  const countries = useMemo(listCountries, []);
  const phone: PhoneNumber = value.phone ?? { countryCallingCode: '', nationalNumber: '' };
  const address: PostalAddress = value.address ?? {};
  const set = (patch: Partial<ExtensionProfile>) => onChange({ ...value, ...patch });
  const phoneCountries = useMemo(() => listPhoneCountries(countries), [countries]);
  const setPhoneCountry = (countryCode: string | undefined) =>
    set({
      phone: { ...phone, countryCode, countryCallingCode: (countryCode && callingCode(countryCode)) || '' },
    });
  const setAddress = (patch: Partial<PostalAddress>) => set({ address: { ...address, ...patch } });
  // A new address country sets the phone country only while none is stored.
  const setAddressCountry = (countryCode: string | undefined) => {
    const next = { ...value, address: { ...address, countryCode } };
    const code = countryCode && callingCode(countryCode);
    if (code && !phone.countryCallingCode) next.phone = { ...phone, countryCode, countryCallingCode: code };
    onChange(next);
  };

  return (
    <>
      <SettingsSection title="Contact" hint="Used for name, email and phone fields on application forms.">
        <div className={grid}>
          <FieldInput label="First name" value={value.firstName} onChange={(firstName) => set({ firstName })} />
          <FieldInput label="Last name" value={value.lastName} onChange={(lastName) => set({ lastName })} />
          <div className="sm:col-span-2">
            <FieldInput label="Email" type="email" value={value.email} onChange={(email) => set({ email })} />
          </div>
          <div className="sm:col-span-2">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <CountryCombobox
                label="Phone country"
                value={phoneCountry(value.phone, address.countryCode)}
                countries={phoneCountries}
                onChange={setPhoneCountry}
              />
              <FieldInput
                label="National number"
                placeholder="9171234567"
                value={phone.nationalNumber}
                onChange={(nationalNumber) => set({ phone: { ...phone, nationalNumber } })}
              />
            </div>
            <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-400">
              Digits only. A leading 0 is removed when you save.
            </p>
          </div>
        </div>
      </SettingsSection>

      <SettingsSection title="Address">
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
          <CountryCombobox
            label="Country"
            value={address.countryCode}
            countries={countries}
            onChange={setAddressCountry}
          />
          <FieldInput
            label="Postal code"
            value={address.postalCode ?? ''}
            onChange={(postalCode) => setAddress({ postalCode })}
          />
        </div>
      </SettingsSection>

      <SettingsSection title="Links" hint="LinkedIn, GitHub and similar are found by the web address.">
        <FlatList<ContactLink>
          variant="flat"
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
      </SettingsSection>

      <SettingsSection title="Experience">
        <FlatList<ExperienceEntry>
          variant="prose"
          items={value.experience}
          onChange={(experience) => set({ experience })}
          newItem={() => ({ company: '', title: '', current: false, bullets: [] })}
          addLabel="Add job"
          emptyLabel="No jobs yet."
          renderItem={(job, update) => (
            <div className="space-y-4">
              <div className={grid}>
                <FieldInput label="Company" value={job.company} onChange={(company) => update({ ...job, company })} />
                <FieldInput label="Title" value={job.title} onChange={(title) => update({ ...job, title })} />
              </div>
              <div className={`${grid} items-start`}>
                <FieldInput label="Location" value={job.location ?? ''} onChange={(location) => update({ ...job, location })} />
                <Dates>
                  <DateRangeCompact entry={job} update={update} currentLabel="I work here now" />
                </Dates>
              </div>
            </div>
          )}
        />
      </SettingsSection>

      <SettingsSection title="Education">
        <FlatList<EducationEntry>
          variant="prose"
          items={value.education}
          onChange={(education) => set({ education })}
          newItem={() => ({ school: '', degree: '', current: false })}
          addLabel="Add school"
          emptyLabel="No schools yet."
          renderItem={(school, update) => (
            <div className="space-y-4">
              <div className={grid}>
                <FieldInput label="School" value={school.school} onChange={(s) => update({ ...school, school: s })} />
                <FieldInput label="Degree" value={school.degree} onChange={(degree) => update({ ...school, degree })} />
              </div>
              <div className={`${grid} items-start`}>
                <FieldInput label="Field" value={school.field ?? ''} onChange={(field) => update({ ...school, field })} />
                <Dates>
                  <DateRangeCompact entry={school} update={update} currentLabel="Still studying" />
                </Dates>
              </div>
            </div>
          )}
        />
      </SettingsSection>

      <SettingsSection title="Application answers" hint="Filled only into a clear match.">
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
      </SettingsSection>
    </>
  );
}
