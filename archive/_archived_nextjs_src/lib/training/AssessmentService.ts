import { db } from '@/lib/db';
import { AuditService } from '@/lib/audit';

export interface RecordAssessmentInput {
  enrollmentId: string;
  sessionId: string;
  courseId?: string;
  employeeId: string;
  assessmentType: 'PRE_TRAINING' | 'POST_TRAINING' | 'PRACTICAL' | 'KNOWLEDGE_TEST' | 'TRAINER_EVALUATION';
  obtainedMarks: number;
  maxMarks?: number;
  passMark?: number;
  evaluatorId?: string;
  evaluatorComments?: string;
}

export class AssessmentService {
  static async generateAssessmentNumber(): Promise<string> {
    const year = new Date().getFullYear();
    let count = (await db.trainingAssessment.count()) + 1;
    let assessmentNumber = `ASM-${year}-${String(count).padStart(4, '0')}`;
    while (await db.trainingAssessment.findUnique({ where: { assessmentNumber } })) {
      count++;
      assessmentNumber = `ASM-${year}-${String(count).padStart(4, '0')}`;
    }
    return assessmentNumber;
  }

  static calculateScore(obtainedMarks: number, maxMarks: number = 100, passMark: number = 70) {
    if (maxMarks <= 0) throw new Error('Maximum marks must be greater than 0.');
    if (obtainedMarks < 0) throw new Error('Obtained marks cannot be negative.');

    const percentage = Math.round((obtainedMarks / maxMarks) * 100 * 100) / 100;
    const result: 'PASS' | 'FAIL' = percentage >= passMark ? 'PASS' : 'FAIL';

    return {
      obtainedMarks,
      maxMarks,
      scorePercentage: percentage,
      passMark,
      result,
    };
  }

  static async recordAssessment(data: RecordAssessmentInput) {
    const enrollment = await db.trainingEnrollment.findUnique({
      where: { id: data.enrollmentId },
      include: { course: true, employee: true },
    });
    if (!enrollment) throw new Error('Training enrollment record not found.');

    const courseId = data.courseId || enrollment.courseId;
    const passMark = data.passMark !== undefined ? Number(data.passMark) : enrollment.course.passMark || 70.0;
    const maxMarks = data.maxMarks !== undefined ? Number(data.maxMarks) : 100.0;
    const obtainedMarks = Number(data.obtainedMarks);

    const calc = this.calculateScore(obtainedMarks, maxMarks, passMark);
    const assessmentNumber = await this.generateAssessmentNumber();

    const assessment = await db.trainingAssessment.create({
      data: {
        assessmentNumber,
        enrollmentId: data.enrollmentId,
        sessionId: data.sessionId,
        courseId,
        employeeId: data.employeeId,
        assessmentType: data.assessmentType || 'POST_TRAINING',
        obtainedMarks: calc.obtainedMarks,
        maxMarks: calc.maxMarks,
        scorePercentage: calc.scorePercentage,
        passMark: calc.passMark,
        result: calc.result,
        evaluatorId: data.evaluatorId,
        evaluatorComments: data.evaluatorComments,
      },
      include: {
        course: true,
        employee: { select: { id: true, fullName: true, employeeNumber: true } },
      },
    });

    // Update enrollment score and result
    await db.trainingEnrollment.update({
      where: { id: data.enrollmentId },
      data: {
        finalScore: calc.scorePercentage,
        finalResult: calc.result,
      },
    });

    await AuditService.log({
      userId: data.evaluatorId,
      action: 'RECORD_TRAINING_ASSESSMENT',
      module: 'TRAINING',
      entityId: assessment.id,
      newValue: {
        assessmentNumber: assessment.assessmentNumber,
        scorePercentage: calc.scorePercentage,
        result: calc.result,
        employee: enrollment.employee.fullName,
      },
    });

    return assessment;
  }

  static async listAssessments(filters: {
    sessionId?: string;
    courseId?: string;
    employeeId?: string;
    result?: string;
    assessmentType?: string;
  }) {
    const where: any = {};
    if (filters.sessionId && filters.sessionId !== 'ALL') where.sessionId = filters.sessionId;
    if (filters.courseId && filters.courseId !== 'ALL') where.courseId = filters.courseId;
    if (filters.employeeId && filters.employeeId !== 'ALL') where.employeeId = filters.employeeId;
    if (filters.result && filters.result !== 'ALL') where.result = filters.result;
    if (filters.assessmentType && filters.assessmentType !== 'ALL') where.assessmentType = filters.assessmentType;

    return db.trainingAssessment.findMany({
      where,
      orderBy: { assessedAt: 'desc' },
      include: {
        course: { select: { id: true, code: true, title: true, passMark: true } },
        session: { select: { id: true, sessionNumber: true, startDate: true } },
        employee: {
          select: {
            id: true,
            employeeNumber: true,
            fullName: true,
            department: { select: { id: true, name: true } },
          },
        },
        evaluator: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    });
  }

  static async getAssessmentById(id: string) {
    const assessment = await db.trainingAssessment.findUnique({
      where: { id },
      include: {
        course: true,
        session: true,
        employee: {
          select: { id: true, employeeNumber: true, fullName: true, department: true, position: true },
        },
        evaluator: { select: { id: true, firstName: true, lastName: true, email: true } },
        enrollment: true,
      },
    });
    if (!assessment) throw new Error('Assessment not found.');
    return assessment;
  }
}
