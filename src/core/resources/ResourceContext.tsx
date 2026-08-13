import * as React from 'react';
import type { Resource } from './types';

interface ResourceContextValue {
  resource: Resource;
  /** Invalidates the list and detail queries for this resource. */
  refresh: () => void;
}

const ResourceContext = React.createContext<ResourceContextValue | null>(null);

export function ResourceProvider({
  resource,
  refresh,
  children,
}: ResourceContextValue & { children: React.ReactNode }) {
  const value = React.useMemo(() => ({ resource, refresh }), [resource, refresh]);
  return <ResourceContext.Provider value={value}>{children}</ResourceContext.Provider>;
}

export function useResourceContext(): ResourceContextValue | null {
  return React.useContext(ResourceContext);
}

export function useResource(): Resource {
  const context = React.useContext(ResourceContext);
  if (!context) throw new Error('useResource must be used inside <ResourceProvider>.');
  return context.resource;
}
