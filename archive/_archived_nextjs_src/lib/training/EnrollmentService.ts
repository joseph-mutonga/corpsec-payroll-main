import { db } from '@/lib/db';
import { AuditService } from '@/lib/audit';

export interface RequestEnrollmentInput {
  sessionId: string;
  employeeId: string;
  requestedById?: string;
  trainingNeedId?: string;
  developmentPlanId?: string;
  autoApprove?: boolean;
}

export class EnrollmentService {
  static async generateEnrollmentNumber(): Promise<string> {
    const year = new Date().getFullYear();
    let count = (await db.trainingEnrollment.count()) + 1;
    let enrollmentNumber = `ENR-${year}-${String(count).padStart(4, '0')}`;
    while (await db.trainingEnrollment.findUnique({ where: { enrollmentNumber } })) {
      count++;
      enrollmentNumber = `ENR-${year}-${String(count).padStart(4, '0')}`;
    }
    return enrollmentNumber;
  }

  static async requestEnrollment(data: RequestEnrollmentInput) {
    const session = await db.trainingSession.findUnique({
      where: { id: data.sessionId },
      include: { course: true, venue: true },
    });
    if (!session) throw new Error('Training session not found.');
    if (session.status === 'CANCELLED' || session.status === 'COMPLETED') {
      throw new Error(`Cannot enroll in a ${session.status.toLowerCase()} session.`);
    }

    const employee = await db.employee.findUnique({ where: { id: data.employeeId } });
    if (!employee) throw new Error('Employee record not found.');

    // Check for existing active enrollment
    const existing = await db.trainingEnrollment.findUnique({
      where: {
        sessionId_employeeId: {
          sessionId: data.sessionId,
          employeeId: data.employeeId,
        },
      },
    });

    if (existing) {
      if (['REQUESTED', 'APPROVED', 'ENROLLED', 'WAITLISTED', 'ATTENDED', 'COMPLETED'].includes(existing.status)) {
        throw new Error(`Employee is already ${existing.status.toLowerCase()} for this session.`);
      }
    }

    // Check capacity
    const activeEnrolledCount = await db.trainingEnrollment.count({
      where: {
        sessionId: data.sessionId,
        status: { in: ['APPROVED', 'ENROLLED', 'ATTENDED', 'COMPLETED'] },
      },
    });

    const isFull = activeEnrolledCount >= session.capacity;
    let initialStatus: string;
    let waitlistPos: number | null = null;

    if (isFull) {
      initialStatus = 'WAITLISTED';
      const waitlistCount = await db.trainingEnrollment.count({
        where: { sessionId: data.sessionId, status: 'WAITLISTED' },
      });
      waitlistPos = waitlistCount + 1;

      // Update session status to FULL if not already
      if (session.status !== 'FULL' && session.status !== 'IN_PROGRESS') {
        await db.trainingSession.update({
          where: { id: data.sessionId },
          data: { status: 'FULL' },
        });
      }
    } else {
      initialStatus = data.autoApprove ? 'ENROLLED' : 'REQUESTED';
    }

    const enrollmentNumber = await this.generateEnrollmentNumber();

    const enrollment = await db.trainingEnrollment.create({
      data: {
        enrollmentNumber,
        sessionId: data.sessionId,
        courseId: session.courseId,
        employeeId: data.employeeId,
        trainingNeedId: data.trainingNeedId,
        developmentPlanId: data.developmentPlanId,
        status: initialStatus,
        requestedById: data.requestedById,
        waitlistPosition: waitlistPos,
        hrApprovedAt: data.autoApprove ? new Date() : undefined,
        hrApprovedById: data.autoApprove ? data.requestedById : undefined,
      },
      include: {
        session: { include: { course: true, venue: true, trainer: true } },
        employee: { select: { id: true, fullName: true, employeeNumber: true, department: true } },
      },
    });

    // If linked to training need, update status
    if (data.trainingNeedId) {
      await db.trainingNeed.update({
        where: { id: data.trainingNeedId },
        data: { status: 'IN_PROGRESS', courseId: session.courseId },
      });
    }

    await AuditService.log({
      userId: data.requestedById,
      action: 'ENROLL_TRAINING_SESSION',
      module: 'TRAINING',
      entityId: enrollment.id,
      newValue: {
        enrollmentNumber: enrollment.enrollmentNumber,
        sessionNumber: session.sessionNumber,
        employee: employee.fullName,
        status: enrollment.status,
      },
    });

    return enrollment;
  }

  static async managerReview(
    enrollmentId: string,
    data: { decision: 'APPROVED' | 'REJECTED'; reason?: string; managerUserId: string }
  ) {
    const enrollment = await db.trainingEnrollment.findUnique({
      where: { id: enrollmentId },
      include: { session: true },
    });
    if (!enrollment) throw new Error('Enrollment not found.');

    if (data.decision === 'REJECTED') {
      const updated = await db.trainingEnrollment.update({
        where: { id: enrollmentId },
        data: {
          status: 'CANCELLED',
          managerApprovedById: data.managerUserId,
          managerApprovedAt: new Date(),
          managerDecision: 'REJECTED',
          managerReason: data.reason,
        },
      });

      await AuditService.log({
        userId: data.managerUserId,
        action: 'MANAGER_REJECT_TRAINING',
        module: 'TRAINING',
        entityId: enrollmentId,
        newValue: { status: 'CANCELLED', reason: data.reason },
      });

      return updated;
    }

    // Manager approved
    const updated = await db.trainingEnrollment.update({
      where: { id: enrollmentId },
      data: {
        status: 'APPROVED',
        managerApprovedById: data.managerUserId,
        managerApprovedAt: new Date(),
        managerDecision: 'APPROVED',
        managerReason: data.reason,
      },
    });

    await AuditService.log({
      userId: data.managerUserId,
      action: 'MANAGER_APPROVE_TRAINING',
      module: 'TRAINING',
      entityId: enrollmentId,
      newValue: { status: 'APPROVED' },
    });

    return updated;
  }

  static async hrApprove(enrollmentId: string, data: { hrUserId: string; hrReason?: string }) {
    const enrollment = await db.trainingEnrollment.findUnique({
      where: { id: enrollmentId },
      include: { session: true },
    });
    if (!enrollment) throw new Error('Enrollment not found.');

    // Check capacity
    const activeEnrolledCount = await db.trainingEnrollment.count({
      where: {
        sessionId: enrollment.sessionId,
        status: { in: ['APPROVED', 'ENROLLED', 'ATTENDED', 'COMPLETED'] },
        id: { not: enrollmentId },
      },
    });

    if (activeEnrolledCount >= enrollment.session.capacity) {
      // Seat full, must be waitlisted
      const waitlistCount = await db.trainingEnrollment.count({
        where: { sessionId: enrollment.sessionId, status: 'WAITLISTED', id: { not: enrollmentId } },
      });
      const updated = await db.trainingEnrollment.update({
        where: { id: enrollmentId },
        data: {
          status: 'WAITLISTED',
          waitlistPosition: waitlistCount + 1,
          hrApprovedById: data.hrUserId,
          hrApprovedAt: new Date(),
          hrReason: data.hrReason,
        },
      });
      return updated;
    }

    const updated = await db.trainingEnrollment.update({
      where: { id: enrollmentId },
      data: {
        status: 'ENROLLED',
        waitlistPosition: null,
        hrApprovedById: data.hrUserId,
        hrApprovedAt: new Date(),
        hrReason: data.hrReason,
      },
    });

    await AuditService.log({
      userId: data.hrUserId,
      action: 'HR_APPROVE_TRAINING_ENROLLMENT',
      module: 'TRAINING',
      entityId: enrollmentId,
      newValue: { status: 'ENROLLED' },
    });

    return updated;
  }

  static async cancelEnrollment(enrollmentId: string, data: { cancelledById?: string; reason?: string }) {
    const enrollment = await db.trainingEnrollment.findUnique({
      where: { id: enrollmentId },
      include: { session: true, employee: true },
    });
    if (!enrollment) throw new Error('Enrollment not found.');

    const wasActiveSeat = ['APPROVED', 'ENROLLED', 'ATTENDED'].includes(enrollment.status);

    const updated = await db.trainingEnrollment.update({
      where: { id: enrollmentId },
      data: {
        status: 'CANCELLED',
        waitlistPosition: null,
      },
    });

    // If an active seat was freed, execute FIFO Waitlist Promotion!
    if (wasActiveSeat) {
      await this.promoteNextWaitlisted(enrollment.sessionId, data.cancelledById);
    }

    await AuditService.log({
      userId: data.cancelledById,
      action: 'CANCEL_TRAINING_ENROLLMENT',
      module: 'TRAINING',
      entityId: enrollmentId,
      newValue: { status: 'CANCELLED', reason: data.reason },
    });

    return updated;
  }

  static async promoteNextWaitlisted(sessionId: string, triggeredByUserId?: string) {
    const session = await db.trainingSession.findUnique({ where: { id: sessionId } });
    if (!session) return null;

    const activeCount = await db.trainingEnrollment.count({
      where: {
        sessionId,
        status: { in: ['APPROVED', 'ENROLLED', 'ATTENDED', 'COMPLETED'] },
      },
    });

    if (activeCount >= session.capacity) return null; // Still full

    // Find first waitlisted candidate
    const nextCandidate = await db.trainingEnrollment.findFirst({
      where: {
        sessionId,
        status: 'WAITLISTED',
      },
      orderBy: { waitlistPosition: 'asc' },
      include: { employee: true },
    });

    if (!nextCandidate) {
      // Re-open session if it was FULL
      if (session.status === 'FULL') {
        await db.trainingSession.update({
          where: { id: sessionId },
          data: { status: 'OPEN' },
        });
      }
      return null;
    }

    // Promote to ENROLLED
    const promoted = await db.trainingEnrollment.update({
      where: { id: nextCandidate.id },
      data: {
        status: 'ENROLLED',
        waitlistPosition: null,
      },
    });

    // Re-index remaining waitlisted items
    const remainingWaitlisted = await db.trainingEnrollment.findMany({
      where: { sessionId, status: 'WAITLISTED' },
      orderBy: { waitlistPosition: 'asc' },
    });

    for (let i = 0; i < remainingWaitlisted.length; i++) {
      await db.trainingEnrollment.update({
        where: { id: remainingWaitlisted[i].id },
        data: { waitlistPosition: i + 1 },
      });
    }

    await AuditService.log({
      userId: triggeredByUserId,
      action: 'PROMOTE_WAITLISTED_TRAINING_ENROLLMENT',
      module: 'TRAINING',
      entityId: promoted.id,
      newValue: {
        promotedEmployee: nextCandidate.employee.fullName,
        sessionNumber: session.sessionNumber,
        newStatus: 'ENROLLED',
      },
    });

    return promoted;
  }

  static async listEnrollments(filters: {
    sessionId?: string;
    courseId?: string;
    employeeId?: string;
    status?: string;
    departmentId?: string;
  }) {
    const where: any = {};
    if (filters.sessionId && filters.sessionId !== 'ALL') where.sessionId = filters.sessionId;
    if (filters.courseId && filters.courseId !== 'ALL') where.courseId = filters.courseId;
    if (filters.employeeId && filters.employeeId !== 'ALL') where.employeeId = filters.employeeId;
    if (filters.status && filters.status !== 'ALL') where.status = filters.status;
    if (filters.departmentId && filters.departmentId !== 'ALL') {
      where.employee = { departmentId: filters.departmentId };
    }

    return db.trainingEnrollment.findMany({
      where,
      orderBy: { requestedAt: 'desc' },
      include: {
        session: {
          include: {
            course: true,
            venue: true,
            trainer: true,
          },
        },
        employee: {
          select: {
            id: true,
            employeeNumber: true,
            fullName: true,
            jobTitle: true,
            department: { select: { id: true, name: true } },
            station: { select: { id: true, name: true } },
          },
        },
        attendances: true,
        assessments: true,
        certificates: true,
        evaluation: true,
      },
    });
  }
}
