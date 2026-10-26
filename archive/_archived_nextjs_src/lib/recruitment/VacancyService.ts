import { db } from '@/lib/db';
import { createAuditLog } from '@/lib/audit';

export interface CreateVacancyInput {
  title: string;
  departmentId: string;
  branchId?: string;
  stationId?: string;
  positionId?: string;
  employmentType?: string;
  openingsCount?: number;
  description: string;
  responsibilities?: string;
  requirements?: string;
  qualifications?: string;
  skillsRequired?: string;
  experienceYears?: number;
  minSalary?: number;
  maxSalary?: number;
  showSalaryPublicly?: boolean;
  applicationDeadline?: Date | string;
  hiringManagerId?: string;
  assignedRecruiterId?: string;
  status?: string;
}

export class VacancyService {
  /**
   * Generates next sequential Vacancy Number: VAC-YYYY-XXXX
   */
  static async generateVacancyNumber(): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `VAC-${year}-`;
    const lastVacancy = await db.vacancy.findFirst({
      where: { vacancyNumber: { startsWith: prefix } },
      orderBy: { vacancyNumber: 'desc' },
      select: { vacancyNumber: true },
    });

    let seq = 1;
    if (lastVacancy) {
      const parts = lastVacancy.vacancyNumber.split('-');
      if (parts.length >= 3) {
        const num = parseInt(parts[2], 10);
        if (!isNaN(num)) seq = num + 1;
      }
    }
    return `${prefix}${String(seq).padStart(4, '0')}`;
  }

  static async createVacancy(input: CreateVacancyInput, createdById?: string) {
    const vacancyNumber = await this.generateVacancyNumber();
    const deadline = input.applicationDeadline ? new Date(input.applicationDeadline) : undefined;

    const vacancy = await db.vacancy.create({
      data: {
        vacancyNumber,
        title: input.title,
        departmentId: input.departmentId,
        branchId: input.branchId,
        stationId: input.stationId,
        positionId: input.positionId,
        employmentType: input.employmentType || 'PERMANENT',
        openingsCount: input.openingsCount || 1,
        description: input.description,
        responsibilities: input.responsibilities,
        requirements: input.requirements,
        qualifications: input.qualifications,
        skillsRequired: input.skillsRequired,
        experienceYears: input.experienceYears,
        minSalary: input.minSalary,
        maxSalary: input.maxSalary,
        showSalaryPublicly: input.showSalaryPublicly ?? false,
        applicationDeadline: deadline,
        hiringManagerId: input.hiringManagerId,
        assignedRecruiterId: input.assignedRecruiterId,
        status: input.status || 'DRAFT',
        publishedAt: input.status === 'OPEN' ? new Date() : undefined,
      },
      include: {
        department: { select: { id: true, name: true, code: true } },
        station: { select: { id: true, name: true, code: true } },
        position: { select: { id: true, title: true, code: true } },
      },
    });

    if (createdById) {
      await createAuditLog({
        userId: createdById,
        action: 'VACANCY_CREATE',
        module: 'RECRUITMENT',
        entityType: 'RECRUITMENT',
        entityId: vacancy.id,
        newValue: { vacancyNumber: vacancy.vacancyNumber, title: vacancy.title, status: vacancy.status },
      });
    }

    return vacancy;
  }

  static async updateVacancy(id: string, input: Partial<CreateVacancyInput>, updatedById?: string) {
    const existing = await db.vacancy.findUnique({ where: { id } });
    if (!existing) throw new Error('Vacancy not found');

    const updateData: any = { ...input };
    if (input.applicationDeadline) {
      updateData.applicationDeadline = new Date(input.applicationDeadline);
    }
    if (input.status === 'OPEN' && existing.status !== 'OPEN') {
      updateData.publishedAt = new Date();
    }
    if (input.status === 'CLOSED' && existing.status !== 'CLOSED') {
      updateData.closedAt = new Date();
    }

    const updated = await db.vacancy.update({
      where: { id },
      data: updateData,
      include: {
        department: { select: { id: true, name: true, code: true } },
        station: { select: { id: true, name: true, code: true } },
        position: { select: { id: true, title: true, code: true } },
      },
    });

    if (updatedById) {
      await createAuditLog({
        userId: updatedById,
        action: 'VACANCY_UPDATE',
        module: 'RECRUITMENT',
        entityType: 'RECRUITMENT',
        entityId: id,
        previousValue: { status: existing.status },
        newValue: { status: updated.status },
      });
    }

    return updated;
  }

  static async duplicateVacancy(id: string, userId?: string) {
    const existing = await db.vacancy.findUnique({ where: { id } });
    if (!existing) throw new Error('Vacancy not found');

    const newNumber = await this.generateVacancyNumber();
    const cloned = await db.vacancy.create({
      data: {
        vacancyNumber: newNumber,
        title: `${existing.title} (Copy)`,
        departmentId: existing.departmentId,
        branchId: existing.branchId,
        stationId: existing.stationId,
        positionId: existing.positionId,
        employmentType: existing.employmentType,
        openingsCount: existing.openingsCount,
        description: existing.description,
        responsibilities: existing.responsibilities,
        requirements: existing.requirements,
        qualifications: existing.qualifications,
        skillsRequired: existing.skillsRequired,
        experienceYears: existing.experienceYears,
        minSalary: existing.minSalary,
        maxSalary: existing.maxSalary,
        showSalaryPublicly: existing.showSalaryPublicly,
        applicationDeadline: existing.applicationDeadline,
        hiringManagerId: existing.hiringManagerId,
        assignedRecruiterId: existing.assignedRecruiterId,
        status: 'DRAFT',
      },
      include: {
        department: { select: { id: true, name: true, code: true } },
        station: { select: { id: true, name: true, code: true } },
      },
    });

    if (userId) {
      await createAuditLog({
        userId,
        action: 'VACANCY_DUPLICATE',
        module: 'RECRUITMENT',
        entityType: 'RECRUITMENT',
        entityId: cloned.id,
        newValue: { originalNumber: existing.vacancyNumber, clonedNumber: cloned.vacancyNumber },
      });
    }

    return cloned;
  }

  static async getVacancies(filters?: {
    status?: string;
    departmentId?: string;
    stationId?: string;
    employmentType?: string;
    search?: string;
  }) {
    const where: any = {};
    if (filters?.status && filters.status !== 'ALL') where.status = filters.status;
    if (filters?.departmentId && filters.departmentId !== 'ALL') where.departmentId = filters.departmentId;
    if (filters?.stationId && filters.stationId !== 'ALL') where.stationId = filters.stationId;
    if (filters?.employmentType && filters.employmentType !== 'ALL') where.employmentType = filters.employmentType;
    if (filters?.search) {
      where.OR = [
        { title: { contains: filters.search } },
        { vacancyNumber: { contains: filters.search } },
        { description: { contains: filters.search } },
      ];
    }

    const vacancies = await db.vacancy.findMany({
      where,
      include: {
        department: { select: { id: true, name: true, code: true } },
        branch: { select: { id: true, name: true, code: true } },
        station: { select: { id: true, name: true, code: true } },
        position: { select: { id: true, title: true, code: true } },
        assignedRecruiter: { select: { id: true, firstName: true, lastName: true, email: true } },
        _count: { select: { candidates: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return vacancies;
  }

  static async getVacancyById(id: string) {
    const vacancy = await db.vacancy.findUnique({
      where: { id },
      include: {
        department: { select: { id: true, name: true, code: true } },
        branch: { select: { id: true, name: true, code: true } },
        station: { select: { id: true, name: true, code: true } },
        position: { select: { id: true, title: true, code: true } },
        hiringManager: { select: { id: true, firstName: true, lastName: true, email: true } },
        assignedRecruiter: { select: { id: true, firstName: true, lastName: true, email: true } },
        candidates: {
          select: {
            id: true,
            applicationNumber: true,
            fullName: true,
            email: true,
            phone: true,
            currentStage: true,
            screeningStatus: true,
            screeningScore: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'desc' },
        },
        _count: { select: { candidates: true, interviews: true, jobOffers: true } },
      },
    });

    return vacancy;
  }

  /**
   * Public careers search: returns only active OPEN vacancies and masks sensitive fields
   */
  static async getPublicVacancies(filters?: {
    departmentId?: string;
    stationId?: string;
    employmentType?: string;
    search?: string;
  }) {
    const now = new Date();
    const where: any = {
      status: 'OPEN',
      OR: [
        { applicationDeadline: null },
        { applicationDeadline: { gte: now } },
      ],
    };

    if (filters?.departmentId && filters.departmentId !== 'ALL') where.departmentId = filters.departmentId;
    if (filters?.stationId && filters.stationId !== 'ALL') where.stationId = filters.stationId;
    if (filters?.employmentType && filters.employmentType !== 'ALL') where.employmentType = filters.employmentType;
    if (filters?.search) {
      where.AND = [
        {
          OR: [
            { title: { contains: filters.search } },
            { description: { contains: filters.search } },
            { skillsRequired: { contains: filters.search } },
          ],
        },
      ];
    }

    const vacancies = await db.vacancy.findMany({
      where,
      select: {
        id: true,
        vacancyNumber: true,
        title: true,
        employmentType: true,
        openingsCount: true,
        description: true,
        responsibilities: true,
        requirements: true,
        qualifications: true,
        skillsRequired: true,
        experienceYears: true,
        showSalaryPublicly: true,
        minSalary: true,
        maxSalary: true,
        applicationDeadline: true,
        publishedAt: true,
        department: { select: { id: true, name: true } },
        station: { select: { id: true, name: true, townCity: true } },
        branch: { select: { id: true, name: true, townCity: true } },
      },
      orderBy: { publishedAt: 'desc' },
    });

    // Mask salary if not public
    return vacancies.map((v) => ({
      ...v,
      minSalary: v.showSalaryPublicly ? v.minSalary : null,
      maxSalary: v.showSalaryPublicly ? v.maxSalary : null,
    }));
  }

  static async getPublicVacancyDetail(id: string) {
    const now = new Date();
    const vacancy = await db.vacancy.findFirst({
      where: {
        id,
        status: 'OPEN',
        OR: [
          { applicationDeadline: null },
          { applicationDeadline: { gte: now } },
        ],
      },
      select: {
        id: true,
        vacancyNumber: true,
        title: true,
        employmentType: true,
        openingsCount: true,
        description: true,
        responsibilities: true,
        requirements: true,
        qualifications: true,
        skillsRequired: true,
        experienceYears: true,
        showSalaryPublicly: true,
        minSalary: true,
        maxSalary: true,
        applicationDeadline: true,
        publishedAt: true,
        department: { select: { id: true, name: true } },
        station: { select: { id: true, name: true, townCity: true, physicalLocation: true } },
        branch: { select: { id: true, name: true, townCity: true } },
      },
    });

    if (!vacancy) return null;

    return {
      ...vacancy,
      minSalary: vacancy.showSalaryPublicly ? vacancy.minSalary : null,
      maxSalary: vacancy.showSalaryPublicly ? vacancy.maxSalary : null,
    };
  }
}
