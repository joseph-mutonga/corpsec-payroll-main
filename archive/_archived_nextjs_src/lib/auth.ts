import bcrypt from 'bcryptjs';
import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import { db } from './db';
import { UserSession } from '@/types';

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'corpsec-hr-payroll-default-jwt-secret-key-32-chars-min!'
);
const COOKIE_NAME = process.env.SESSION_COOKIE_NAME || 'corpsec_session';
const TOKEN_EXPIRY = '8h';

// Password Utilities
export async function hashPassword(password: string): Promise<string> {
  const salt = await bcrypt.genSalt(12);
  return bcrypt.hash(password, salt);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

// Token Utilities
export async function createSessionToken(session: UserSession): Promise<string> {
  return new SignJWT({ ...session })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(TOKEN_EXPIRY)
    .sign(JWT_SECRET);
}

export async function verifySessionToken(token: string): Promise<UserSession | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    return payload as unknown as UserSession;
  } catch (err) {
    return null;
  }
}

// Session Cookie Management
export async function setSessionCookie(session: UserSession): Promise<void> {
  const token = await createSessionToken(session);
  const cookieStore = cookies();
  
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 8 * 60 * 60, // 8 hours
  });
}

export async function clearSessionCookie(): Promise<void> {
  const cookieStore = cookies();
  cookieStore.delete(COOKIE_NAME);
}

// Current User Session Resolver
export async function getCurrentSession(): Promise<UserSession | null> {
  try {
    const cookieStore = cookies();
    const token = cookieStore.get(COOKIE_NAME)?.value;
    if (!token) return null;

    const payload = await verifySessionToken(token);
    if (!payload || !payload.userId) return null;

    // Verify user is still active in database
    const user = await db.user.findUnique({
      where: { id: payload.userId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        isActive: true,
        deletedAt: true,
        userRoles: {
          include: {
            role: {
              include: {
                rolePermissions: {
                  include: {
                    permission: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!user || !user.isActive || user.deletedAt !== null) {
      await clearSessionCookie();
      return null;
    }

    const roles = user.userRoles.map((ur) => ur.role.name);
    const permissionsSet = new Set<string>();
    
    user.userRoles.forEach((ur) => {
      ur.role.rolePermissions.forEach((rp) => {
        permissionsSet.add(rp.permission.name);
      });
    });

    return {
      userId: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      roles,
      permissions: Array.from(permissionsSet),
      isActive: user.isActive,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        roles,
        permissions: Array.from(permissionsSet),
      },
    };
  } catch (error) {
    console.error('Error fetching current session:', error);
    return null;
  }
}

export async function getCurrentUser(req?: any) {
  try {
    let token: string | undefined;

    // Check header cookie if passed via req
    if (req) {
      if (req.cookies && typeof req.cookies.get === 'function') {
        token = req.cookies.get(COOKIE_NAME)?.value;
      }
      if (!token) {
        const authHeader = req.headers?.get ? req.headers.get('authorization') : req.headers?.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
          token = authHeader.substring(7).trim();
        }
      }
      if (!token) {
        const cookieHeader = req.headers?.get ? req.headers.get('cookie') : req.headers?.cookie;
        if (cookieHeader) {
          const match = cookieHeader.match(new RegExp(`(?:^|; )${COOKIE_NAME}=([^;]*)`));
          if (match) token = decodeURIComponent(match[1]);
        }
      }
    }

    if (!token) {
      try {
        const cookieStore = cookies();
        token = cookieStore.get(COOKIE_NAME)?.value;
      } catch {
        // Ignored if outside request scope
      }
    }

    if (!token) return null;

    const payload = await verifySessionToken(token);
    if (!payload || !payload.userId) return null;

    const user = await db.user.findUnique({
      where: { id: payload.userId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        isActive: true,
        employee: { select: { id: true, employeeNumber: true, fullName: true } },
        userRoles: { include: { role: true } },
      },
    });

    if (!user || !user.isActive) return null;

    let employee = user.employee;
    if (!employee) {
      employee = await db.employee.findFirst({
        where: { OR: [{ userId: user.id }, { email: user.email }] },
        select: { id: true, employeeNumber: true, fullName: true },
      });
    }

    const roles = user.userRoles.map((ur) => ur.role.name);

    return {
      id: user.id,
      userId: user.id,
      email: user.email,
      name: `${user.firstName} ${user.lastName}`,
      firstName: user.firstName,
      lastName: user.lastName,
      roles,
      role: { name: roles[0] || 'employee' },
      employeeId: employee?.id || undefined,
      employee: employee || undefined,
    };
  } catch (err) {
    console.error('Error getting current user:', err);
    return null;
  }
}

export function hasAnyRole(user: any, allowedRoles: string[]): boolean {
  if (!user) return false;
  if (user.roles?.includes('super_admin') || user.role?.name === 'super_admin') return true;
  return allowedRoles.some((r) => user.roles?.includes(r) || user.role?.name === r);
}

