import type { Resource } from './types';

const registry = new Map<string, Resource>();

export function registerResources(resources: Resource[]): Resource[] {
  for (const resource of resources) {
    if (registry.has(resource.name)) {
      throw new Error(`Resource "${resource.name}" is already registered.`);
    }
    registry.set(resource.name, resource);
  }
  return resources;
}

export function getResource(name: string): Resource | undefined {
  return registry.get(name);
}

export function requireResource(name: string): Resource {
  const resource = registry.get(name);
  if (!resource) throw new Error(`Resource "${name}" is not registered.`);
  return resource;
}

export function allResources(): Resource[] {
  return [...registry.values()];
}
