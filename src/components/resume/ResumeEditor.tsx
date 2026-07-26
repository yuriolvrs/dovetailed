// What this file is: the field-editable form for a generated resume --
// same section shape as the Profile page (contact/summary/skills/
// experience/projects/education), reusing the Profile page's own form
// components since a ResumeContent snapshot has identical field shapes.
// Every bullet shown is copied verbatim from the profile (selection, not
// generation -- see selectResumeContent.ts), so there's nothing to warn
// about fabrication-wise; a small "Matched to this job" badge just shows
// which bullets were prioritized because they're linked to a requirement.
// Experience/project bullets also get an opt-in "Suggest rewording" action
// (BulletRewriteSuggest) -- the one place in resume editing that does call
// the LLM, on explicit per-bullet request only, never automatically.
// In plain terms: the screen where you review and fine-tune a tailored
// resume before exporting it, optionally asking the AI for alternate
// phrasing on individual bullets.

import { useMemo } from 'react';
import { Check } from 'lucide-react';
import type { ResumeContent, SourceMapEntry } from '../../types';
import { ContactForm } from '../profile/ContactForm';
import { SkillsForm } from '../profile/SkillsForm';
import { ExperienceForm } from '../profile/ExperienceForm';
import { ProjectsForm } from '../profile/ProjectsForm';
import { EducationForm } from '../profile/EducationForm';
import { Badge, Card, FieldTextarea, SectionTitle } from '../ui/primitives';
import { BulletRewriteSuggest } from './BulletRewriteSuggest';

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
  onChange,
}: {
  value: ResumeContent;
  sourceMap: SourceMapEntry[];
  onChange: (content: ResumeContent) => void;
}) {
  const atomIdsByNormalizedText = useMemo(
    () => new Map(sourceMap.map((e) => [normalizeForMatch(e.generatedText), e.atomIds])),
    [sourceMap],
  );

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

  function bulletRewrite(bulletText: string, applySuggestion: (next: string) => void) {
    return <BulletRewriteSuggest bulletText={bulletText} onApply={applySuggestion} />;
  }

  return (
    <div className="space-y-5">
      <ContactForm value={value.contact} onChange={(contact) => onChange({ ...value, contact })} />

      <Card className="p-6">
        <SectionTitle sub="Shown near the top of your resume">Summary</SectionTitle>
        <FieldTextarea
          value={value.summary}
          onChange={(summary) => onChange({ ...value, summary })}
          rows={3}
          placeholder="A brief professional summary..."
        />
      </Card>

      <SkillsForm value={value.skills} onChange={(skills) => onChange({ ...value, skills })} />

      <ExperienceForm
        value={value.experience}
        onChange={(experience) => onChange({ ...value, experience })}
        bulletBadge={bulletBadge}
        bulletRewrite={bulletRewrite}
      />

      <ProjectsForm
        value={value.projects}
        onChange={(projects) => onChange({ ...value, projects })}
        bulletBadge={bulletBadge}
        bulletRewrite={bulletRewrite}
      />

      <EducationForm value={value.education} onChange={(education) => onChange({ ...value, education })} />
    </div>
  );
}
