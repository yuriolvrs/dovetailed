// What this file is: the app shell — the top nav bar plus the router that
// maps URLs to page components.
// In plain terms: the outer frame of the app — the header/navigation, and
// wherever a page gets shown depending on which tab you're on.

import { Link, NavLink, Navigate, Route, Routes, useMatch, useParams } from 'react-router-dom';
import { Briefcase, User } from 'lucide-react';
import ProfilePage from './pages/ProfilePage.tsx';
import JobsPage from './pages/JobsPage.tsx';
import JobDetailPage from './pages/JobDetailPage.tsx';
import MatchingReviewPage from './pages/MatchingReviewPage.tsx';
import DirectSelectionPage from './pages/DirectSelectionPage.tsx';
import DocumentsPage from './pages/DocumentsPage.tsx';
import AnalyzePostingPage from './pages/AnalyzePostingPage.tsx';
import AboutPage from './pages/AboutPage.tsx';
import { ToastProvider } from './components/ui/Toast.tsx';
import { ThemeToggle } from './components/ui/ThemeToggle.tsx';
import Logo from './components/ui/Logo.tsx';

// One column width for the whole app -- header, main and footer share it, so
// the brand mark, every page's heading and the footer all sit on the same
// left edge, and no screen changes width as you move between them. Sized for
// the Analysis/Matching/Generate flow, whose side-by-side panes need the most
// room of anything in the app.
// In plain terms: how wide the page's content is, the same everywhere.
const COLUMN = 'max-w-6xl';

// The header's destination buttons. The brand mark also goes home, so Jobs
// is a shortcut rather than the only way back to the list.
// In plain terms: how the Jobs and Profile buttons in the top-right look.
// The Documents screen was /generate before the two routes got a shared hub.
// A relative <Navigate to="../documents"> cannot do this: React Router resolves
// a relative `to` against the ROUTE hierarchy, not the URL, and these routes are
// flat siblings -- so ".." lands on "/" rather than on the posting. Verified in
// the running app; the absolute path built from the param is the fix.
// In plain terms: sends an old /generate bookmark to the renamed screen instead
// of dumping you on the jobs list.
function LegacyGenerateRedirect() {
  const { id } = useParams<{ id: string }>();
  return <Navigate to={id ? `/jobs/${id}/documents` : '/'} replace />;
}

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  [
    'flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all',
    isActive
      ? 'bg-slate-100 text-slate-900 dark:bg-slate-700 dark:text-slate-100'
      : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-slate-200 dark:hover:bg-slate-800',
  ].join(' ');

export default function App() {
  // Jobs stays lit through a posting's own screens -- they are still the jobs
  // section, just deeper in.
  const onJobDetail = useMatch('/jobs/:id/*');

  return (
    <ToastProvider>
      <div className="min-h-screen flex flex-col print:block print:min-h-0 bg-[#f5f6f8] dark:bg-slate-950 text-slate-900 dark:text-slate-100">
        <header className="sticky top-0 z-50 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border-b border-slate-200/80 dark:border-slate-800 print:hidden">
          <div className={`mx-auto flex ${COLUMN} h-[54px] items-center justify-between px-4`}>
            <Link to="/" className="flex items-center gap-3" aria-label="Jobs">
              <div className="w-9 h-9 rounded-xl bg-slate-900 dark:bg-white flex items-center justify-center shadow-sm">
                <Logo size={26} className="text-white dark:text-slate-900" />
              </div>
              <span className="text-sm font-semibold text-slate-900 dark:text-slate-100 tracking-tight">
                Dovetailed
              </span>
            </Link>

            <nav className="flex items-center gap-1">
              <NavLink
                to="/"
                className={({ isActive }) => navLinkClass({ isActive: isActive || Boolean(onJobDetail) })}
              >
                <Briefcase size={13} />
                Jobs
              </NavLink>
              <NavLink to="/profile" className={navLinkClass}>
                <User size={13} />
                Profile
              </NavLink>
            </nav>
          </div>
        </header>

        <main
          className={`flex-1 mx-auto w-full px-4 pt-8 pb-3 print:p-0 print:max-w-none ${COLUMN}`}
        >
          <Routes>
            <Route path="/" element={<JobsPage />} />
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="/jobs" element={<Navigate to="/" replace />} />
            <Route path="/jobs/:id" element={<JobDetailPage />} />
            <Route path="/jobs/:id/match" element={<MatchingReviewPage />} />
            <Route path="/jobs/:id/direct" element={<DirectSelectionPage />} />
            <Route path="/jobs/:id/match/analyze" element={<AnalyzePostingPage />} />
            <Route path="/jobs/:id/documents" element={<DocumentsPage />} />
            <Route path="/jobs/:id/generate" element={<LegacyGenerateRedirect />} />
            <Route path="/about" element={<AboutPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>

        <footer className="print:hidden border-t border-slate-200/80 dark:border-slate-800">
          <div className={`relative mx-auto ${COLUMN} px-4 py-3 flex items-center justify-center`}>
            <div className="absolute left-4 top-1/2 -translate-y-1/2">
              <ThemeToggle />
            </div>
            <Link
              to="/about"
              className="text-xs text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
            >
              About &amp; Privacy
            </Link>
          </div>
        </footer>
      </div>
    </ToastProvider>
  );
}
