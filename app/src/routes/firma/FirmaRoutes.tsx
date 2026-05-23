import { Navigate, Route, Routes } from 'react-router-dom';
import { FirmaOrdersPage } from './OrdersPage';
import { FirmaOrderDetailPage } from './OrderDetailPage';
import { FirmaPositionEditPage } from './PositionEditPage';

export function FirmaRoutes() {
  return (
    <Routes>
      <Route index element={<Navigate to="/firma/orders" replace />} />
      <Route path="orders" element={<FirmaOrdersPage />} />
      <Route path="orders/:id" element={<FirmaOrderDetailPage />} />
      <Route path="orders/:id/positions/:positionId" element={<FirmaPositionEditPage />} />
      <Route path="*" element={<Navigate to="/firma/orders" replace />} />
    </Routes>
  );
}
