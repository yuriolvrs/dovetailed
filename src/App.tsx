// What this file is: the app shell — the top nav bar plus the router that
// maps URLs to page components.
// In plain terms: the outer frame of the app — the header/navigation, and
// wherever a page gets shown depending on which tab you're on.

import { Link, NavLink, Navigate, Route, Routes, useMatch } from 'react-router-dom';
import { Briefcase, Shield, User } from 'lucide-react';
import ProfilePage from './pages/ProfilePage.tsx';
import JobsPage from './pages/JobsPage.tsx';
import JobDetailPage from './pages/JobDetailPage.tsx';
import MatchingReviewPage from './pages/MatchingReviewPage.tsx';
import GeneratePage from './pages/GeneratePage.tsx';
import AboutPage from './pages/AboutPage.tsx';
import { ToastProvider } from './components/ui/Toast.tsx';
import Logo from './components/ui/Logo.tsx';

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  [
    'flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all',
    isActive ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700',
  ].join(' ');

export default function App() {
  // Also drives the wider main column below -- the Analysis/Matching/
  // Generate flow's side-by-side panes need more room than the app's usual
  // reading-width column, widened uniformly across all three so the page
  // doesn't change width as you move between them.
  const onJobDetail = useMatch('/jobs/:id/*');

  return (
    <ToastProvider>
      <div className="min-h-screen print:min-h-0 bg-[#f5f6f8] text-slate-900">
        <header className="sticky top-0 z-50 bg-white/90 backdrop-blur-md border-b border-slate-200/80 print:hidden">
          <div className="mx-auto flex max-w-4xl h-[54px] items-center justify-between px-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-slate-900 flex items-center justify-center shadow-sm">
                <Logo size={22} className="text-white" />
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

        <main className={`mx-auto px-4 pt-8 pb-3 print:p-0 print:max-w-none ${onJobDetail ? 'max-w-6xl' : 'max-w-4xl'}`}>
          <Routes>
            <Route path="/" element={<Navigate to="/jobs" replace />} />
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="/jobs" element={<JobsPage />} />
            <Route path="/jobs/:id" element={<JobDetailPage />} />
            <Route path="/jobs/:id/match" element={<MatchingReviewPage />} />
            <Route path="/jobs/:id/generate" element={<GeneratePage />} />
            <Route path="/about" element={<AboutPage />} />
            <Route path="*" element={<Navigate to="/jobs" replace />} />
          </Routes>
        </main>

        <footer className="print:hidden border-t border-slate-200/80">
          <div className="mx-auto max-w-4xl px-4 py-3 flex items-center justify-center">
            <Link to="/about" className="text-xs text-slate-400 hover:text-slate-600 transition-colors">
              About &amp; Privacy
            </Link>
          </div>
        </footer>
      </div>
    </ToastProvider>
  );
}
