import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requirePermission } from '@/lib/permissions';
import { updateUserSchema } from '@/lib/validation';
import { hashPassword } from '@/lib/auth';
import { apiError, apiNotFound, apiSuccess, apiValidationError } from '@/lib/response';
import { createAuditLog } from '@/lib/audit';

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requirePermission('users.view');
    if ('errorResponse' in auth) return auth.errorResponse;

    const user = await db.user.findFirst({
      where: { id: params.id, deletedAt: null },
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
            role: true,
          },
        },
      },
    });

    if (!user) return apiNotFound('User not found.');

    return apiSuccess(user);
  } catch (error) {
    console.error('Get user error:', error);
    return apiError('Failed to fetch user.');
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requirePermission('users.edit');
    if ('errorResponse' in auth) return auth.errorResponse;

    const body = await req.json();
    const validation = updateUserSchema.safeParse(body);

    if (!validation.success) {
      return apiValidationError(validation.error.flatten().fieldErrors);
    }

    const existingUser = await db.user.findFirst({
      where: { id: params.id, deletedAt: null },
      include: {
        userRoles: {
          include: { role: true },
        },
      },
    });

    if (!existingUser) return apiNotFound('User not found.');

    const previousValue = {
      firstName: existingUser.firstName,
      lastName: existingUser.lastName,
      phone: existingUser.phone,
      isActive: existingUser.isActive,
      roles: existingUser.userRoles.map((ur) => ur.role.name),
    };

    const updateData: any = {};
    if (validation.data.firstName !== undefined) updateData.firstName = validation.data.firstName;
    if (validation.data.lastName !== undefined) updateData.lastName = validation.data.lastName;
    if (validation.data.phone !== undefined) updateData.phone = validation.data.phone || null;
    if (validation.data.isActive !== undefined) updateData.isActive = validation.data.isActive;
    if (validation.data.password) {
      updateData.passwordHash = await hashPassword(validation.data.password);
    }

    const updatedUser = await db.$transaction(async (tx) => {
      const u = await tx.user.update({
        where: { id: params.id },
        data: updateData,
      });

      // Update roles if provided
      if (validation.data.roles && validation.data.roles.length > 0) {
        await tx.userRole.deleteMany({
          where: { userId: params.id },
        });

        const dbRoles = await tx.role.findMany({
          where: {
            OR: [
              { id: { in: validation.data.roles } },
              { name: { in: validation.data.roles } },
            ],
          },
        });

        for (const r of dbRoles) {
          await tx.userRole.create({
            data: {
              userId: params.id,
              roleId: r.id,
              assignedBy: auth.session.userId,
            },
          });
        }
      }

      return u;
    });

    await createAuditLog({
      userId: auth.session.userId,
      userEmail: auth.session.email,
      action: 'UPDATE_USER',
      module: 'USERS',
      entityType: 'USER',
      entityId: updatedUser.id,
      previousValue,
      newValue: {
        firstName: updatedUser.firstName,
        lastName: updatedUser.lastName,
        phone: updatedUser.phone,
        isActive: updatedUser.isActive,
      },
    });

    return apiSuccess({
      id: updatedUser.id,
      email: updatedUser.email,
      firstName: updatedUser.firstName,
      lastName: updatedUser.lastName,
      isActive: updatedUser.isActive,
    });
  } catch (error) {
    console.error('Update user error:', error);
    return apiError('Failed to update user.');
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requirePermission('users.delete');
    if ('errorResponse' in auth) return auth.errorResponse;

    const user = await db.user.findFirst({
      where: { id: params.id, deletedAt: null },
    });

    if (!user) return apiNotFound('User not found.');

    // Prevent self-deletion
    if (user.id === auth.session.userId) {
      return apiError('You cannot delete your own active administrator account.', 'SELF_DELETE_FORBIDDEN', 400);
    }

    // Soft delete
    await db.user.update({
      where: { id: params.id },
      data: {
        deletedAt: new Date(),
        isActive: false,
      },
    });

    await createAuditLog({
      userId: auth.session.userId,
      userEmail: auth.session.email,
      action: 'SOFT_DELETE_USER',
      module: 'USERS',
      entityType: 'USER',
      entityId: user.id,
      previousValue: { email: user.email, isActive: user.isActive },
      newValue: { deletedAt: new Date().toISOString(), isActive: false },
    });

    return apiSuccess({ message: 'User deactivated and deleted successfully.' });
  } catch (error) {
    console.error('Delete user error:', error);
    return apiError('Failed to delete user.');
  }
}
