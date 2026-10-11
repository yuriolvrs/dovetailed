// What this file is: the / route. A visitor with nothing saved (no profile
// content and no postings) gets the welcome page; anyone else goes straight
// to the Jobs list at /jobs.
// In plain terms: new visitors see the landing page, returning users skip it.

import { useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { listJobPostings } from '../lib/jobStore';
import { hasProfileContent, loadProfile } from '../lib/profileStore';
import { Welcome } from '../components/jobs/Welcome';

export default function HomePage() {
  const navigate = useNavigate();
  // Null until both stores have been read, so nothing flashes before the redirect.
  const [returning, setReturning] = useState<boolean | null>(null);

  useEffect(() => {
    Promise.all([loadProfile(), listJobPostings()]).then(([profile, postings]) =>
      setReturning(hasProfileContent(profile) || postings.length > 0),
    );
  }, []);

  if (returning === null) return null;
  if (returning) return <Navigate to="/jobs" replace />;
  return <Welcome onStart={() => navigate('/profile')} onTypeIn={() => navigate('/profile?setup=1')} />;
}
