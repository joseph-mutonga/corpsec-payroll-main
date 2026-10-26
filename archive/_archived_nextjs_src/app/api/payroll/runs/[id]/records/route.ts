import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { apiSuccess, apiError } from '@/lib/response';
import { requireAuth } from '@/lib/permissions';

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireAuth(req, ['payroll.view']);
    if (auth.error) return auth.error;

    const { searchParams } = new URL(req.url);
    const search = searchParams.get('search') || '';
    const departmentId = searchParams.get('departmentId');
    const branchId = searchParams.get('branchId');
    const stationId = searchParams.get('stationId');
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
    const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get('pageSize') || '50')));

    const where: any = {
      payrollRunId: params.id,
    };

    if (departmentId) {
      where.employee = { departmentId };
    }
    if (branchId) {
      where.employee = { ...(where.employee || {}), branchId };
    }
    if (stationId) {
      where.employee = { ...(where.employee || {}), stationId };
    }

    if (search.trim()) {
      where.OR = [
        { employee: { fullName: { contains: search } } },
        { employee: { employeeNumber: { contains: search } } },
        { employee: { kraPin: { contains: search } } },
        { jobTitle: { contains: search } },
      ];
    }

    const [total, records] = await Promise.all([
      prisma.payrollEmployeeRecord.count({ where }),
      prisma.payrollEmployeeRecord.findMany({
        where,
        include: {
          employee: {
            select: {
              id: true,
              employeeNumber: true,
              fullName: true,
              jobTitle: true,
              gender: true,
              department: { select: { id: true, name: true, code: true } },
              branch: { select: { id: true, name: true, code: true } },
              station: { select: { id: true, name: true, code: true } },
            },
          },
        },
        orderBy: { employee: { employeeNumber: 'asc' } },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return apiSuccess(records, {
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    });
  } catch (err: any) {
    return apiError(err.message || 'Failed to fetch payroll employee records', 500);
  }
}
