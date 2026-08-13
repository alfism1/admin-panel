import { Navigate, Route, Routes } from 'react-router';
import { AuthProvider } from '@/core/auth/AuthProvider';
import { ProtectedRoute } from '@/core/auth/ProtectedRoute';
import { registerNavigationItems } from '@/core/navigation/navigation';
import { generateRoutes } from '@/core/resources/generateRoutes';
import { AppLayout } from '@/layouts/AppLayout';
import { AuthLayout } from '@/layouts/AuthLayout';
import { DashboardPage } from '@/pages/DashboardPage';
import { LoginPage } from '@/pages/LoginPage';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { ProfilePage } from '@/pages/ProfilePage';
import { resources } from '@/resources';

registerNavigationItems([
  { key: 'dashboard', label: 'Dashboard', path: '/', icon: 'layout-dashboard', sort: -10 },
]);

export function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route element={<AuthLayout />}>
          <Route path="/login" element={<LoginPage />} />
        </Route>

        <Route
          element={
            <ProtectedRoute>
              <AppLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<DashboardPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          {generateRoutes(resources)}
          <Route path="*" element={<NotFoundPage />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  );
}
