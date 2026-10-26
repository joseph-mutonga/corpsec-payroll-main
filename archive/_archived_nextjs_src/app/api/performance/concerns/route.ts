import { NextRequest } from 'next/server';
import { requireAuth } from '@/lib/permissions';
import { apiSuccess, apiError } from '@/lib/response';
import { db } from '@/lib/db';

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth();
    if ('errorResponse' in auth) return auth.errorResponse;

    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status') || undefined;
    const employeeId = searchParams.get('employeeId') || undefined;

    const currentEmp = await db.employee.findFirst({ where: { userId: auth.user.id } });
    const isHrAdmin =
      auth.session.roles.includes('hr_admin') ||
      auth.session.roles.includes('hr_manager') ||
      auth.session.roles.includes('super_admin');

    const where: any = {};
    if (status && status !== 'ALL') where.status = status;

    if (!isHrAdmin && auth.session.roles.includes('employee')) {
      if (currentEmp) where.employeeId = currentEmp.id;
    } else if (employeeId) {
      where.employeeId = employeeId;
    }

    const concerns = await db.performanceConcern.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        employee: {
          select: {
            id: true,
            employeeNumber: true,
            fullName: true,
            jobTitle: true,
            department: { select: { id: true, name: true } },
          },
        },
        review: {
          select: {
            id: true,
            reviewNumber: true,
            overallScore: true,
            overallRating: true,
            cycle: { select: { name: true } },
          },
        },
        resolvedBy: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    // Privacy scrub: Hide internalHrNotes for standard employees
    const sanitized = concerns.map((c) => {
      if (!isHrAdmin) {
        return { ...c, internalHrNotes: null };
      }
      return c;
    });

    return apiSuccess({ concerns: sanitized });
  } catch (error: any) {
    console.error('Error listing performance concerns:', error);
    return apiError(error.message || 'Failed to list performance concerns', 500);
  }
}
