import type { UserRole } from '@/types/database';

/**
 * Default-Startroute pro Rolle. Wird genutzt für:
 *  - Login-Redirect (nach erfolgreicher Anmeldung)
 *  - Root-Redirect bei /
 *  - ProtectedRoute-Fallback wenn User auf eine für seine Rolle gesperrte Route
 *    aus dem Browser-History/Bookmark landet
 */
export const ROLE_HOME: Record<UserRole, string> = {
  admin: '/admin/users',
  dispatcher: '/dispo/dashboard',
  field_worker: '/erfasser',
  company_user: '/firma/orders',
};
