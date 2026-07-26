// What this file is: the Jobs route's list page. Lets the user paste a new
// job posting (saved as a new record, then navigated to its detail page),
// and lists previously saved postings newest-first, linking to each one's
// detail page for analysis.
// In plain terms: the "Jobs" screen -- paste a new posting here, or open one
// you already saved.

import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CheckCircle, Circle, Plus, X } from 'lucide-react';
import type { GenerationType, JobPosting } from '../types';
import {
  ARRANGEMENTS,
  guessJobTitleAndCompany,
  listJobPostings,
  newJobPosting,
  postingLabel,
  saveJobPosting,
} from '../lib/jobStore';
import { listGenerationTypesByPosting } from '../lib/genStore';
import { computeFitScore, fitScoreColor } from '../lib/matching/fitScore';
import {
  Badge,
  Btn,
  Card,
  FieldInput,
  FieldSelect,
  FieldTextarea,
  Modal,
  SectionTitle,
} from '../components/ui/primitives';

export default function JobsPage() {
  const navigate = useNavigate();
  const [postings, setPostings] = useState<JobPosting[] | null>(null);
  const [generationTypes, setGenerationTypes] = useState<Map<string, Set<GenerationType>>>(new Map());
  const [modalOpen, setModalOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [company, setCompany] = useState('');
  const [location, setLocation] = useState('');
  const [arrangement, setArrangement] = useState('');
  const [rawText, setRawText] = useState('');

  const refresh = useCallback(() => {
    listJobPostings().then(setPostings);
    listGenerationTypesByPosting().then(setGenerationTypes);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  function openModal() {
    setTitle('');
    setCompany('');
    setLocation('');
    setArrangement('');
    setRawText('');
    setModalOpen(true);
  }

  // Best-effort title/company pre-fill once the user has pasted something in
  // -- only fills fields that are still empty, never overwrites typed input.
  function handleRawTextBlur() {
    if (rawText.trim() === '') return;
    const guess = guessJobTitleAndCompany(rawText);
    if (title.trim() === '' && guess.title) setTitle(guess.title);
    if (company.trim() === '' && guess.company) setCompany(guess.company);
  }

  async function handleSave() {
    const posting = newJobPosting(rawText, {
      title: title.trim() || undefined,
      company: company.trim() || undefined,
      location: location.trim() || undefined,
      arrangement: arrangement || undefined,
    });
    await saveJobPosting(posting);
    setModalOpen(false);
    navigate(`/jobs/${posting.id}`);
  }

  return (
    <div className="space-y-6 pb-16">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Jobs</h1>
          <p className="text-sm text-slate-400 mt-0.5">
            Paste postings, run analysis, tailor your documents
          </p>
        </div>
        <Btn onClick={openModal}>
          <Plus size={14} />
          Add Job Posting
        </Btn>
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} className="max-w-xl max-h-[90vh]">
        <div className="p-5 border-b border-slate-100 shrink-0 flex items-start justify-between gap-3">
          <SectionTitle sub="Paste the full posting text — all data stays in your browser">
            Add a Job Posting
          </SectionTitle>
          <button
            type="button"
            onClick={() => setModalOpen(false)}
            aria-label="Close"
            className="shrink-0 text-slate-300 hover:text-slate-600 transition-colors"
          >
            <X size={16} />
          </button>
        </div>
        <div className="p-5 space-y-3 overflow-y-auto">
          <div className="grid grid-cols-2 gap-3">
            <FieldInput
              label="Job Title"
              value={title}
              onChange={setTitle}
              placeholder="Senior Frontend Engineer"
            />
            <FieldInput label="Company" value={company} onChange={setCompany} placeholder="Acme Corp" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <FieldInput
              label="Location"
              value={location}
              onChange={setLocation}
              placeholder="San Francisco, CA"
            />
            <FieldSelect
              label="Arrangement"
              value={arrangement}
              onChange={setArrangement}
              options={ARRANGEMENTS}
              placeholder="Select…"
            />
          </div>
          <FieldTextarea
            label="Posting Text"
            value={rawText}
            onChange={setRawText}
            onBlur={handleRawTextBlur}
            placeholder="Paste the full job posting text here — responsibilities, requirements, qualifications, compensation, etc."
            rows={9}
          />
          <p className="text-xs text-slate-400">
            Title/company are auto-filled from the pasted text when detected — edit either freely.
          </p>
        </div>
        <div className="p-5 pt-0 flex justify-end gap-2 shrink-0">
          <Btn variant="secondary" onClick={() => setModalOpen(false)}>
            Cancel
          </Btn>
          <Btn onClick={handleSave} disabled={rawText.trim() === ''}>
            <Plus size={14} />
            Save Posting
          </Btn>
        </div>
      </Modal>

      <div>
        <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest mb-3">
          Saved Postings{postings !== null && ` — ${postings.length}`}
        </p>
        {postings === null ? (
          <p className="text-sm text-slate-400">Loading…</p>
        ) : postings.length === 0 ? (
          <div className="py-20 text-center text-sm text-slate-300 border-2 border-dashed border-slate-200 rounded-2xl bg-white">
            No postings saved yet
          </div>
        ) : (
          <div className="space-y-3">
            {postings.map((posting) => {
              const company = posting.company?.trim();
              const location = posting.location?.trim();
              const locationArrangement =
                location && posting.arrangement
                  ? `${location} (${posting.arrangement})`
                  : location || posting.arrangement || '';
              const fitScore = computeFitScore(posting.analysis);
              const types = generationTypes.get(posting.id);

              return (
                <Link key={posting.id} to={`/jobs/${posting.id}`} className="block">
                  <Card className="group p-5 hover:border-slate-300 hover:shadow-[0_4px_16px_rgba(15,23,42,0.1)] transition-all">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-sm font-semibold text-slate-900 truncate">
                        {posting.title?.trim() || postingLabel(posting)}
                      </h3>
                      {posting.analysis ? (
                        <Badge color="green">
                          <CheckCircle size={10} />
                          Analyzed
                        </Badge>
                      ) : (
                        <Badge color="slate">
                          <Circle size={10} />
                          Not analyzed
                        </Badge>
                      )}
                      {fitScore !== null && <Badge color={fitScoreColor(fitScore)}>Fit: {fitScore}%</Badge>}
                      <Badge color={types?.has('resume') ? 'green' : 'slate'}>
                        {types?.has('resume') ? <CheckCircle size={10} /> : <Circle size={10} />}
                        Resume
                      </Badge>
                      <Badge color={types?.has('coverLetter') ? 'green' : 'slate'}>
                        {types?.has('coverLetter') ? <CheckCircle size={10} /> : <Circle size={10} />}
                        Cover Letter
                      </Badge>
                    </div>
                    {company && <p className="text-sm text-slate-700 mt-0.5">{company}</p>}
                    {locationArrangement && (
                      <p className="text-sm text-slate-400 mt-0.5">{locationArrangement}</p>
                    )}
                    <p className="text-xs text-slate-400 mt-0.5">
                      Saved {new Date(posting.createdAt).toLocaleDateString()}
                    </p>
                  </Card>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
