import { db } from '@/lib/db';
import { AuditService } from '@/lib/audit';

export interface CreateTrainerInput {
  name: string;
  type: 'INTERNAL' | 'EXTERNAL';
  employeeId?: string;
  organization?: string;
  email?: string;
  phone?: string;
  expertise?: string;
  costPerSession?: number;
  status?: 'ACTIVE' | 'INACTIVE';
  userId?: string;
}

export class TrainerService {
  static async generateTrainerNumber(): Promise<string> {
    let count = (await db.trainer.count()) + 1;
    let trainerNumber = `TRN-T-${String(count).padStart(4, '0')}`;
    while (await db.trainer.findUnique({ where: { trainerNumber } })) {
      count++;
      trainerNumber = `TRN-T-${String(count).padStart(4, '0')}`;
    }
    return trainerNumber;
  }

  static async createTrainer(data: CreateTrainerInput) {
    if (data.type === 'INTERNAL') {
      if (!data.employeeId) {
        throw new Error('Internal trainer must be linked to an existing employee record.');
      }
      const existingTrainer = await db.trainer.findUnique({ where: { employeeId: data.employeeId } });
      if (existingTrainer) {
        throw new Error('This employee is already registered as a trainer.');
      }
      const emp = await db.employee.findUnique({ where: { id: data.employeeId } });
      if (!emp) throw new Error('Employee record not found.');
      data.name = emp.fullName;
      data.email = data.email || emp.email || undefined;
      data.phone = data.phone || emp.primaryPhone || undefined;
    }

    const trainerNumber = await this.generateTrainerNumber();

    const trainer = await db.trainer.create({
      data: {
        trainerNumber,
        name: data.name.trim(),
        type: data.type || 'INTERNAL',
        employeeId: data.type === 'INTERNAL' ? data.employeeId : null,
        organization: data.organization,
        email: data.email,
        phone: data.phone,
        expertise: data.expertise,
        costPerSession: data.costPerSession ? Number(data.costPerSession) : 0,
        status: data.status || 'ACTIVE',
      },
      include: {
        employee: {
          select: { id: true, employeeNumber: true, fullName: true, department: true, position: true },
        },
      },
    });

    await AuditService.log({
      userId: data.userId,
      action: 'CREATE_TRAINER',
      module: 'TRAINING',
      entityId: trainer.id,
      newValue: { trainerNumber: trainer.trainerNumber, name: trainer.name, type: trainer.type },
    });

    return trainer;
  }

  static async updateTrainer(id: string, data: Partial<CreateTrainerInput>, userId?: string) {
    const existing = await db.trainer.findUnique({ where: { id } });
    if (!existing) throw new Error('Trainer not found.');

    const updated = await db.trainer.update({
      where: { id },
      data: {
        name: data.name !== undefined ? data.name.trim() : existing.name,
        organization: data.organization !== undefined ? data.organization : existing.organization,
        email: data.email !== undefined ? data.email : existing.email,
        phone: data.phone !== undefined ? data.phone : existing.phone,
        expertise: data.expertise !== undefined ? data.expertise : existing.expertise,
        costPerSession: data.costPerSession !== undefined ? Number(data.costPerSession) : existing.costPerSession,
        status: data.status || existing.status,
      },
      include: {
        employee: true,
      },
    });

    await AuditService.log({
      userId,
      action: 'UPDATE_TRAINER',
      module: 'TRAINING',
      entityId: id,
      previousValue: { name: existing.name, status: existing.status },
      newValue: { name: updated.name, status: updated.status },
    });

    return updated;
  }

  static async getTrainerById(id: string) {
    const trainer = await db.trainer.findUnique({
      where: { id },
      include: {
        employee: {
          include: { department: true, position: true, branch: true },
        },
        sessions: {
          orderBy: { startDate: 'desc' },
          include: {
            course: true,
            venue: true,
            _count: { select: { enrollments: true, attendances: true } },
          },
        },
      },
    });
    if (!trainer) throw new Error('Trainer not found.');
    return trainer;
  }

  static async listTrainers(filters: { search?: string; type?: string; status?: string }) {
    const where: any = {};
    if (filters.status && filters.status !== 'ALL') where.status = filters.status;
    if (filters.type && filters.type !== 'ALL') where.type = filters.type;
    if (filters.search) {
      const q = filters.search.trim();
      where.OR = [
        { name: { contains: q } },
        { trainerNumber: { contains: q } },
        { expertise: { contains: q } },
        { organization: { contains: q } },
        { email: { contains: q } },
      ];
    }

    return db.trainer.findMany({
      where,
      orderBy: { name: 'asc' },
      include: {
        employee: {
          select: { id: true, employeeNumber: true, fullName: true, department: true },
        },
        _count: { select: { sessions: true } },
      },
    });
  }

  static async getTrainerPerformance(id: string) {
    const trainer = await this.getTrainerById(id);

    const sessionIds = trainer.sessions.map((s) => s.id);

    const [enrollments, assessments, evaluations] = await Promise.all([
      db.trainingEnrollment.findMany({
        where: { sessionId: { in: sessionIds } },
        select: { status: true },
      }),
      db.trainingAssessment.findMany({
        where: { sessionId: { in: sessionIds } },
        select: { result: true, scorePercentage: true },
      }),
      db.trainingEvaluation.findMany({
        where: { sessionId: { in: sessionIds } },
        select: { overallRating: true, trainerRating: true, relevanceRating: true },
      }),
    ]);

    const totalSessionsDelivered = trainer.sessions.filter((s) => s.status === 'COMPLETED').length;
    const totalEmployeesTrained = enrollments.filter((e) => e.status === 'COMPLETED' || e.status === 'ATTENDED').length;

    const completedCount = enrollments.filter((e) => e.status === 'COMPLETED').length;
    const completionRate = enrollments.length > 0 ? Math.round((completedCount / enrollments.length) * 100) : 0;

    const passedAssessments = assessments.filter((a) => a.result === 'PASS').length;
    const assessmentPassRate = assessments.length > 0 ? Math.round((passedAssessments / assessments.length) * 100) : 0;

    const avgTrainerRating = evaluations.length > 0
      ? Math.round((evaluations.reduce((sum, e) => sum + e.trainerRating, 0) / evaluations.length) * 10) / 10
      : 5.0;

    const avgOverallRating = evaluations.length > 0
      ? Math.round((evaluations.reduce((sum, e) => sum + e.overallRating, 0) / evaluations.length) * 10) / 10
      : 5.0;

    return {
      trainer: {
        id: trainer.id,
        trainerNumber: trainer.trainerNumber,
        name: trainer.name,
        type: trainer.type,
        expertise: trainer.expertise,
      },
      stats: {
        totalSessions: trainer.sessions.length,
        totalSessionsDelivered,
        totalEmployeesEnrolled: enrollments.length,
        totalEmployeesTrained,
        completionRate,
        assessmentPassRate,
        evaluationsCount: evaluations.length,
        averageTrainerRating: avgTrainerRating,
        averageOverallRating: avgOverallRating,
      },
    };
  }
}
