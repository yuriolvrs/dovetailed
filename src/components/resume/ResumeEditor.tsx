// What this file is: the field-editable form for a generated resume --
// same section shape as the Profile page (contact/skills/experience/
// projects/education), reusing the Profile page's own form components since
// a ResumeContent snapshot has identical field shapes. Sections are ordered
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
import { experienceKey, projectKey, type ResumeFocusTarget, type ResumeNavTarget } from '../../lib/resumeEntryKeys';
import { SkillsForm } from '../profile/SkillsForm';
import { ProjectsForm } from '../profile/ProjectsForm';
import { Badge } from '../ui/primitives';
import { BulletRewriteSuggest } from './BulletRewriteSuggest';
import { ResumeContactSection } from './ResumeContactSection';
import { ResumeExperienceSection } from './ResumeExperienceSection';
import { ResumeEducationSection } from './ResumeEducationSection';

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
  analysis: JobAnalysis;
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
    const requirementTextById = new Map(analysis.requirements.map((r) => [r.id, r.text]));
    const map = new Map<string, string>();
    for (const match of analysis.matches) {
      const text = requirementTextById.get(match.requirementId);
      if (!text) continue;
      for (const atomId of match.atomIds) {
        if (!map.has(atomId)) map.set(atomId, text);
      }
    }
    return map;
  }, [analysis]);

  function bulletBadge(bulletText: string) {
    const atomIds = atomIdsByNormalizedText.get(normalizeForMatch(bulletText));
    if (!atomIds || atomIds.length === 0) return null;
    return (
      <Badge color="blue">
        <Check size={11} />
        Matched to this job
      </Badge>
    );
  }

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

  function bulletRewrite(bulletText: string, applySuggestion: (next: string) => void) {
    return <BulletRewriteSuggest bulletText={bulletText} onApply={applySuggestion} />;
  }

  // Slices navRequest down to each section's own shape, so a section only
  // ever sees a request meant for it (and re-renders when its own nonce
  // changes, not on every unrelated preview click).
  const target = navRequest?.target;
  const contactNav = target?.section === 'contact' ? { nonce: navRequest!.nonce } : null;
  const educationNav = target?.section === 'education' ? { entryKey: target.entryKey, nonce: navRequest!.nonce } : null;
  const experienceNav =
    target?.section === 'experience'
      ? { entryKey: target.entryKey, bulletIndex: target.bulletIndex, nonce: navRequest!.nonce }
      : null;
  const projectNav =
    target?.section === 'project'
      ? { entryKey: target.entryKey, bulletIndex: target.bulletIndex, nonce: navRequest!.nonce }
      : null;
  const skillsNav = target?.section === 'skills' ? { groupIndex: target.groupIndex, nonce: navRequest!.nonce } : null;

  return (
    <div className="space-y-4">
      <ResumeContactSection
        value={value.contact}
        onChange={(contact) => onChange({ ...value, contact })}
        navRequest={contactNav}
      />

      <ResumeEducationSection
        value={value.education}
        onChange={(education) => onChange({ ...value, education })}
        onReset={() => onChange({ ...value, education: profile.education })}
        navRequest={educationNav}
      />

      <ResumeExperienceSection
        value={value.experience}
        onChange={(experience) => onChange({ ...value, experience })}
        bulletMatch={bulletMatch}
        bulletRewrite={bulletRewrite}
        profileBulletsFor={profileBulletsForExperience}
        excludedEntries={excludedExperience}
        onAddEntry={(entry) => onChange({ ...value, experience: [...value.experience, entry] })}
        onFocusBullet={(entry, bulletIndex) =>
          onFocusBullet(bulletIndex === null ? null : { section: 'experience', entryKey: experienceKey(entry), bulletIndex })
        }
        onReset={() => onChange({ ...value, experience: profile.experience })}
        navRequest={experienceNav}
      />

      <ProjectsForm
        value={value.projects}
        onChange={(projects) => onChange({ ...value, projects })}
        bulletBadge={bulletBadge}
        bulletRewrite={bulletRewrite}
        bulletMatch={bulletMatch}
        profileBulletsFor={profileBulletsForProject}
        excludedEntries={excludedProjects}
        onAddEntry={(entry) => onChange({ ...value, projects: [...value.projects, entry] })}
        onFocusBullet={(entry, bulletIndex) =>
          onFocusBullet(bulletIndex === null ? null : { section: 'project', entryKey: projectKey(entry), bulletIndex })
        }
        onReset={() => onChange({ ...value, projects: profile.projects })}
        navRequest={projectNav}
      />

      <SkillsForm
        value={value.skills}
        onChange={(skills) => onChange({ ...value, skills })}
        onReset={() => onChange({ ...value, skills: profile.skills })}
        navRequest={skillsNav}
      />
    </div>
  );
}
