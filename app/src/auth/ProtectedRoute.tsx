import { Navigate, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuth } from './AuthContext';
import { LoadingSessionScreen } from './LoadingSessionScreen';
import { NoProfileScreen } from './NoProfileScreen';
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

  if (allow && !allow.includes(profile.role)) {
    return (
      <div className="flex h-screen items-center justify-center p-6 text-center">
        <div>
          <h1 className="text-lg font-semibold">Kein Zugriff</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Deine Rolle <code>{profile.role}</code> hat keinen Zugriff auf diesen Bereich.
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
