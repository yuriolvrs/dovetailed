// What this file is: the data shapes for the extension profile and its stored resume files.
// In plain terms: the list of facts the extension keeps about you, used to fill forms.
import type { ContactLink, ExperienceEntry, EducationEntry } from '../../../src/types';

export const EXTENSION_PROFILE_VERSION = 2;

export interface PhoneNumber {
  /** Digits only, no plus: "63". */
  countryCallingCode: string;
  /** Digits only, no trunk 0: "9171234567". */
  nationalNumber: string;
  /** ISO 3166-1 alpha-2, for display only: "+1" is shared by many countries. Filling ignores it. */
  countryCode?: string;
}

export interface PostalAddress {
  street?: string;
  city?: string;
  stateProvince?: string;
  /** ISO 3166-1 alpha-2: "PH". The full name comes from Intl.DisplayNames. */
  countryCode?: string;
  postalCode?: string;
}

export interface ResumeFileRef {
  id: string;
  fileName: string;
  /** application/pdf, or the DOCX type. */
  mimeType: string;
  sizeBytes: number;
  updatedAt: number;
  /** Where the bytes live. Widen this union when an API source exists. */
  storage: 'local';
}

/** Extension settings. Stored apart from the profile. */
export interface ExtensionSettings {
  /** Show the in-page Fill button on application forms. Off by default. */
  showFillButton: boolean;
}

export interface ExtensionProfile {
  version: number;
  firstName: string;
  lastName: string;
  email: string;
  phone?: PhoneNumber;
  address?: PostalAddress;
  /** Same shape as Dovetailed. LinkedIn and similar are found by URL host at fill time. */
  links: ContactLink[];
  experience: ExperienceEntry[];
  education: EducationEntry[];
  /** Stored resumes, in upload order. At most 10. */
  resumes: ResumeFileRef[];
  /** Plain stored answers, filled only into a clear match. */
  expectedSalary?: string;
  noticePeriod?: string;
}
