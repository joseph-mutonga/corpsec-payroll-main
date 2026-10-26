import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/permissions';
import { apiSuccess, apiError, apiForbidden } from '@/lib/response';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(['hr_request.view', 'hr_request.manage']);
    if ('errorResponse' in auth) {
      return auth.errorResponse;
    }

    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search')?.trim() || '';
    const requestType = searchParams.get('requestType');
    const status = searchParams.get('status');
    const priority = searchParams.get('priority');
    const departmentId = searchParams.get('departmentId');
    const stationId = searchParams.get('stationId');
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get('pageSize') || '25', 10)));

    const where: any = {};

    if (requestType && requestType !== 'ALL') {
      where.requestType = requestType;
    }
    if (status && status !== 'ALL') {
      where.status = status;
    }
    if (priority && priority !== 'ALL') {
      where.priority = priority;
    }
    if (departmentId && departmentId !== 'ALL') {
      where.employee = { ...where.employee, departmentId };
    }
    if (stationId && stationId !== 'ALL') {
      where.employee = { ...where.employee, stationId };
    }

    if (search) {
      where.OR = [
        { requestNumber: { contains: search } },
        { subject: { contains: search } },
        { description: { contains: search } },
        { employee: { fullName: { contains: search } } },
        { employee: { employeeNumber: { contains: search } } },
      ];
    }

    const [total, items] = await Promise.all([
      db.hRRequest.count({ where }),
      db.hRRequest.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          employee: {
            select: {
              id: true,
              employeeNumber: true,
              fullName: true,
              jobTitle: true,
              department: { select: { id: true, name: true } },
              station: { select: { id: true, name: true } },
            },
          },
          assignedTo: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
          reviewedBy: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
        },
      }),
    ]);

    // KPI counts
    const [totalPending, totalUnderReview, totalApproved, totalResolved] = await Promise.all([
      db.hRRequest.count({ where: { status: 'SUBMITTED' } }),
      db.hRRequest.count({ where: { status: 'UNDER_REVIEW' } }),
      db.hRRequest.count({ where: { status: 'APPROVED' } }),
      db.hRRequest.count({ where: { status: 'RESOLVED' } }),
    ]);

    return apiSuccess({
      items,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
      stats: {
        totalSubmitted: totalPending,
        totalUnderReview,
        totalApproved,
        totalResolved,
      },
    });
  } catch (error: any) {
    console.error('Error fetching HR requests management list:', error);
    return apiError(error.message || 'Failed to load HR requests');
  }
}
