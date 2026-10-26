import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requirePermission } from '@/lib/permissions';
import { apiError, apiSuccess } from '@/lib/response';

export async function GET(req: NextRequest) {
  try {
    const auth = await requirePermission('audit.view');
    if ('errorResponse' in auth) return auth.errorResponse;

    const { searchParams } = new URL(req.url);
    const moduleFilter = searchParams.get('module');
    const actionFilter = searchParams.get('action');
    const search = searchParams.get('search');
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const pageSize = Math.min(100, Math.max(5, parseInt(searchParams.get('pageSize') || '20', 10)));

    const where: any = {};

    if (moduleFilter && moduleFilter !== 'ALL') {
      where.module = moduleFilter.toUpperCase();
    }

    if (actionFilter && actionFilter !== 'ALL') {
      where.action = actionFilter.toUpperCase();
    }

    if (search) {
      where.OR = [
        { userEmail: { contains: search } },
        { action: { contains: search } },
        { module: { contains: search } },
        { entityType: { contains: search } },
        { entityId: { contains: search } },
      ];
    }

    const [total, logs] = await Promise.all([
      db.auditLog.count({ where }),
      db.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          user: {
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

    return apiSuccess(logs, {
      total,
      page,
      pageSize,
    });
  } catch (error) {
    console.error('Fetch audit logs error:', error);
    return apiError('Failed to fetch audit logs.');
  }
}
