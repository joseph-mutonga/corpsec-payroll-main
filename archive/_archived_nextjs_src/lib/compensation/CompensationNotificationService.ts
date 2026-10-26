import { db } from '@/lib/db';

export class CompensationNotificationService {
  /**
   * Dispatches system in-app notification for compensation and benefits milestones.
   */
  static async sendNotification(data: {
    userId?: string;
    employeeId?: string;
    title: string;
    message: string;
    type?: 'info' | 'warning' | 'success' | 'alert';
    actionUrl?: string;
  }) {
    try {
      let targetUserId = data.userId;

      if (!targetUserId && data.employeeId) {
        const emp = await db.employee.findUnique({
          where: { id: data.employeeId },
          select: { userId: true },
        });
        targetUserId = emp?.userId || undefined;
      }

      if (!targetUserId) return null;

      return await db.systemNotification.create({
        data: {
          userId: targetUserId,
          title: data.title,
          message: data.message,
          type: data.type || 'info',
          link: data.actionUrl || null,
          isRead: false,
        },
      });
    } catch (err) {
      console.warn('Compensation notification dispatch skipped:', err);
      return null;
    }
  }
}
