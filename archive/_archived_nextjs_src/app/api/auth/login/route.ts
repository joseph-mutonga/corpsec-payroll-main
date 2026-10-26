import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { verifyPassword, setSessionCookie } from '@/lib/auth';
import { loginSchema } from '@/lib/validation';
import { apiError, apiSuccess, apiValidationError } from '@/lib/response';
import { createAuditLog } from '@/lib/audit';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const validation = loginSchema.safeParse(body);

    if (!validation.success) {
      return apiValidationError(validation.error.flatten().fieldErrors);
    }

    const { email, password } = validation.data;

    // Find user by email
    const user = await db.user.findUnique({
      where: { email: email.toLowerCase() },
      include: {
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

    if (!user || user.deletedAt !== null) {
      return apiError('Invalid corporate email or password.', 'INVALID_CREDENTIALS', 401);
    }

    if (!user.isActive) {
      await createAuditLog({
        userId: user.id,
        userEmail: user.email,
        action: 'LOGIN_BLOCKED_INACTIVE',
        module: 'AUTH',
        entityType: 'USER',
        entityId: user.id,
      });

      return apiError(
        'Your account has been deactivated. Please contact the CorpSec System Administrator.',
        'ACCOUNT_DEACTIVATED',
        403
      );
    }

    // Verify password
    const isPasswordValid = await verifyPassword(password, user.passwordHash);
    if (!isPasswordValid) {
      await createAuditLog({
        userId: user.id,
        userEmail: user.email,
        action: 'LOGIN_FAILED_BAD_PASSWORD',
        module: 'AUTH',
        entityType: 'USER',
        entityId: user.id,
      });

      return apiError('Invalid corporate email or password.', 'INVALID_CREDENTIALS', 401);
    }

    // Extract roles and permissions
    const roles = user.userRoles.map((ur) => ur.role.name);
    const permissionsSet = new Set<string>();
    user.userRoles.forEach((ur) => {
      ur.role.rolePermissions.forEach((rp) => {
        permissionsSet.add(rp.permission.name);
      });
    });

    const sessionPayload = {
      userId: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      roles,
      permissions: Array.from(permissionsSet),
      isActive: user.isActive,
    };

    // Set HTTP-only secure session cookie
    await setSessionCookie(sessionPayload);

    // Update lastLoginAt
    await db.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    // Record audit log
    await createAuditLog({
      userId: user.id,
      userEmail: user.email,
      action: 'USER_LOGIN',
      module: 'AUTH',
      entityType: 'USER',
      entityId: user.id,
      newValue: { email: user.email, roles },
    });

    return apiSuccess({
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        roles,
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    return apiError('An unexpected error occurred during login. Please try again.', 'INTERNAL_ERROR', 500);
  }
}
