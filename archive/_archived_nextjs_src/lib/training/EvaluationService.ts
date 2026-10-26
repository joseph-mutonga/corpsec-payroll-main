import { db } from '@/lib/db';
import { AuditService } from '@/lib/audit';

export interface SubmitEvaluationInput {
  enrollmentId: string;
  relevanceRating?: number;
  trainerRating?: number;
  materialsRating?: number;
  venueRating?: number;
  deliveryRating?: number;
  usefulnessRating?: number;
  comments?: string;
  recommendations?: string;
}

export class EvaluationService {
  static async submitEvaluation(data: SubmitEvaluationInput) {
    const enrollment = await db.trainingEnrollment.findUnique({
      where: { id: data.enrollmentId },
      include: { session: true },
    });
    if (!enrollment) throw new Error('Training enrollment record not found.');

    const relevance = Math.min(5, Math.max(1, Number(data.relevanceRating || 5)));
    const trainer = Math.min(5, Math.max(1, Number(data.trainerRating || 5)));
    const materials = Math.min(5, Math.max(1, Number(data.materialsRating || 5)));
    const venue = Math.min(5, Math.max(1, Number(data.venueRating || 5)));
    const delivery = Math.min(5, Math.max(1, Number(data.deliveryRating || 5)));
    const usefulness = Math.min(5, Math.max(1, Number(data.usefulnessRating || 5)));

    const overall =
      Math.round(((relevance + trainer + materials + venue + delivery + usefulness) / 6) * 10) / 10;

    const evaluation = await db.trainingEvaluation.upsert({
      where: { enrollmentId: data.enrollmentId },
      create: {
        enrollmentId: data.enrollmentId,
        sessionId: enrollment.sessionId,
        employeeId: enrollment.employeeId,
        relevanceRating: relevance,
        trainerRating: trainer,
        materialsRating: materials,
        venueRating: venue,
        deliveryRating: delivery,
        usefulnessRating: usefulness,
        overallRating: overall,
        comments: data.comments,
        recommendations: data.recommendations,
      },
      update: {
        relevanceRating: relevance,
        trainerRating: trainer,
        materialsRating: materials,
        venueRating: venue,
        deliveryRating: delivery,
        usefulnessRating: usefulness,
        overallRating: overall,
        comments: data.comments,
        recommendations: data.recommendations,
        submittedAt: new Date(),
      },
    });

    await AuditService.log({
      userId: enrollment.employeeId,
      action: 'SUBMIT_TRAINING_EVALUATION',
      module: 'TRAINING',
      entityId: evaluation.id,
      newValue: {
        enrollmentId: data.enrollmentId,
        overallRating: overall,
      },
    });

    return evaluation;
  }

  static async listEvaluations(filters: { sessionId?: string; courseId?: string }) {
    const where: any = {};
    if (filters.sessionId && filters.sessionId !== 'ALL') where.sessionId = filters.sessionId;
    if (filters.courseId && filters.courseId !== 'ALL') {
      where.session = { courseId: filters.courseId };
    }

    return db.trainingEvaluation.findMany({
      where,
      orderBy: { submittedAt: 'desc' },
      include: {
        session: {
          include: {
            course: { select: { id: true, code: true, title: true } },
            trainer: { select: { id: true, name: true } },
          },
        },
        employee: {
          select: {
            id: true,
            employeeNumber: true,
            fullName: true,
            department: { select: { id: true, name: true } },
          },
        },
      },
    });
  }
}
