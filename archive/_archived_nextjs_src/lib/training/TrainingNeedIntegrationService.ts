import { db } from '@/lib/db';
import { AuditService } from '@/lib/audit';

export class TrainingNeedIntegrationService {
  static async listTrainingNeeds(filters: {
    employeeId?: string;
    departmentId?: string;
    status?: string;
    priority?: string;
    source?: string;
  }) {
    const where: any = {};
    if (filters.employeeId && filters.employeeId !== 'ALL') where.employeeId = filters.employeeId;
    if (filters.status && filters.status !== 'ALL') where.status = filters.status;
    if (filters.priority && filters.priority !== 'ALL') where.priority = filters.priority;
    if (filters.source && filters.source !== 'ALL') where.source = filters.source;
    if (filters.departmentId && filters.departmentId !== 'ALL') {
      where.employee = { departmentId: filters.departmentId };
    }

    return db.trainingNeed.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        employee: {
          select: {
            id: true,
            employeeNumber: true,
            fullName: true,
            jobTitle: true,
            department: { select: { id: true, name: true } },
          },
        },
        course: { select: { id: true, code: true, title: true } },
        developmentPlan: { select: { id: true, planNumber: true, objective: true } },
        competency: { select: { id: true, code: true, name: true } },
      },
    });
  }

  static async convertNeedToPlan(
    needId: string,
    data: { courseId?: string; developmentPlanId?: string; targetDate?: Date; userId?: string }
  ) {
    const need = await db.trainingNeed.findUnique({
      where: { id: needId },
      include: { employee: true },
    });
    if (!need) throw new Error('Training need not found.');

    const updated = await db.trainingNeed.update({
      where: { id: needId },
      data: {
        courseId: data.courseId || need.courseId,
        developmentPlanId: data.developmentPlanId || need.developmentPlanId,
        targetDate: data.targetDate ? new Date(data.targetDate) : need.targetDate,
        status: 'PLANNED',
      },
      include: {
        course: true,
        developmentPlan: true,
      },
    });

    await AuditService.log({
      userId: data.userId,
      action: 'CONVERT_TRAINING_NEED_TO_PLAN',
      module: 'TRAINING',
      entityId: needId,
      newValue: {
        needNumber: need.needNumber,
        employee: need.employee.fullName,
        status: 'PLANNED',
        course: updated.course?.title,
      },
    });

    return updated;
  }
}
