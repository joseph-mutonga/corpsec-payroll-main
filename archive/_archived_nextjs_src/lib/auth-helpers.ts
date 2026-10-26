import { NextResponse } from 'next/server';
import { getCurrentSession } from './auth';
import { UserSession } from '@/types';

export class AuthError extends Error {
  status: number;
  constructor(message: string, status = 401) {
    super(message);
    this.status = status;
  }
}

export interface AuthenticatedSession extends UserSession {
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    roles: string[];
    permissions: string[];
  };
}

/**
 * Modern concise session & permission guard.
 * Returns UserSession (with both session.user.id and session.userId guaranteed) or throws AuthError with appropriate status.
 */
export async function requireAuth(requiredPermissions?: string[]): Promise<AuthenticatedSession> {
  const session = await getCurrentSession();
  if (!session) {
    throw new AuthError('Authentication required. Please log in to continue.', 401);
  }

  if (!session.isActive) {
    throw new AuthError('User account is deactivated. Access denied.', 403);
  }

  if (requiredPermissions && requiredPermissions.length > 0) {
    const isSuperAdmin = session.roles.includes('super_admin');
    if (!isSuperAdmin) {
      const hasAccess = requiredPermissions.some((perm) => session.permissions.includes(perm));
      if (!hasAccess) {
        throw new AuthError(`Access denied. Missing required permission(s): ${requiredPermissions.join(', ')}`, 403);
      }
    }
  }

  const authenticatedUser = session.user || {
    id: session.userId,
    email: session.email,
    firstName: session.firstName,
    lastName: session.lastName,
    roles: session.roles,
    permissions: session.permissions,
  };

  return {
    ...session,
    user: authenticatedUser,
  };
}

export function errorResponse(message: string, status = 500, details?: any) {
  return NextResponse.json(
    {
      success: false,
      error: {
        message,
        details,
      },
    },
    { status }
  );
}

export function successResponse(data: any = null, message?: string, status = 200, meta?: any) {
  return NextResponse.json(
    {
      success: true,
      message,
      data,
      ...(meta ? { meta } : {}),
    },
    { status }
  );
}
