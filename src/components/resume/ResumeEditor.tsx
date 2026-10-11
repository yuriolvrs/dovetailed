// What this file is: the field-editable form for a generated resume. It is
// the Profile page's own sections (ProfileSections.tsx) over this resume's
// copy of the data: entries read as resume lines and open in place, plus
// resume-only extras -- match badges, bullets and entries this resume left
// out, Reset to profile, and opening an entry from a preview click. Sections are ordered
// to match the printed layout (contact, education, experience, projects,
// skills -- see ResumePrintView) so the editor and the live preview next to
// it read top-to-bottom in the same order. Every bullet shown is copied
// verbatim from the profile (selection, not generation -- see
// selectResumeContent.ts), so there's
// nothing to warn about fabrication-wise; a small "Matched to this job"
// badge just shows which bullets were prioritized because they're linked to
// a requirement. Experience/project bullets also get an opt-in "Suggest
// rewording" action (BulletRewriteSuggest) -- the one place in resume
// editing that does call the LLM, on explicit per-bullet request only,
// never automatically.
// In plain terms: the screen where you review and fine-tune a tailored
// resume before exporting it, optionally asking the AI for alternate
// phrasing on individual bullets.

import { useMemo } from 'react';
import { Check } from 'lucide-react';
import type { ExperienceEntry, JobAnalysis, Profile, ProjectEntry, ResumeContent, SourceMapEntry } from '../../types';
import {
  educationKey,
  experienceKey,
  projectKey,
  type ResumeFocusTarget,
  type ResumeNavTarget,
} from '../../lib/resumeEntryKeys';
import { BulletPicker } from '../BulletPicker';
import { Badge, ResetButton } from '../ui/primitives';
import {
  ContactSection,
  EducationSection,
  ExperienceSection,
  ProjectsSection,
  SkillsSection,
} from '../profile/ProfileSections';

// Collapses whitespace, case, and trailing punctuation before comparing
// bullet text to the sourceMap, so a trivial edit (fixing a typo, tidying
// spacing, adding a period) doesn't silently drop the "Matched to this job"
// badge -- a substantial rewrite still won't match, which is the intended
// "editing it is the user taking
// ownership" behavior.
// In plain terms: lets small wording tweaks keep the "Matched" badge, while
// a real rewrite still loses it.
function normalizeForMatch(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[.,;:!?]+$/, '');
}

export function ResumeEditor({
  value,
  sourceMap,
  analysis,
  profile,
  onChange,
  onFocusBullet,
  navRequest,
}: {
  value: ResumeContent;
  sourceMap: SourceMapEntry[];
  /** This posting's requirements + matches, used to name which requirement a matched bullet satisfies. */
  /**
   * The matched route's analysis, used only to name the specific requirement a
   * bullet satisfies. Absent on the direct route, which has no requirement
   * list -- the "chosen for this job" badge still shows, it just can't name a
   * requirement behind it.
   */
  analysis?: JobAnalysis;
  /** The full source profile, used only to offer back bullets the automatic selection left out (see BulletPicker). */
  profile: Profile;
  onChange: (content: ResumeContent) => void;
  /** Reports which bullet field has focus (or null on blur), so the live preview can highlight it. */
  onFocusBullet: (target: ResumeFocusTarget | null) => void;
  /** A field clicked in the live preview, to scroll to and open here -- see ResumePrintView's onNavigate. */
  navRequest?: { target: ResumeNavTarget; nonce: number } | null;
}) {
  const profileExperienceByKey = useMemo(
    () => new Map(profile.experience.map((e) => [experienceKey(e), e])),
    [profile.experience],
  );
  const profileProjectByKey = useMemo(
    () => new Map(profile.projects.map((p) => [projectKey(p), p])),
    [profile.projects],
  );

  function profileBulletsForExperience(entry: ExperienceEntry): string[] {
    return profileExperienceByKey.get(experienceKey(entry))?.bullets ?? entry.bullets;
  }

  function profileBulletsForProject(entry: ProjectEntry): string[] {
    return profileProjectByKey.get(projectKey(entry))?.bullets ?? entry.bullets;
  }

  // Profile entries not currently in this resume (removed by the user here,
  // or never auto-selected), offered back via each section's "Not included"
  // picker -- removing an entry from a resume never deletes it from the
  // profile, so it must stay reachable.
  const includedExperienceKeys = useMemo(
    () => new Set(value.experience.map(experienceKey)),
    [value.experience],
  );
  const excludedExperience = useMemo(
    () => profile.experience.filter((e) => !includedExperienceKeys.has(experienceKey(e))),
    [profile.experience, includedExperienceKeys],
  );
  const includedProjectKeys = useMemo(() => new Set(value.projects.map(projectKey)), [value.projects]);
  const excludedProjects = useMemo(
    () => profile.projects.filter((p) => !includedProjectKeys.has(projectKey(p))),
    [profile.projects, includedProjectKeys],
  );
  const atomIdsByNormalizedText = useMemo(
    () => new Map(sourceMap.map((e) => [normalizeForMatch(e.generatedText), e.atomIds])),
    [sourceMap],
  );

  // Every atom's first confirmed requirement, so a matched bullet can name
  // the specific requirement it satisfies instead of just "matched".
  const requirementTextByAtomId = useMemo(() => {
    const map = new Map<string, string>();
    if (!analysis) return map;
    const requirementTextById = new Map(analysis.requirements.map((r) => [r.id, r.text]));
    for (const match of analysis.matches) {
      const text = requirementTextById.get(match.requirementId);
      if (!text) continue;
      for (const atomId of match.atomIds) {
        if (!map.has(atomId)) map.set(atomId, text);
      }
    }
    return map;
  }, [analysis]);

  // Requirement text a bullet is matched to, or null if unmatched -- used by
  // the Work Experience accordion's per-entry badge and per-bullet labels.
  function bulletMatch(bulletText: string): string | null {
    const atomIds = atomIdsByNormalizedText.get(normalizeForMatch(bulletText));
    if (!atomIds || atomIds.length === 0) return null;
    for (const atomId of atomIds) {
      const text = requirementTextByAtomId.get(atomId);
      if (text) return text;
    }
    return null;
  }

  // Whether this bullet was selected for the job at all, independent of
  // whether a requirement can be named behind it. The direct route selects
  // without extracting requirements, so bulletMatch is always null there --
  // relying on it alone would flag every deliberately chosen bullet as "not
  // matched yet", which is exactly backwards.
  // In plain terms: did the app pick this bullet for this job, whichever
  // method was used.
  function bulletChosen(bulletText: string): boolean {
    const atomIds = atomIdsByNormalizedText.get(normalizeForMatch(bulletText));
    return Boolean(atomIds && atomIds.length > 0);
  }

  // The label beside a bullet: the requirement it answers when one can be
  // named, else "chosen" when the app picked it without naming one.
  function bulletBadge(bulletText: string) {
    const requirement = bulletMatch(bulletText);
    if (!requirement && !bulletChosen(bulletText)) return null;
    return (
      <Badge color="green">
        <Check size={11} />
        {requirement ? `Matches: ${requirement}` : 'Chosen for this job'}
      </Badge>
    );
  }

  // How many of an entry's bullets were picked for this job, beside its title.
  function entryBadge(entry: { bullets: string[] }) {
    const chosen = entry.bullets.filter(bulletChosen).length;
    if (chosen === 0) return null;
    return (
      <Badge color="green">
        <Check size={11} />
        {chosen} matched
      </Badge>
    );
  }

  // Preview clicks name an entry by key; the sections open it by index.
  const target = navRequest?.target;
  const nonce = navRequest?.nonce ?? 0;
  const navTo = (index: number) => (index >= 0 ? { index, nonce } : null);
  const educationNav =
    target?.section === 'education' ? navTo(value.education.findIndex((e) => educationKey(e) === target.entryKey)) : null;
  const experienceNav =
    target?.section === 'experience' ? navTo(value.experience.findIndex((e) => experienceKey(e) === target.entryKey)) : null;
  const projectNav =
    target?.section === 'project' ? navTo(value.projects.findIndex((e) => projectKey(e) === target.entryKey)) : null;

  return (
    <div className="space-y-4">
      <ContactSection
        value={value.contact}
        onChange={(contact) => onChange({ ...value, contact })}
        navNonce={target?.section === 'contact' ? nonce : undefined}
      />

      <EducationSection
        value={value.education}
        onChange={(education) => onChange({ ...value, education })}
        resume={{
          actions: <ResetButton onReset={() => onChange({ ...value, education: profile.education })} />,
          nav: educationNav,
        }}
      />

      <ExperienceSection
        value={value.experience}
        onChange={(experience) => onChange({ ...value, experience })}
        resume={{
          actions: <ResetButton onReset={() => onChange({ ...value, experience: profile.experience })} />,
          bulletBadge,
          entryBadge,
          belowBullets: (entry, update) => (
            <BulletPicker
              allBullets={profileBulletsForExperience(entry)}
              included={entry.bullets}
              onAdd={(bullet) => update({ ...entry, bullets: [...entry.bullets, bullet] })}
              bulletMatch={bulletMatch}
            />
          ),
          excluded: {
            entries: excludedExperience,
            label: (entry) => [entry.title || 'Untitled role', entry.company].filter(Boolean).join(' · '),
            onAdd: (entry) => onChange({ ...value, experience: [...value.experience, entry] }),
          },
          onFocusBullet: (entry, bulletIndex) =>
            onFocusBullet(bulletIndex === null ? null : { section: 'experience', entryKey: experienceKey(entry), bulletIndex }),
          nav: experienceNav,
        }}
      />

      <ProjectsSection
        value={value.projects}
        onChange={(projects) => onChange({ ...value, projects })}
        resume={{
          actions: <ResetButton onReset={() => onChange({ ...value, projects: profile.projects })} />,
          bulletBadge,
          entryBadge,
          belowBullets: (entry, update) => (
            <BulletPicker
              allBullets={profileBulletsForProject(entry)}
              included={entry.bullets}
              onAdd={(bullet) => update({ ...entry, bullets: [...entry.bullets, bullet] })}
              bulletMatch={bulletMatch}
            />
          ),
          excluded: {
            entries: excludedProjects,
            label: (entry) => entry.name || 'Untitled project',
            onAdd: (entry) => onChange({ ...value, projects: [...value.projects, entry] }),
          },
          onFocusBullet: (entry, bulletIndex) =>
            onFocusBullet(bulletIndex === null ? null : { section: 'project', entryKey: projectKey(entry), bulletIndex }),
          nav: projectNav,
        }}
      />

      <SkillsSection
        value={value.skills}
        onChange={(skills) => onChange({ ...value, skills })}
        actions={<ResetButton onReset={() => onChange({ ...value, skills: profile.skills })} />}
        onReset={() => onChange({ ...value, skills: profile.skills })}
        navNonce={target?.section === 'skills' ? nonce : undefined}
      />
    </div>
  );
}
