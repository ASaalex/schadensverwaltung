import { Navigate, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuth } from './AuthContext';
import { LoadingSessionScreen } from './LoadingSessionScreen';
import { NoProfileScreen } from './NoProfileScreen';
import { ROLE_HOME } from './roleHome';
import type { UserRole } from '@/types/database';

interface Props {
  children: ReactNode;
  allow?: UserRole[];
}

export function ProtectedRoute({ children, allow }: Props) {
  const { session, profile, loading } = useAuth();
  const location = useLocation();

  if (loading) return <LoadingSessionScreen />;
  if (!session) return <Navigate to="/login" replace state={{ from: location }} />;
  if (!profile) return <NoProfileScreen />;

  // Wenn die Rolle nicht für diesen Bereich erlaubt ist, leite zur Startseite
  // der Rolle weiter — keine Sackgasse für den Nutzer.
  if (allow && !allow.includes(profile.role)) {
    return <Navigate to={ROLE_HOME[profile.role]} replace />;
  }

  return <>{children}</>;
}
