import { db } from '@/lib/db';

export class RecruitmentAnalyticsService {
  static async getDashboardStats() {
    const now = new Date();
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay());
    startOfWeek.setHours(0, 0, 0, 0);

    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [
      openVacancies,
      draftVacancies,
      totalApplications,
      applicationsThisWeek,
      screeningCount,
      shortlistedCount,
      interviewsScheduled,
      offersPending,
      offersAccepted,
      hiresThisMonth,
    ] = await Promise.all([
      db.vacancy.count({ where: { status: 'OPEN' } }),
      db.vacancy.count({ where: { status: 'DRAFT' } }),
      db.candidate.count(),
      db.candidate.count({ where: { createdAt: { gte: startOfWeek } } }),
      db.candidate.count({ where: { currentStage: 'SCREENING' } }),
      db.candidate.count({ where: { currentStage: 'SHORTLISTED' } }),
      db.interview.count({ where: { status: 'SCHEDULED' } }),
      db.jobOffer.count({ where: { status: { in: ['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'SENT'] } } }),
      db.jobOffer.count({ where: { status: 'ACCEPTED' } }),
      db.candidate.count({ where: { currentStage: 'HIRED', convertedAt: { gte: startOfMonth } } }),
    ]);

    // Recruitment funnel data
    const [applied, screening, shortlisted, interview, assessment, offer, hired, rejected] =
      await Promise.all([
        db.candidate.count({ where: { currentStage: 'APPLIED' } }),
        db.candidate.count({ where: { currentStage: 'SCREENING' } }),
        db.candidate.count({ where: { currentStage: 'SHORTLISTED' } }),
        db.candidate.count({ where: { currentStage: 'INTERVIEW' } }),
        db.candidate.count({ where: { currentStage: 'ASSESSMENT' } }),
        db.candidate.count({ where: { currentStage: 'OFFER' } }),
        db.candidate.count({ where: { currentStage: 'HIRED' } }),
        db.candidate.count({ where: { currentStage: 'REJECTED' } }),
      ]);

    const funnel = [
      { stage: 'Applied', count: applied, color: 'text-blue-600 bg-blue-50 border-blue-200' },
      { stage: 'Screening', count: screening, color: 'text-amber-600 bg-amber-50 border-amber-200' },
      { stage: 'Shortlisted', count: shortlisted, color: 'text-indigo-600 bg-indigo-50 border-indigo-200' },
      { stage: 'Interview', count: interview, color: 'text-purple-600 bg-purple-50 border-purple-200' },
      { stage: 'Assessment', count: assessment, color: 'text-teal-600 bg-teal-50 border-teal-200' },
      { stage: 'Offer', count: offer, color: 'text-orange-600 bg-orange-50 border-orange-200' },
      { stage: 'Hired', count: hired, color: 'text-emerald-600 bg-emerald-50 border-emerald-200' },
      { stage: 'Rejected', count: rejected, color: 'text-rose-600 bg-rose-50 border-rose-200' },
    ];

    const recentApplications = await db.candidate.findMany({
      take: 6,
      orderBy: { createdAt: 'desc' },
      include: {
        vacancy: { select: { title: true, vacancyNumber: true } },
      },
    });

    const activeVacancies = await db.vacancy.findMany({
      where: { status: 'OPEN' },
      take: 5,
      orderBy: { publishedAt: 'desc' },
      include: {
        department: { select: { name: true } },
        _count: { select: { candidates: true } },
      },
    });

    return {
      kpis: {
        openVacancies,
        draftVacancies,
        totalApplications,
        applicationsThisWeek,
        screeningCount,
        shortlistedCount,
        interviewsScheduled,
        offersPending,
        offersAccepted,
        hiresThisMonth,
      },
      funnel,
      recentApplications,
      activeVacancies,
    };
  }

  static async getRecruitmentReports(filters?: {
    startDate?: Date;
    endDate?: Date;
    departmentId?: string;
    stationId?: string;
  }) {
    const whereVacancy: any = {};
    if (filters?.departmentId && filters.departmentId !== 'ALL') whereVacancy.departmentId = filters.departmentId;
    if (filters?.stationId && filters.stationId !== 'ALL') whereVacancy.stationId = filters.stationId;

    const vacancies = await db.vacancy.findMany({
      where: whereVacancy,
      include: {
        department: { select: { name: true } },
        station: { select: { name: true } },
        candidates: {
          select: {
            id: true,
            currentStage: true,
            source: true,
            createdAt: true,
            convertedAt: true,
          },
        },
        jobOffers: {
          select: { id: true, status: true },
        },
      },
    });

    // Vacancy Performance Metrics
    const vacancyPerformance = vacancies.map((v) => {
      const totalCandidates = v.candidates.length;
      const shortlisted = v.candidates.filter((c) =>
        ['SHORTLISTED', 'INTERVIEW', 'ASSESSMENT', 'OFFER', 'HIRED'].includes(c.currentStage)
      ).length;
      const interviews = v.candidates.filter((c) =>
        ['INTERVIEW', 'ASSESSMENT', 'OFFER', 'HIRED'].includes(c.currentStage)
      ).length;
      const offers = v.jobOffers.length;
      const hires = v.candidates.filter((c) => c.currentStage === 'HIRED').length;

      return {
        id: v.id,
        vacancyNumber: v.vacancyNumber,
        title: v.title,
        department: v.department.name,
        station: v.station?.name || 'All Stations',
        openingsCount: v.openingsCount,
        status: v.status,
        applications: totalCandidates,
        shortlisted,
        interviews,
        offers,
        hires,
        fillRate: v.openingsCount > 0 ? Number(((hires / v.openingsCount) * 100).toFixed(1)) : 0,
      };
    });

    // Source Analysis
    const candidates = await db.candidate.findMany({
      select: { source: true, currentStage: true },
    });

    const sourceStats: Record<string, { total: number; hired: number }> = {};
    for (const c of candidates) {
      const src = c.source || 'CAREERS_PAGE';
      if (!sourceStats[src]) sourceStats[src] = { total: 0, hired: 0 };
      sourceStats[src].total += 1;
      if (c.currentStage === 'HIRED') sourceStats[src].hired += 1;
    }

    const sourceAnalysis = Object.entries(sourceStats).map(([source, data]) => ({
      source,
      total: data.total,
      hired: data.hired,
      conversionRate: data.total > 0 ? Number(((data.hired / data.total) * 100).toFixed(1)) : 0,
    }));

    // Time to Hire Estimation (Average days between application and conversion)
    const hiredCandidates = await db.candidate.findMany({
      where: { currentStage: 'HIRED', convertedAt: { not: null } },
      select: { createdAt: true, convertedAt: true },
    });

    let totalDays = 0;
    let validHiresCount = 0;
    for (const hc of hiredCandidates) {
      if (hc.convertedAt) {
        const diffMs = hc.convertedAt.getTime() - hc.createdAt.getTime();
        const diffDays = Math.max(1, Math.round(diffMs / (1000 * 60 * 60 * 24)));
        totalDays += diffDays;
        validHiresCount += 1;
      }
    }

    const avgDaysToHire = validHiresCount > 0 ? Math.round(totalDays / validHiresCount) : 14;

    return {
      vacancyPerformance,
      sourceAnalysis,
      avgDaysToHire,
      totalHires: validHiresCount,
    };
  }
}
