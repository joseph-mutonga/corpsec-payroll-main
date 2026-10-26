import { db } from '@/lib/db';
import { AuditService } from '@/lib/audit';

export interface CreateProgramInput {
  name: string;
  description?: string;
  departmentId?: string;
  targetAudience?: string;
  startDate: Date;
  endDate: Date;
  coordinatorId?: string;
  isMandatory?: boolean;
  status?: 'DRAFT' | 'OPEN' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED' | 'ARCHIVED';
  courseIds?: string[];
  createdById?: string;
}

export class ProgramService {
  static async generateProgramNumber(): Promise<string> {
    const year = new Date().getFullYear();
    let count = (await db.trainingProgram.count()) + 1;
    let programNumber = `PRG-${year}-${String(count).padStart(4, '0')}`;
    while (await db.trainingProgram.findUnique({ where: { programNumber } })) {
      count++;
      programNumber = `PRG-${year}-${String(count).padStart(4, '0')}`;
    }
    return programNumber;
  }

  static async createProgram(data: CreateProgramInput) {
    if (new Date(data.startDate) > new Date(data.endDate)) {
      throw new Error('Program Start Date must be before End Date.');
    }

    const programNumber = await this.generateProgramNumber();

    const program = await db.trainingProgram.create({
      data: {
        programNumber,
        name: data.name,
        description: data.description,
        departmentId: data.departmentId,
        targetAudience: data.targetAudience,
        startDate: new Date(data.startDate),
        endDate: new Date(data.endDate),
        coordinatorId: data.coordinatorId,
        isMandatory: !!data.isMandatory,
        status: data.status || 'DRAFT',
        programCourses: data.courseIds && data.courseIds.length > 0
          ? {
              create: data.courseIds.map((courseId, index) => ({
                courseId,
                orderIndex: index + 1,
              })),
            }
          : undefined,
      },
      include: {
        department: true,
        coordinator: { select: { id: true, firstName: true, lastName: true, email: true } },
        programCourses: {
          include: {
            course: true,
          },
          orderBy: { orderIndex: 'asc' },
        },
      },
    });

    await AuditService.log({
      userId: data.createdById,
      action: 'CREATE_TRAINING_PROGRAM',
      module: 'TRAINING',
      entityId: program.id,
      newValue: { programNumber: program.programNumber, name: program.name, status: program.status },
    });

    return program;
  }

  static async updateProgram(id: string, data: Partial<CreateProgramInput>, userId?: string) {
    const existing = await db.trainingProgram.findUnique({ where: { id } });
    if (!existing) throw new Error('Training program not found.');

    if (data.startDate && data.endDate && new Date(data.startDate) > new Date(data.endDate)) {
      throw new Error('Program Start Date must be before End Date.');
    }

    // Handle courseIds update if provided
    if (data.courseIds !== undefined) {
      await db.programCourse.deleteMany({ where: { programId: id } });
      if (data.courseIds.length > 0) {
        await db.programCourse.createMany({
          data: data.courseIds.map((courseId, index) => ({
            programId: id,
            courseId,
            orderIndex: index + 1,
          })),
        });
      }
    }

    const updated = await db.trainingProgram.update({
      where: { id },
      data: {
        name: data.name || existing.name,
        description: data.description !== undefined ? data.description : existing.description,
        departmentId: data.departmentId !== undefined ? data.departmentId : existing.departmentId,
        targetAudience: data.targetAudience !== undefined ? data.targetAudience : existing.targetAudience,
        startDate: data.startDate ? new Date(data.startDate) : existing.startDate,
        endDate: data.endDate ? new Date(data.endDate) : existing.endDate,
        coordinatorId: data.coordinatorId !== undefined ? data.coordinatorId : existing.coordinatorId,
        isMandatory: data.isMandatory !== undefined ? data.isMandatory : existing.isMandatory,
        status: data.status || existing.status,
      },
      include: {
        department: true,
        coordinator: { select: { id: true, firstName: true, lastName: true, email: true } },
        programCourses: {
          include: { course: true },
          orderBy: { orderIndex: 'asc' },
        },
      },
    });

    await AuditService.log({
      userId,
      action: 'UPDATE_TRAINING_PROGRAM',
      module: 'TRAINING',
      entityId: id,
      previousValue: { name: existing.name, status: existing.status },
      newValue: { name: updated.name, status: updated.status },
    });

    return updated;
  }

  static async getProgramById(id: string) {
    const program = await db.trainingProgram.findUnique({
      where: { id },
      include: {
        department: true,
        coordinator: { select: { id: true, firstName: true, lastName: true, email: true } },
        programCourses: {
          include: { course: true },
          orderBy: { orderIndex: 'asc' },
        },
        sessions: {
          include: {
            course: true,
            trainer: true,
            venue: true,
            _count: { select: { enrollments: true } },
          },
          orderBy: { startDate: 'asc' },
        },
        _count: {
          select: { certificates: true, costs: true },
        },
      },
    });
    if (!program) throw new Error('Training program not found.');
    return program;
  }

  static async listPrograms(filters: {
    search?: string;
    departmentId?: string;
    status?: string;
    isMandatory?: boolean;
  }) {
    const where: any = {};

    if (filters.status && filters.status !== 'ALL') {
      where.status = filters.status;
    } else {
      where.status = { not: 'ARCHIVED' };
    }

    if (filters.departmentId && filters.departmentId !== 'ALL') {
      where.departmentId = filters.departmentId;
    }

    if (filters.isMandatory !== undefined) {
      where.isMandatory = filters.isMandatory;
    }

    if (filters.search) {
      const q = filters.search.trim();
      where.OR = [
        { programNumber: { contains: q } },
        { name: { contains: q } },
        { description: { contains: q } },
        { targetAudience: { contains: q } },
      ];
    }

    return db.trainingProgram.findMany({
      where,
      orderBy: [{ isMandatory: 'desc' }, { startDate: 'desc' }],
      include: {
        department: true,
        coordinator: { select: { id: true, firstName: true, lastName: true, email: true } },
        programCourses: {
          include: { course: true },
          orderBy: { orderIndex: 'asc' },
        },
        _count: {
          select: { sessions: true, certificates: true },
        },
      },
    });
  }
}
