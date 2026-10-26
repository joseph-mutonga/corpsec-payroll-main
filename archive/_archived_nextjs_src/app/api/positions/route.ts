import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requirePermission } from '@/lib/permissions';
import { positionSchema } from '@/lib/validation';
import { apiError, apiSuccess, apiValidationError } from '@/lib/response';
import { createAuditLog } from '@/lib/audit';

export async function GET(req: NextRequest) {
  try {
    const auth = await requirePermission('positions.view');
    if ('errorResponse' in auth) return auth.errorResponse;

    const { searchParams } = new URL(req.url);
    const search = searchParams.get('search');
    const status = searchParams.get('status');
    const departmentId = searchParams.get('departmentId');
    const category = searchParams.get('category');

    const where: any = { deletedAt: null };

    if (status === 'ACTIVE') where.isActive = true;
    if (status === 'INACTIVE') where.isActive = false;

    if (departmentId && departmentId !== 'ALL') {
      where.departmentId = departmentId;
    }

    if (category && category !== 'ALL') {
      where.employmentCategory = category;
    }

    if (search) {
      where.OR = [
        { code: { contains: search } },
        { title: { contains: search } },
        { description: { contains: search } },
      ];
    }

    const positions = await db.position.findMany({
      where,
      orderBy: { code: 'asc' },
      include: {
        department: { select: { id: true, name: true, code: true } },
        _count: {
          select: {
            employees: { where: { deletedAt: null, isArchived: false, employmentStatus: 'ACTIVE' } },
          },
        },
      },
    });

    return apiSuccess(positions);
  } catch (error) {
    console.error('Fetch positions error:', error);
    return apiError('Failed to fetch job positions.');
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requirePermission('positions.create');
    if ('errorResponse' in auth) return auth.errorResponse;

    const body = await req.json();
    const validation = positionSchema.safeParse(body);

    if (!validation.success) {
      return apiValidationError(validation.error.flatten().fieldErrors);
    }

    const data = validation.data;

    const existing = await db.position.findUnique({
      where: { code: data.code },
    });

    if (existing) {
      return apiError(`A position with code "${data.code}" already exists.`, 'DUPLICATE_CODE', 400);
    }

    const position = await db.position.create({
      data: {
        code: data.code,
        title: data.title,
        description: data.description || null,
        departmentId: data.departmentId,
        employmentCategory: data.employmentCategory,
        isActive: data.isActive,
      },
      include: {
        department: { select: { id: true, name: true, code: true } },
      },
    });

    await createAuditLog({
      userId: auth.session.userId,
      userEmail: auth.session.email,
      action: 'CREATE_POSITION',
      module: 'ORGANIZATION',
      entityType: 'POSITION',
      entityId: position.id,
      newValue: {
        code: position.code,
        title: position.title,
        departmentId: position.departmentId,
      },
    });

    return apiSuccess(position, undefined, 201);
  } catch (error) {
    console.error('Create position error:', error);
    return apiError('Failed to create job position.');
  }
}
