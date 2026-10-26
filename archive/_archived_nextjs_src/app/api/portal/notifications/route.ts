import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/permissions';
import { apiSuccess, apiError } from '@/lib/response';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if ('errorResponse' in auth) {
      return auth.errorResponse;
    }

    const { session } = auth;

    const notifications = await db.systemNotification.findMany({
      where: {
        userId: session.userId,
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: 50,
    });

    const unreadCount = await db.systemNotification.count({
      where: {
        userId: session.userId,
        isRead: false,
      },
    });

    return apiSuccess({
      notifications,
      unreadCount,
    });
  } catch (error: any) {
    console.error('Error fetching employee notifications:', error);
    return apiError(error.message || 'Failed to load notifications');
  }
}
