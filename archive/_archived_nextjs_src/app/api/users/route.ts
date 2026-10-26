import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requirePermission } from '@/lib/permissions';
import { createUserSchema } from '@/lib/validation';
import { hashPassword } from '@/lib/auth';
import { apiError, apiSuccess, apiValidationError } from '@/lib/response';
import { createAuditLog } from '@/lib/audit';

export async function GET(req: NextRequest) {
  try {
    const auth = await requirePermission('users.view');
    if ('errorResponse' in auth) return auth.errorResponse;

    const users = await db.user.findMany({
      where: { deletedAt: null },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        isActive: true,
        isVerified: true,
        lastLoginAt: true,
        createdAt: true,
        updatedAt: true,
        userRoles: {
          include: {
            role: {
              select: {
                id: true,
                name: true,
                displayName: true,
                description: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return apiSuccess(users);
  } catch (error) {
    console.error('Fetch users error:', error);
    return apiError('Failed to fetch system users.');
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requirePermission('users.create');
    if ('errorResponse' in auth) return auth.errorResponse;

    const body = await req.json();
    const validation = createUserSchema.safeParse(body);

    if (!validation.success) {
      return apiValidationError(validation.error.flatten().fieldErrors);
    }

    const { email, password, firstName, lastName, phone, roles, isActive } = validation.data;

    // Check if user already exists
    const existing = await db.user.findUnique({
      where: { email },
    });

    if (existing) {
      return apiError('A user account with this email address already exists.', 'USER_EXISTS', 400);
    }

    const passwordHash = await hashPassword(password);

    // Verify all role IDs exist
    const dbRoles = await db.role.findMany({
      where: {
        OR: [{ id: { in: roles } }, { name: { in: roles } }],
      },
    });

    if (dbRoles.length === 0) {
      return apiError('At least one valid role must be assigned to the user.', 'INVALID_ROLES', 400);
    }

    const newUser = await db.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email,
          passwordHash,
          firstName,
          lastName,
          phone: phone || null,
          isActive: isActive !== undefined ? isActive : true,
          isVerified: true,
        },
      });

      for (const role of dbRoles) {
        await tx.userRole.create({
          data: {
            userId: user.id,
            roleId: role.id,
            assignedBy: auth.session.userId,
          },
        });
      }

      return user;
    });

    await createAuditLog({
      userId: auth.session.userId,
      userEmail: auth.session.email,
      action: 'CREATE_USER',
      module: 'USERS',
      entityType: 'USER',
      entityId: newUser.id,
      newValue: {
        email: newUser.email,
        firstName: newUser.firstName,
        lastName: newUser.lastName,
        roles: dbRoles.map((r) => r.name),
        isActive: newUser.isActive,
      },
    });

    return apiSuccess(
      {
        id: newUser.id,
        email: newUser.email,
        firstName: newUser.firstName,
        lastName: newUser.lastName,
        isActive: newUser.isActive,
      },
      undefined,
      201
    );
  } catch (error) {
    console.error('Create user error:', error);
    return apiError('Failed to create user account.');
  }
}
