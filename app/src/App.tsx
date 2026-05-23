import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth/AuthContext';
import { ProtectedRoute } from './auth/ProtectedRoute';
import { LoginPage } from './auth/LoginPage';
import { ErfasserRoutes } from './routes/erfasser/ErfasserRoutes';
import { DispoRoutes } from './routes/dispo/DispoRoutes';
import { FirmaRoutes } from './routes/firma/FirmaRoutes';
import { AdminRoutes } from './routes/admin/AdminRoutes';
import { NoProfileScreen } from './auth/NoProfileScreen';
import { LoadingSessionScreen } from './auth/LoadingSessionScreen';
import type { UserRole } from './types/database';

const ROLE_HOME: Record<UserRole, string> = {
  admin: '/admin/users',
  dispatcher: '/dispo/dashboard',
  field_worker: '/erfasser',
  company_user: '/firma/orders',
};

function RoleRedirect() {
  const { session, profile, loading } = useAuth();
  if (loading) return <LoadingSessionScreen />;
  if (!session) return <Navigate to="/login" replace />;
  // Session ohne Profil — KEIN Redirect zu /login (sonst Loop), sondern Hilfeseite.
  if (!profile) return <NoProfileScreen />;
  return <Navigate to={ROLE_HOME[profile.role]} replace />;
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      <Route
        path="/erfasser/*"
        element={
          <ProtectedRoute allow={['field_worker', 'admin', 'dispatcher']}>
            <ErfasserRoutes />
          </ProtectedRoute>
        }
      />
      <Route
        path="/dispo/*"
        element={
          <ProtectedRoute allow={['dispatcher', 'admin']}>
            <DispoRoutes />
          </ProtectedRoute>
        }
      />
      <Route
        path="/firma/*"
        element={
          <ProtectedRoute allow={['company_user', 'admin', 'dispatcher', 'field_worker']}>
            <FirmaRoutes />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/*"
        element={
          <ProtectedRoute allow={['admin']}>
            <AdminRoutes />
          </ProtectedRoute>
        }
      />

      <Route path="/" element={<RoleRedirect />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
