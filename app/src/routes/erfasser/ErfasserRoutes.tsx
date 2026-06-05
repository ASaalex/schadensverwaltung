import { Navigate, Route, Routes } from 'react-router-dom';
import { ErfasserHomePage } from './HomePage';
import { ErfasserListPage } from './ListPage';
import { NewLocationPage } from './new/NewLocationPage';
import { NewCategoryPage } from './new/NewCategoryPage';
import { NewDetailsPage } from './new/NewDetailsPage';
import { NewPhotosPage } from './new/NewPhotosPage';
import { NewObjectPage } from './new/NewObjectPage';
import { NewDonePage } from './new/NewDonePage';

export function ErfasserRoutes() {
  return (
    <Routes>
      <Route index element={<ErfasserHomePage />} />
      <Route path="list" element={<ErfasserListPage />} />
      <Route path="new" element={<Navigate to="/erfasser/new/location" replace />} />
      <Route path="new/location" element={<NewLocationPage />} />
      <Route path="new/category" element={<NewCategoryPage />} />
      <Route path="new/object"  element={<NewObjectPage />} />
      <Route path="new/details" element={<NewDetailsPage />} />
      <Route path="new/photos" element={<NewPhotosPage />} />
      <Route path="new/done" element={<NewDonePage />} />
      <Route path="*" element={<Navigate to="/erfasser" replace />} />
    </Routes>
  );
}
