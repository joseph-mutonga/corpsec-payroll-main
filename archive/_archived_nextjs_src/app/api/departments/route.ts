import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requirePermission } from '@/lib/permissions';
import { departmentSchema } from '@/lib/validation';
import { apiError, apiSuccess, apiValidationError } from '@/lib/response';
import { createAuditLog } from '@/lib/audit';

export async function GET(req: NextRequest) {
  try {
    const auth = await requirePermission('departments.view');
    if ('errorResponse' in auth) return auth.errorResponse;

    const { searchParams } = new URL(req.url);
    const search = searchParams.get('search');
    const status = searchParams.get('status');
    const branchId = searchParams.get('branchId');

    const where: any = { deletedAt: null };

    if (status === 'ACTIVE') where.isActive = true;
    if (status === 'INACTIVE') where.isActive = false;

    if (branchId && branchId !== 'ALL') {
      where.branchId = branchId;
    }

    if (search) {
      where.OR = [
        { code: { contains: search } },
        { name: { contains: search } },
        { description: { contains: search } },
      ];
    }

    const departments = await db.department.findMany({
      where,
      orderBy: { code: 'asc' },
      include: {
        branch: { select: { id: true, name: true, code: true } },
        departmentHead: {
          select: {
            id: true,
            employeeNumber: true,
            fullName: true,
            jobTitle: true,
          },
        },
        positions: {
          where: { deletedAt: null },
          select: { id: true, code: true, title: true, isActive: true },
        },
        _count: {
          select: {
            employees: { where: { deletedAt: null, isArchived: false } },
            positions: { where: { deletedAt: null } },
          },
        },
      },
    });

    return apiSuccess(departments);
  } catch (error) {
    console.error('Fetch departments error:', error);
    return apiError('Failed to fetch departments.');
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requirePermission('departments.create');
    if ('errorResponse' in auth) return auth.errorResponse;

    const body = await req.json();
    const validation = departmentSchema.safeParse(body);

    if (!validation.success) {
      return apiValidationError(validation.error.flatten().fieldErrors);
    }

    const data = validation.data;

    const existing = await db.department.findUnique({
      where: { code: data.code },
    });

    if (existing) {
      return apiError(`A department with code "${data.code}" already exists.`, 'DUPLICATE_CODE', 400);
    }

    const department = await db.department.create({
      data: {
        code: data.code,
        name: data.name,
        description: data.description || null,
        branchId: data.branchId || null,
        departmentHeadId: data.departmentHeadId || null,
        isActive: data.isActive,
      },
      include: {
        branch: { select: { id: true, name: true, code: true } },
        departmentHead: {
          select: {
            id: true,
            employeeNumber: true,
            fullName: true,
            jobTitle: true,
          },
        },
      },
    });

    await createAuditLog({
      userId: auth.session.userId,
      userEmail: auth.session.email,
      action: 'CREATE_DEPARTMENT',
      module: 'ORGANIZATION',
      entityType: 'DEPARTMENT',
      entityId: department.id,
      newValue: {
        code: department.code,
        name: department.name,
        isActive: department.isActive,
      },
    });

    return apiSuccess(department, undefined, 201);
  } catch (error) {
    console.error('Create department error:', error);
    return apiError('Failed to create department.');
  }
}
