import { db } from '@/lib/db';
import { AuditService } from '@/lib/audit';
import { VenueService } from './VenueService';

export interface CreateSessionInput {
  courseId: string;
  programId?: string;
  trainerId?: string;
  venueId?: string;
  deliveryMethod?: 'CLASSROOM' | 'ONLINE' | 'HYBRID' | 'PRACTICAL' | 'EXTERNAL';
  onlinePlatform?: string;
  onlineMeetingUrl?: string;
  onlineMeetingInstructions?: string;
  startDate: Date;
  endDate: Date;
  startTime?: string;
  endTime?: string;
  capacity?: number;
  status?: 'SCHEDULED' | 'OPEN' | 'FULL' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  createdById?: string;
}

export class SessionService {
  static async generateSessionNumber(): Promise<string> {
    const year = new Date().getFullYear();
    let count = (await db.trainingSession.count()) + 1;
    let sessionNumber = `SES-${year}-${String(count).padStart(4, '0')}`;
    while (await db.trainingSession.findUnique({ where: { sessionNumber } })) {
      count++;
      sessionNumber = `SES-${year}-${String(count).padStart(4, '0')}`;
    }
    return sessionNumber;
  }

  static async createSession(data: CreateSessionInput) {
    if (new Date(data.startDate) > new Date(data.endDate)) {
      throw new Error('Session Start Date must be before or equal to End Date.');
    }

    const course = await db.course.findUnique({ where: { id: data.courseId } });
    if (!course) throw new Error('Selected course does not exist.');

    const capacity = data.capacity ? Number(data.capacity) : 20;

    // If venue is specified, validate that capacity does not exceed venue capacity
    if (data.venueId) {
      await VenueService.validateVenueCapacity(data.venueId, capacity);
    }

    // Default trainer from course if not provided
    const trainerId = data.trainerId || course.defaultTrainerId || undefined;

    const sessionNumber = await this.generateSessionNumber();

    const session = await db.trainingSession.create({
      data: {
        sessionNumber,
        courseId: data.courseId,
        programId: data.programId,
        trainerId,
        venueId: data.venueId,
        deliveryMethod: data.deliveryMethod || course.deliveryMethod || 'CLASSROOM',
        onlinePlatform: data.onlinePlatform,
        onlineMeetingUrl: data.onlineMeetingUrl,
        onlineMeetingInstructions: data.onlineMeetingInstructions,
        startDate: new Date(data.startDate),
        endDate: new Date(data.endDate),
        startTime: data.startTime || '09:00',
        endTime: data.endTime || '17:00',
        capacity,
        status: data.status || 'OPEN',
        createdById: data.createdById,
      },
      include: {
        course: true,
        trainer: true,
        venue: true,
        program: true,
      },
    });

    await AuditService.log({
      userId: data.createdById,
      action: 'SCHEDULE_TRAINING_SESSION',
      module: 'TRAINING',
      entityId: session.id,
      newValue: {
        sessionNumber: session.sessionNumber,
        course: course.title,
        startDate: session.startDate,
        capacity: session.capacity,
      },
    });

    return session;
  }

  static async updateSession(id: string, data: Partial<CreateSessionInput>, userId?: string) {
    const existing = await db.trainingSession.findUnique({ where: { id } });
    if (!existing) throw new Error('Training session not found.');

    if (data.startDate && data.endDate && new Date(data.startDate) > new Date(data.endDate)) {
      throw new Error('Session Start Date must be before or equal to End Date.');
    }

    const capacity = data.capacity !== undefined ? Number(data.capacity) : existing.capacity;
    const venueId = data.venueId !== undefined ? data.venueId : existing.venueId;

    if (venueId && capacity) {
      await VenueService.validateVenueCapacity(venueId, capacity);
    }

    const updated = await db.trainingSession.update({
      where: { id },
      data: {
        courseId: data.courseId || existing.courseId,
        programId: data.programId !== undefined ? data.programId : existing.programId,
        trainerId: data.trainerId !== undefined ? data.trainerId : existing.trainerId,
        venueId: data.venueId !== undefined ? data.venueId : existing.venueId,
        deliveryMethod: data.deliveryMethod || existing.deliveryMethod,
        onlinePlatform: data.onlinePlatform !== undefined ? data.onlinePlatform : existing.onlinePlatform,
        onlineMeetingUrl: data.onlineMeetingUrl !== undefined ? data.onlineMeetingUrl : existing.onlineMeetingUrl,
        onlineMeetingInstructions: data.onlineMeetingInstructions !== undefined ? data.onlineMeetingInstructions : existing.onlineMeetingInstructions,
        startDate: data.startDate ? new Date(data.startDate) : existing.startDate,
        endDate: data.endDate ? new Date(data.endDate) : existing.endDate,
        startTime: data.startTime || existing.startTime,
        endTime: data.endTime || existing.endTime,
        capacity,
        status: data.status || existing.status,
      },
      include: {
        course: true,
        trainer: true,
        venue: true,
        program: true,
      },
    });

    await AuditService.log({
      userId,
      action: 'UPDATE_TRAINING_SESSION',
      module: 'TRAINING',
      entityId: id,
      previousValue: { status: existing.status, capacity: existing.capacity },
      newValue: { status: updated.status, capacity: updated.capacity },
    });

    return updated;
  }

  static async updateSessionStatus(
    id: string,
    status: 'SCHEDULED' | 'OPEN' | 'FULL' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED',
    userId?: string
  ) {
    const session = await db.trainingSession.findUnique({ where: { id } });
    if (!session) throw new Error('Session not found.');

    const updated = await db.trainingSession.update({
      where: { id },
      data: { status },
      include: { course: true, trainer: true, venue: true },
    });

    await AuditService.log({
      userId,
      action: 'CHANGE_TRAINING_SESSION_STATUS',
      module: 'TRAINING',
      entityId: id,
      previousValue: { status: session.status },
      newValue: { status },
    });

    return updated;
  }

  static async getSessionById(id: string, sanitizeOnlineDetailsForPublic = false) {
    const session = await db.trainingSession.findUnique({
      where: { id },
      include: {
        course: {
          include: { category: true },
        },
        trainer: {
          include: {
            employee: { select: { id: true, fullName: true, employeeNumber: true, jobTitle: true } },
          },
        },
        venue: {
          include: { branch: true, station: true },
        },
        program: true,
        enrollments: {
          orderBy: { requestedAt: 'asc' },
          include: {
            employee: {
              select: {
                id: true,
                employeeNumber: true,
                fullName: true,
                department: { select: { id: true, name: true } },
                position: { select: { id: true, title: true } },
                station: { select: { id: true, name: true } },
              },
            },
            attendances: true,
            assessments: true,
            certificates: true,
            evaluation: true,
          },
        },
        _count: {
          select: {
            enrollments: true,
            attendances: true,
            assessments: true,
            evaluations: true,
          },
        },
      },
    });

    if (!session) throw new Error('Training session not found.');

    if (sanitizeOnlineDetailsForPublic && session.status !== 'IN_PROGRESS' && session.status !== 'OPEN') {
      return {
        ...session,
        onlineMeetingUrl: 'Available upon enrollment confirmation',
      };
    }

    return session;
  }

  static async listSessions(filters: {
    search?: string;
    courseId?: string;
    programId?: string;
    trainerId?: string;
    venueId?: string;
    status?: string;
    deliveryMethod?: string;
    startDateFrom?: Date;
    startDateTo?: Date;
  }) {
    const where: any = {};

    if (filters.status && filters.status !== 'ALL') {
      where.status = filters.status;
    }

    if (filters.courseId && filters.courseId !== 'ALL') {
      where.courseId = filters.courseId;
    }

    if (filters.programId && filters.programId !== 'ALL') {
      where.programId = filters.programId;
    }

    if (filters.trainerId && filters.trainerId !== 'ALL') {
      where.trainerId = filters.trainerId;
    }

    if (filters.venueId && filters.venueId !== 'ALL') {
      where.venueId = filters.venueId;
    }

    if (filters.deliveryMethod && filters.deliveryMethod !== 'ALL') {
      where.deliveryMethod = filters.deliveryMethod;
    }

    if (filters.startDateFrom || filters.startDateTo) {
      where.startDate = {};
      if (filters.startDateFrom) where.startDate.gte = new Date(filters.startDateFrom);
      if (filters.startDateTo) where.startDate.lte = new Date(filters.startDateTo);
    }

    if (filters.search) {
      const q = filters.search.trim();
      where.OR = [
        { sessionNumber: { contains: q } },
        { course: { title: { contains: q } } },
        { course: { code: { contains: q } } },
        { trainer: { name: { contains: q } } },
        { venue: { name: { contains: q } } },
      ];
    }

    return db.trainingSession.findMany({
      where,
      orderBy: { startDate: 'desc' },
      include: {
        course: { select: { id: true, code: true, title: true, isMandatory: true, categoryName: true } },
        trainer: { select: { id: true, name: true, type: true } },
        venue: { select: { id: true, name: true, capacity: true } },
        program: { select: { id: true, name: true, programNumber: true } },
        _count: {
          select: {
            enrollments: true,
          },
        },
      },
    });
  }
}
