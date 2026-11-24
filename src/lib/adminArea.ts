export const SIGN_IN_ROUTE = '/admin/sign-in';

function decoded(pathname: string): string {
  try {
    return decodeURIComponent(pathname).toLowerCase();
  } catch {
    return pathname.toLowerCase();
  }
}

export function inAdmin(routeId: string | null, pathname: string): boolean {
  const byRoute = routeId !== null && (routeId === '/admin' || routeId.startsWith('/admin/'));
  const path = decoded(pathname);
  return byRoute || path === '/admin' || path.startsWith('/admin/');
}

export function needsOwner(routeId: string | null, pathname: string): boolean {
  return inAdmin(routeId, pathname) && routeId !== SIGN_IN_ROUTE;
}
