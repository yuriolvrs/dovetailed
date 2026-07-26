// What this file is: the app shell — the top nav bar plus the router that
// maps URLs to page components.
// In plain terms: the outer frame of the app — the header/navigation, and
// wherever a page gets shown depending on which tab you're on.

import { Link, NavLink, Navigate, Route, Routes, useMatch } from 'react-router-dom';
import { Briefcase, FileText, Shield, User } from 'lucide-react';
import ProfilePage from './pages/ProfilePage.tsx';
import JobsPage from './pages/JobsPage.tsx';
import JobDetailPage from './pages/JobDetailPage.tsx';
import MatchingReviewPage from './pages/MatchingReviewPage.tsx';
import GeneratePage from './pages/GeneratePage.tsx';
import AboutPage from './pages/AboutPage.tsx';
import DevLlmPage from './pages/DevLlmPage.tsx';

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  [
    'flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all',
    isActive ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700',
  ].join(' ');

export default function App() {
  const onJobDetail = useMatch('/jobs/:id/*');
  // The Generate page's side-by-side editor + live preview needs more room
  // than the app's usual reading-width column.
  const onGenerate = useMatch('/jobs/:id/generate');

  return (
    <div className="min-h-screen bg-[#f5f6f8] text-slate-900">
      <header className="sticky top-0 z-50 bg-white/90 backdrop-blur-md border-b border-slate-200/80 print:hidden">
        <div className="mx-auto flex max-w-4xl h-[54px] items-center justify-between px-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-slate-900 flex items-center justify-center shadow-sm">
              <FileText size={14} className="text-white" />
            </div>
            <span className="text-sm font-semibold text-slate-900 tracking-tight">
              Pimp My Resume
            </span>
            <div className="flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-50 border border-slate-200">
              <Shield size={10} className="text-slate-400" />
              <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                Local only
              </span>
            </div>
          </div>

          <nav className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
            <NavLink to="/profile" className={navLinkClass}>
              <User size={13} />
              Profile
            </NavLink>
            <NavLink
              to="/jobs"
              className={({ isActive }) => navLinkClass({ isActive: isActive || Boolean(onJobDetail) })}
            >
              <Briefcase size={13} />
              Jobs
            </NavLink>
          </nav>
        </div>
      </header>

      <main className={`mx-auto px-4 py-8 print:p-0 print:max-w-none ${onGenerate ? 'max-w-6xl' : 'max-w-4xl'}`}>
        <Routes>
          <Route path="/" element={<Navigate to="/jobs" replace />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/jobs" element={<JobsPage />} />
          <Route path="/jobs/:id" element={<JobDetailPage />} />
          <Route path="/jobs/:id/match" element={<MatchingReviewPage />} />
          <Route path="/jobs/:id/generate" element={<GeneratePage />} />
          <Route path="/about" element={<AboutPage />} />
          {/* Unlinked dev-only route for Phase 2's proxy test harness. */}
          <Route path="/dev/llm" element={<DevLlmPage />} />
          <Route path="*" element={<Navigate to="/jobs" replace />} />
        </Routes>
      </main>

      <footer className="print:hidden border-t border-slate-200/80 mt-8">
        <div className="mx-auto max-w-4xl px-4 py-5 flex items-center justify-center">
          <Link to="/about" className="text-xs text-slate-400 hover:text-slate-600 transition-colors">
            About &amp; Privacy
          </Link>
        </div>
      </footer>
    </div>
  );
}
