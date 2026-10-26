import { db } from '@/lib/db';
import { AuditService } from '@/lib/audit';

export interface CreateCourseInput {
  title: string;
  code?: string;
  description?: string;
  categoryId?: string;
  categoryName?: string;
  skillArea?: string;
  level?: 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED' | 'EXPERT';
  durationHours?: number;
  deliveryMethod?: 'CLASSROOM' | 'ONLINE' | 'HYBRID' | 'PRACTICAL' | 'EXTERNAL';
  provider?: string;
  defaultTrainerId?: string;
  assessmentRequired?: boolean;
  passMark?: number;
  certificateIssued?: boolean;
  validityMonths?: number | null;
  isMandatory?: boolean;
  targetDepartmentId?: string;
  targetPositionId?: string;
  estimatedCostPerPerson?: number;
  status?: 'DRAFT' | 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';
  createdById?: string;
}

export class CourseService {
  static async seedDefaultCategories() {
    const defaults = [
      { name: 'Security & Guarding', code: 'SEC', icon: 'Shield', description: 'Core guarding, patrol tactics, access control, and radio protocols' },
      { name: 'Safety & First Aid', code: 'SAF', icon: 'HeartPulse', description: 'Occupational safety, OSH act, CPR, basic & advanced first aid' },
      { name: 'Leadership & Supervision', code: 'LEAD', icon: 'Award', description: 'Field supervision, shift leadership, incident management' },
      { name: 'Customer Service & Escort', code: 'CUST', icon: 'Users', description: 'VIP protection, client communications, diplomatic conduct' },
      { name: 'Compliance & Legal', code: 'COMP', icon: 'FileText', description: 'Private security regulatory authority (PSRA), labor law, human rights' },
      { name: 'Technology & CCTV', code: 'TECH', icon: 'Monitor', description: 'Surveillance systems, biometric access controllers, alarm response rigs' },
      { name: 'Firearms & Tactical', code: 'TACT', icon: 'Crosshair', description: 'Tactical apprehension, non-lethal defense, firearm safety' },
      { name: 'Professional Development', code: 'PROF', icon: 'GraduationCap', description: 'Report writing, evidence handling, ethics and integrity' },
    ];

    for (const item of defaults) {
      const existing = await db.courseCategory.findFirst({
        where: { OR: [{ code: item.code }, { name: item.name }] },
      });
      if (!existing) {
        await db.courseCategory.create({ data: item });
      }
    }
  }

  static async listCategories(includeInactive = false) {
    await this.seedDefaultCategories();
    return db.courseCategory.findMany({
      where: includeInactive ? undefined : { isActive: true },
      orderBy: { name: 'asc' },
      include: {
        _count: {
          select: { courses: true },
        },
      },
    });
  }

  static async createCategory(data: { name: string; code: string; description?: string; icon?: string }) {
    const code = data.code.trim().toUpperCase();
    const existing = await db.courseCategory.findFirst({
      where: { OR: [{ code }, { name: data.name.trim() }] },
    });
    if (existing) {
      throw new Error(`Course category '${data.name}' or code '${code}' already exists.`);
    }

    return db.courseCategory.create({
      data: {
        name: data.name.trim(),
        code,
        description: data.description,
        icon: data.icon || 'Folder',
      },
    });
  }

  static async generateCourseCode(categoryCode?: string): Promise<string> {
    const prefix = categoryCode ? `CRS-${categoryCode.slice(0, 4).toUpperCase()}` : 'CRS-GEN';
    let count = (await db.course.count()) + 1;
    let code = `${prefix}-${String(count).padStart(3, '0')}`;
    while (await db.course.findUnique({ where: { code } })) {
      count++;
      code = `${prefix}-${String(count).padStart(3, '0')}`;
    }
    return code;
  }

  static async createCourse(data: CreateCourseInput) {
    let categoryCode = 'GEN';
    let catName = data.categoryName;
    if (data.categoryId) {
      const cat = await db.courseCategory.findUnique({ where: { id: data.categoryId } });
      if (cat) {
        categoryCode = cat.code;
        catName = cat.name;
      }
    }

    const code = data.code || (await this.generateCourseCode(categoryCode));

    const course = await db.course.create({
      data: {
        code,
        title: data.title,
        description: data.description,
        categoryId: data.categoryId,
        categoryName: catName,
        skillArea: data.skillArea,
        level: data.level || 'INTERMEDIATE',
        durationHours: data.durationHours !== undefined ? Number(data.durationHours) : 8,
        deliveryMethod: data.deliveryMethod || 'CLASSROOM',
        provider: data.provider || 'Internal L&D',
        defaultTrainerId: data.defaultTrainerId,
        assessmentRequired: data.assessmentRequired !== undefined ? data.assessmentRequired : true,
        passMark: data.passMark !== undefined ? Number(data.passMark) : 70.0,
        certificateIssued: data.certificateIssued !== undefined ? data.certificateIssued : true,
        validityMonths: data.validityMonths ? Number(data.validityMonths) : null,
        isMandatory: !!data.isMandatory,
        targetDepartmentId: data.targetDepartmentId,
        targetPositionId: data.targetPositionId,
        estimatedCostPerPerson: data.estimatedCostPerPerson ? Number(data.estimatedCostPerPerson) : 0,
        status: data.status || 'ACTIVE',
        createdById: data.createdById,
      },
      include: {
        category: true,
        defaultTrainer: true,
      },
    });

    await AuditService.log({
      userId: data.createdById,
      action: 'CREATE_TRAINING_COURSE',
      module: 'TRAINING',
      entityId: course.id,
      newValue: { code: course.code, title: course.title, status: course.status },
    });

    return course;
  }

  static async updateCourse(id: string, data: Partial<CreateCourseInput>, userId?: string) {
    const existing = await db.course.findUnique({ where: { id } });
    if (!existing) throw new Error('Course not found.');

    let catName = data.categoryName;
    if (data.categoryId) {
      const cat = await db.courseCategory.findUnique({ where: { id: data.categoryId } });
      if (cat) catName = cat.name;
    }

    const updated = await db.course.update({
      where: { id },
      data: {
        title: data.title !== undefined ? data.title : existing.title,
        description: data.description !== undefined ? data.description : existing.description,
        categoryId: data.categoryId !== undefined ? data.categoryId : existing.categoryId,
        categoryName: catName !== undefined ? catName : existing.categoryName,
        skillArea: data.skillArea !== undefined ? data.skillArea : existing.skillArea,
        level: data.level || existing.level,
        durationHours: data.durationHours !== undefined ? Number(data.durationHours) : existing.durationHours,
        deliveryMethod: data.deliveryMethod || existing.deliveryMethod,
        provider: data.provider || existing.provider,
        defaultTrainerId: data.defaultTrainerId !== undefined ? data.defaultTrainerId : existing.defaultTrainerId,
        assessmentRequired: data.assessmentRequired !== undefined ? data.assessmentRequired : existing.assessmentRequired,
        passMark: data.passMark !== undefined ? Number(data.passMark) : existing.passMark,
        certificateIssued: data.certificateIssued !== undefined ? data.certificateIssued : existing.certificateIssued,
        validityMonths: data.validityMonths !== undefined ? (data.validityMonths ? Number(data.validityMonths) : null) : existing.validityMonths,
        isMandatory: data.isMandatory !== undefined ? data.isMandatory : existing.isMandatory,
        targetDepartmentId: data.targetDepartmentId !== undefined ? data.targetDepartmentId : existing.targetDepartmentId,
        targetPositionId: data.targetPositionId !== undefined ? data.targetPositionId : existing.targetPositionId,
        estimatedCostPerPerson: data.estimatedCostPerPerson !== undefined ? Number(data.estimatedCostPerPerson) : existing.estimatedCostPerPerson,
        status: data.status || existing.status,
      },
      include: {
        category: true,
        defaultTrainer: true,
      },
    });

    await AuditService.log({
      userId,
      action: 'UPDATE_TRAINING_COURSE',
      module: 'TRAINING',
      entityId: id,
      previousValue: { title: existing.title, status: existing.status },
      newValue: { title: updated.title, status: updated.status },
    });

    return updated;
  }

  static async getCourseById(id: string) {
    const course = await db.course.findUnique({
      where: { id },
      include: {
        category: true,
        defaultTrainer: {
          include: {
            employee: {
              select: { id: true, fullName: true, employeeNumber: true, jobTitle: true },
            },
          },
        },
        sessions: {
          orderBy: { startDate: 'desc' },
          include: {
            trainer: true,
            venue: true,
            _count: { select: { enrollments: true } },
          },
        },
        _count: {
          select: { enrollments: true, certificates: true, skills: true },
        },
      },
    });
    if (!course) throw new Error('Course not found.');
    return course;
  }

  static async listCourses(filters: {
    search?: string;
    categoryId?: string;
    level?: string;
    deliveryMethod?: string;
    isMandatory?: boolean;
    status?: string;
    includeArchived?: boolean;
  }) {
    const where: any = {};

    if (filters.status && filters.status !== 'ALL') {
      where.status = filters.status;
    } else if (!filters.includeArchived) {
      where.status = { not: 'ARCHIVED' };
    }

    if (filters.categoryId && filters.categoryId !== 'ALL') {
      where.categoryId = filters.categoryId;
    }

    if (filters.level && filters.level !== 'ALL') {
      where.level = filters.level;
    }

    if (filters.deliveryMethod && filters.deliveryMethod !== 'ALL') {
      where.deliveryMethod = filters.deliveryMethod;
    }

    if (filters.isMandatory !== undefined) {
      where.isMandatory = filters.isMandatory;
    }

    if (filters.search) {
      const q = filters.search.trim();
      where.OR = [
        { code: { contains: q } },
        { title: { contains: q } },
        { description: { contains: q } },
        { skillArea: { contains: q } },
        { provider: { contains: q } },
      ];
    }

    return db.course.findMany({
      where,
      orderBy: [{ isMandatory: 'desc' }, { createdAt: 'desc' }],
      include: {
        category: true,
        defaultTrainer: true,
        _count: {
          select: {
            sessions: true,
            enrollments: true,
            certificates: true,
          },
        },
      },
    });
  }

  static async archiveCourse(id: string, userId?: string) {
    const course = await db.course.update({
      where: { id },
      data: { status: 'ARCHIVED' },
    });

    await AuditService.log({
      userId,
      action: 'ARCHIVE_TRAINING_COURSE',
      module: 'TRAINING',
      entityId: id,
      newValue: { status: 'ARCHIVED' },
    });

    return course;
  }
}
