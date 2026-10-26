import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/permissions';
import { apiError, apiSuccess } from '@/lib/response';

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth();
    if ('errorResponse' in auth) return auth.errorResponse;

    const roles = await db.role.findMany({
      include: {
        rolePermissions: {
          include: {
            permission: true,
          },
        },
      },
      orderBy: { name: 'asc' },
    });

    return apiSuccess(roles);
  } catch (error) {
    console.error('Fetch roles error:', error);
    return apiError('Failed to fetch system roles.');
  }
}
