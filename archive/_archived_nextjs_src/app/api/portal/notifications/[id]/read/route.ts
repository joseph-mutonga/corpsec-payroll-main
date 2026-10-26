import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/permissions';
import { apiSuccess, apiError, apiNotFound, apiForbidden } from '@/lib/response';

export const dynamic = 'force-dynamic';

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireAuth();
    if ('errorResponse' in auth) {
      return auth.errorResponse;
    }

    const { session } = auth;
    const notificationId = params.id;

    const notification = await db.systemNotification.findUnique({
      where: { id: notificationId },
    });

    if (!notification) {
      return apiNotFound('Notification not found');
    }

    // IDOR check: only recipient user can mark as read
    if (notification.userId !== session.userId) {
      return apiForbidden('Access denied');
    }

    const updated = await db.systemNotification.update({
      where: { id: notificationId },
      data: {
        isRead: true,
        readAt: new Date(),
      },
    });

    return apiSuccess(updated);
  } catch (error: any) {
    console.error('Error marking notification as read:', error);
    return apiError(error.message || 'Failed to update notification');
  }
}
