export interface RouteDiscoveryEntry {
  path: string;
  templateIndex: number;
  title?: string;
  isDefault: boolean;
}

export interface DiscoveredRouteDescriptor {
  templateIndex: number;
  title?: string;
}

export interface ReducedRouteDiscovery {
  routes: Record<string, DiscoveredRouteDescriptor>;
  defaultPath: string | undefined;
}

export function reduceRouteEntries(entries: readonly RouteDiscoveryEntry[]): ReducedRouteDiscovery {
  const routes: Record<string, DiscoveredRouteDescriptor> = {};
  let defaultPath: string | undefined;

  for (const entry of entries) {
    const route = routes[entry.path];
    if (!route) {
      routes[entry.path] = {
        templateIndex: entry.templateIndex,
        ...(entry.title ? { title: entry.title } : {}),
      };
    } else if (entry.title && !route.title) {
      route.title = entry.title;
    }

    if (entry.isDefault) defaultPath = entry.path;
  }

  return { routes, defaultPath };
}
