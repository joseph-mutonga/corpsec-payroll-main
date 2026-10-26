import { NextRequest } from 'next/server';
import { requireAuth } from '@/lib/permissions';
import { db } from '@/lib/db';
import { apiError, apiSuccess } from '@/lib/response';

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth('recruitment.view');
    if ('errorResponse' in auth) return auth.errorResponse;

    const { searchParams } = new URL(req.url);
    const vacancyId = searchParams.get('vacancyId') || undefined;

    const where: any = {};
    if (vacancyId && vacancyId !== 'ALL') where.vacancyId = vacancyId;

    const candidates = await db.candidate.findMany({
      where,
      include: {
        vacancy: { select: { id: true, title: true, vacancyNumber: true } },
        assignedRecruiter: { select: { id: true, firstName: true, lastName: true } },
        interviews: {
          select: { id: true, scheduledDate: true, startTime: true, status: true },
          orderBy: { scheduledDate: 'desc' },
          take: 1,
        },
        offers: {
          select: { id: true, status: true, proposedSalary: true },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
      orderBy: { updatedAt: 'desc' },
    });

    const pipelineStages = [
      'APPLIED',
      'SCREENING',
      'SHORTLISTED',
      'INTERVIEW',
      'ASSESSMENT',
      'OFFER',
      'HIRED',
      'REJECTED',
    ];

    const columns: Record<string, typeof candidates> = {};
    for (const st of pipelineStages) {
      columns[st] = candidates.filter((c) => c.currentStage === st);
    }

    return apiSuccess({
      columns,
      totalCount: candidates.length,
      stages: pipelineStages,
    });
  } catch (error: any) {
    console.error('Error fetching pipeline candidates:', error);
    return apiError(error.message || 'Failed to fetch pipeline');
  }
}
