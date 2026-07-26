// What this file is: the field-editable form for a generated resume --
// same section shape as the Profile page (contact/skills/experience/
// projects/education), reusing the Profile page's own form components since
// a ResumeContent snapshot has identical field shapes. Sections are ordered
// to match the printed layout (contact, education, experience, projects,
// skills -- see ResumePrintView) so the editor and the live preview next to
// it read top-to-bottom in the same order. Summary isn't editable here --
// it's edited on the Profile page and just carried through verbatim; this
// page is about selecting/ordering content for one job, not rewriting your
// standing summary. Every bullet shown is copied verbatim from the profile
// (selection, not generation -- see selectResumeContent.ts), so there's
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
import type { JobAnalysis, ResumeContent, SourceMapEntry } from '../../types';
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
  onChange,
}: {
  value: ResumeContent;
  sourceMap: SourceMapEntry[];
  /** This posting's requirements + matches, used to name which requirement a matched bullet satisfies. */
  analysis: JobAnalysis;
  onChange: (content: ResumeContent) => void;
}) {
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

  return (
    <div className="space-y-4">
      <ResumeContactSection value={value.contact} onChange={(contact) => onChange({ ...value, contact })} />

      <ResumeEducationSection value={value.education} onChange={(education) => onChange({ ...value, education })} />

      <ResumeExperienceSection
        value={value.experience}
        onChange={(experience) => onChange({ ...value, experience })}
        bulletMatch={bulletMatch}
        bulletRewrite={bulletRewrite}
      />

      <ProjectsForm
        value={value.projects}
        onChange={(projects) => onChange({ ...value, projects })}
        bulletBadge={bulletBadge}
        bulletRewrite={bulletRewrite}
      />

      <SkillsForm value={value.skills} onChange={(skills) => onChange({ ...value, skills })} />
    </div>
  );
}
