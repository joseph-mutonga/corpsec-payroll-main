import { db } from '../db';

export class LeaveNotificationService {
  static async notify({
    userId,
    title,
    message,
    type = 'INFO',
    link,
  }: {
    userId: string;
    title: string;
    message: string;
    type?: 'INFO' | 'SUCCESS' | 'WARNING' | 'ERROR';
    link?: string;
  }) {
    try {
      await db.systemNotification.create({
        data: {
          userId,
          title,
          message,
          type,
          link: link || '/employee/leave',
          isRead: false,
        },
      });
    } catch (err) {
      console.error('Failed to create system notification:', err);
    }
  }

  static async notifyLeaveSubmitted(leaveRequest: {
    id: string;
    requestNumber: string;
    employee: { fullName: string; supervisorId?: string | null; department?: { name: string } | null };
    leaveType: { name: string };
    durationDays: number;
    startDate: Date;
    endDate: Date;
  }) {
    // 1. Notify employee
    const empUser = await db.user.findFirst({
      where: { employee: { fullName: leaveRequest.employee.fullName } },
    });
    if (empUser) {
      await this.notify({
        userId: empUser.id,
        title: `Leave Application Submitted (${leaveRequest.requestNumber})`,
        message: `Your request for ${leaveRequest.durationDays} day(s) of ${leaveRequest.leaveType.name} from ${new Date(leaveRequest.startDate).toLocaleDateString()} to ${new Date(leaveRequest.endDate).toLocaleDateString()} has been submitted for review.`,
        type: 'INFO',
        link: '/employee/leave',
      });
    }

    // 2. Notify Manager / Supervisor if assigned
    if (leaveRequest.employee.supervisorId) {
      const supervisor = await db.employee.findUnique({
        where: { id: leaveRequest.employee.supervisorId },
        include: { user: true },
      });
      if (supervisor?.userId) {
        await this.notify({
          userId: supervisor.userId,
          title: `Leave Approval Required: ${leaveRequest.employee.fullName}`,
          message: `${leaveRequest.employee.fullName} submitted a ${leaveRequest.leaveType.name} request (${leaveRequest.durationDays} days). Action required.`,
          type: 'WARNING',
          link: `/leave/approvals`,
        });
      }
    }
  }

  static async notifyDecision(
    leaveRequest: {
      requestNumber: string;
      employeeId: string;
      leaveType: { name: string };
      durationDays: number;
      startDate: Date;
      endDate: Date;
    },
    decision: 'APPROVED' | 'REJECTED' | 'CANCELLED',
    reason?: string
  ) {
    const emp = await db.employee.findUnique({
      where: { id: leaveRequest.employeeId },
      include: { user: true },
    });
    if (!emp?.userId) return;

    const title =
      decision === 'APPROVED'
        ? `Leave Approved: ${leaveRequest.requestNumber}`
        : decision === 'REJECTED'
        ? `Leave Request Rejected: ${leaveRequest.requestNumber}`
        : `Leave Cancelled: ${leaveRequest.requestNumber}`;

    const message =
      decision === 'APPROVED'
        ? `Your request for ${leaveRequest.durationDays} day(s) of ${leaveRequest.leaveType.name} from ${new Date(leaveRequest.startDate).toLocaleDateString()} to ${new Date(leaveRequest.endDate).toLocaleDateString()} has been APPROVED.`
        : decision === 'REJECTED'
        ? `Your request for ${leaveRequest.leaveType.name} (${leaveRequest.requestNumber}) was rejected.${reason ? ' Reason: ' + reason : ''}`
        : `Leave request ${leaveRequest.requestNumber} has been successfully cancelled and balance restored.`;

    await this.notify({
      userId: emp.userId,
      title,
      message,
      type: decision === 'APPROVED' ? 'SUCCESS' : decision === 'REJECTED' ? 'ERROR' : 'INFO',
      link: '/employee/leave',
    });
  }
}
