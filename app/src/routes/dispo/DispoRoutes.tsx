import { Navigate, Route, Routes } from 'react-router-dom';
import { DispoDashboardPage } from './DashboardPage';
import { DispoDamagesPage } from './DamagesPage';
import { DispoDamageDetailPage } from './DamageDetailPage';
import { DispoDamagePrintPage } from './DamagePrintPage';
import { DispoOrdersPage } from './OrdersPage';
import { DispoOrderEditorPage } from './OrderEditorPage';
import { DispoOrderDetailPage } from './OrderDetailPage';
import { DispoOrderPrintPage } from './OrderPrintPage';
import { DispoImportPage } from './ImportPage';
import { ObjectHistoryPage } from './ObjectHistoryPage';
import { DispoObjectsPage } from './ObjectsPage';
import { DispoObjectDetailPage } from './ObjectDetailPage';
import { DispoObjectPrintPage } from './ObjectPrintPage';

export function DispoRoutes() {
  return (
    <Routes>
      <Route index element={<Navigate to="/dispo/dashboard" replace />} />
      <Route path="dashboard" element={<DispoDashboardPage />} />
      <Route path="damages"     element={<DispoDamagesPage />} />
      <Route path="damages/:id" element={<DispoDamageDetailPage />} />
      <Route path="damages/:id/print" element={<DispoDamagePrintPage />} />
      <Route path="orders"      element={<DispoOrdersPage />} />
      <Route path="orders/new"        element={<DispoOrderEditorPage />} />
      <Route path="orders/:id"        element={<DispoOrderDetailPage />} />
      <Route path="orders/:id/print"  element={<DispoOrderPrintPage />} />
      <Route path="import"             element={<DispoImportPage />} />
      <Route path="objects"             element={<DispoObjectsPage />} />
      <Route path="objects/:id"         element={<DispoObjectDetailPage />} />
      <Route path="objects/:id/print"   element={<DispoObjectPrintPage />} />
      <Route path="objects/:id/history" element={<ObjectHistoryPage />} />
      <Route path="*"         element={<Navigate to="/dispo/dashboard" replace />} />
    </Routes>
  );
}
