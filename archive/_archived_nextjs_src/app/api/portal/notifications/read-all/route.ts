import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/permissions';
import { apiSuccess, apiError } from '@/lib/response';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if ('errorResponse' in auth) {
      return auth.errorResponse;
    }

    const { session } = auth;

    await db.systemNotification.updateMany({
      where: {
        userId: session.userId,
        isRead: false,
      },
      data: {
        isRead: true,
        readAt: new Date(),
      },
    });

    return apiSuccess({ success: true }, 'All notifications marked as read');
  } catch (error: any) {
    console.error('Error marking all notifications as read:', error);
    return apiError(error.message || 'Failed to mark all notifications as read');
  }
}
