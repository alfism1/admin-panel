import type * as React from 'react';
import { Route } from 'react-router';
import { ProtectedRoute } from '@/core/auth/ProtectedRoute';
import { CreatePage } from './pages/CreatePage';
import { EditPage } from './pages/EditPage';
import { ListPage } from './pages/ListPage';
import { ViewPage } from './pages/ViewPage';
import type { PageOverride, Resource } from './types';

function renderPage(
  override: PageOverride,
  Fallback: React.ComponentType<{ resource: Resource }>,
  resource: Resource,
): React.ReactElement | null {
  if (override === false) return null;
  if (override === true) return <Fallback resource={resource} />;
  const Custom = override;
  return <Custom />;
}

/**
 * Turns each resource into its four CRUD routes, every one wrapped in a
 * permission gate. A denied route renders 403 rather than redirecting.
 */
export function generateRoutes(resources: Resource[]): React.ReactElement[] {
  const routes: React.ReactElement[] = [];

  for (const resource of resources) {
    const base = resource.route.replace(/^\//, '');
    const { permissions, pages } = resource;

    if (pages.list) {
      routes.push(
        <Route
          key={`${resource.name}-list`}
          path={base}
          element={
            <ProtectedRoute permission={permissions.viewAny}>
              {renderPage(pages.list, ListPage, resource)}
            </ProtectedRoute>
          }
        />,
      );
    }

    // Declared before `:id` so "create" is never read as a record id.
    if (pages.create) {
      routes.push(
        <Route
          key={`${resource.name}-create`}
          path={`${base}/create`}
          element={
            <ProtectedRoute permission={permissions.create}>
              {renderPage(pages.create, CreatePage, resource)}
            </ProtectedRoute>
          }
        />,
      );
    }

    if (pages.view) {
      routes.push(
        <Route
          key={`${resource.name}-view`}
          path={`${base}/:id`}
          element={
            <ProtectedRoute permission={permissions.view}>
              {renderPage(pages.view, ViewPage, resource)}
            </ProtectedRoute>
          }
        />,
      );
    }

    if (pages.edit) {
      routes.push(
        <Route
          key={`${resource.name}-edit`}
          path={`${base}/:id/edit`}
          element={
            <ProtectedRoute permission={permissions.update}>
              {renderPage(pages.edit, EditPage, resource)}
            </ProtectedRoute>
          }
        />,
      );
    }
  }

  return routes;
}
