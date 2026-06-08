import { Navigate, Route, Routes } from 'react-router-dom';
import { AdminUsersPage } from './UsersPage';
import { AdminCompaniesPage } from './CompaniesPage';
import { AdminCategoriesPage } from './CategoriesPage';
import { AdminNetworkPage } from './NetworkPage';
import { AdminIntervalsPage } from './IntervalsPage';
import { AdminPrintTemplatePage } from './PrintTemplatePage';

export function AdminRoutes() {
  return (
    <Routes>
      <Route index element={<Navigate to="/admin/users" replace />} />
      <Route path="users" element={<AdminUsersPage />} />
      <Route path="companies" element={<AdminCompaniesPage />} />
      <Route path="categories" element={<AdminCategoriesPage />} />
      <Route path="network" element={<AdminNetworkPage />} />
      <Route path="intervals" element={<AdminIntervalsPage />} />
      <Route path="print-templates" element={<AdminPrintTemplatePage />} />
      <Route path="*" element={<Navigate to="/admin/users" replace />} />
    </Routes>
  );
}
