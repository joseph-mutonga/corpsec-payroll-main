import { db } from '@/lib/db';
import { AuditService } from '@/lib/audit';

export interface RecordSkillInput {
  employeeId: string;
  skillName: string;
  level: 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED' | 'EXPERT';
  source?: 'TRAINING_COMPLETION' | 'PRIOR_EXPERIENCE' | 'PERFORMANCE_REVIEW' | 'ASSESSMENT';
  courseId?: string;
  certificateId?: string;
  expiryDate?: Date;
  isVerified?: boolean;
  userId?: string;
}

export class SkillService {
  static async recordSkill(data: RecordSkillInput) {
    const skillName = data.skillName.trim();

    const skill = await db.employeeSkill.upsert({
      where: {
        employeeId_skillName: {
          employeeId: data.employeeId,
          skillName,
        },
      },
      create: {
        employeeId: data.employeeId,
        skillName,
        level: data.level || 'INTERMEDIATE',
        source: data.source || 'TRAINING_COMPLETION',
        courseId: data.courseId,
        certificateId: data.certificateId,
        expiryDate: data.expiryDate ? new Date(data.expiryDate) : undefined,
        isVerified: data.isVerified !== undefined ? data.isVerified : true,
        dateAcquired: new Date(),
        lastAssessedDate: new Date(),
      },
      update: {
        level: data.level || 'INTERMEDIATE',
        source: data.source || 'TRAINING_COMPLETION',
        courseId: data.courseId,
        certificateId: data.certificateId,
        expiryDate: data.expiryDate ? new Date(data.expiryDate) : undefined,
        isVerified: data.isVerified !== undefined ? data.isVerified : true,
        lastAssessedDate: new Date(),
      },
      include: {
        course: true,
        certificate: true,
      },
    });

    await AuditService.log({
      userId: data.userId,
      action: 'UPDATE_EMPLOYEE_SKILL',
      module: 'TRAINING',
      entityId: skill.id,
      newValue: {
        skillName: skill.skillName,
        level: skill.level,
        source: skill.source,
      },
    });

    return skill;
  }

  static async listEmployeeSkills(employeeId: string) {
    return db.employeeSkill.findMany({
      where: { employeeId },
      orderBy: { dateAcquired: 'desc' },
      include: {
        course: { select: { id: true, code: true, title: true } },
        certificate: { select: { id: true, certificateNumber: true, status: true, expiryDate: true } },
      },
    });
  }

  static async updateSkillLevel(
    id: string,
    level: 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED' | 'EXPERT',
    userId?: string
  ) {
    const existing = await db.employeeSkill.findUnique({ where: { id } });
    if (!existing) throw new Error('Employee skill record not found.');

    const updated = await db.employeeSkill.update({
      where: { id },
      data: {
        level,
        lastAssessedDate: new Date(),
      },
    });

    await AuditService.log({
      userId,
      action: 'CHANGE_SKILL_LEVEL',
      module: 'TRAINING',
      entityId: id,
      previousValue: { level: existing.level },
      newValue: { level: updated.level },
    });

    return updated;
  }
}
