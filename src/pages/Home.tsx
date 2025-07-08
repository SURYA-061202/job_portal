import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import LoginPage from '@/components/auth/LoginPage';

export default function Home() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const cid = searchParams.get('candidateId');
    if (cid) {
      navigate(`/interview?candidateId=${cid}`, { replace: true });
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, (user: User | null) => {
      if (user) {
        navigate('/dashboard');
      }
      setChecking(false);
    });

    return () => unsubscribe();
  }, [navigate, searchParams]);

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-primary-600" />
      </div>
    );
  }

  return <LoginPage />;
} 