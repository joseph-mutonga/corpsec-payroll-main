import { UserSession } from '@/types';
import { getCurrentSession } from './auth';
import { apiForbidden, apiUnauthorized } from './response';
import { NextResponse } from 'next/server';

/**
 * Check if the user session contains a specific permission.
 * Super Admin implicitly has all permissions.
 */
export function hasPermission(session: UserSession | null, permission: string): boolean {
  if (!session || !session.isActive) return false;
  if (session.roles.includes('super_admin')) return true;
  return session.permissions.includes(permission);
}

/**
 * Check if the user session contains ANY of the specified permissions.
 */
export function hasAnyPermission(session: UserSession | null, permissions: string[]): boolean {
  if (!session || !session.isActive) return false;
  if (session.roles.includes('super_admin')) return true;
  return permissions.some((perm) => session.permissions.includes(perm));
}

/**
 * Check if the user session has a specific role.
 */
export function hasRole(session: UserSession | null, role: string): boolean {
  if (!session || !session.isActive) return false;
  if (session.roles.includes('super_admin')) return true;
  return session.roles.includes(role);
}

/**
 * API route guard: requires an authenticated active session and optional permissions.
 */
export async function requireAuth(
  arg1?: any,
  arg2?: string | string[]
): Promise<
  | {
      session: UserSession;
      user: UserSession & { id: string };
      error?: never;
      errorResponse?: never;
    }
  | { error: NextResponse; errorResponse: NextResponse }
> {
  const perms = Array.isArray(arg1)
    ? arg1
    : typeof arg1 === 'string'
    ? [arg1]
    : Array.isArray(arg2)
    ? arg2
    : typeof arg2 === 'string'
    ? [arg2]
    : undefined;

  const session = await getCurrentSession();
  if (!session) {
    const res = apiUnauthorized('Authentication required. Please log in to continue.');
    return { error: res, errorResponse: res } as any;
  }
  if (!session.isActive) {
    const res = apiForbidden('Your account has been deactivated. Please contact the administrator.');
    return { error: res, errorResponse: res } as any;
  }
  if (perms && perms.length > 0 && !hasAnyPermission(session, perms)) {
    const res = apiForbidden(`Access denied. Required permission(s): [${perms.join(', ')}].`);
    return { error: res, errorResponse: res } as any;
  }

  return {
    session,
    user: { ...session, id: session.userId },
  };
}

/**
 * API route guard: requires a specific permission.
 */
export async function requirePermission(
  permission: string
): Promise<{ session: UserSession } | { errorResponse: NextResponse }> {
  const auth = await requireAuth();
  if ('errorResponse' in auth) return auth;

  if (!hasPermission(auth.session, permission)) {
    return {
      errorResponse: apiForbidden(
        `Access denied. You lack the required permission: [${permission}].`
      ),
    };
  }

  return { session: auth.session };
}

/**
 * API route guard: requires a specific role or super_admin.
 */
export async function requireRole(
  role: string
): Promise<{ session: UserSession } | { errorResponse: NextResponse }> {
  const auth = await requireAuth();
  if ('errorResponse' in auth) return auth;

  if (!hasRole(auth.session, role)) {
    return {
      errorResponse: apiForbidden(`Access denied. Role [${role}] is required.`),
    };
  }

  return { session: auth.session };
}
