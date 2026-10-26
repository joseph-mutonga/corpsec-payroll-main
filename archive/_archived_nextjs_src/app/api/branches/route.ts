import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requirePermission } from '@/lib/permissions';
import { branchSchema } from '@/lib/validation';
import { apiError, apiSuccess, apiValidationError } from '@/lib/response';
import { createAuditLog } from '@/lib/audit';

export async function GET(req: NextRequest) {
  try {
    const auth = await requirePermission('branches.view');
    if ('errorResponse' in auth) return auth.errorResponse;

    const { searchParams } = new URL(req.url);
    const search = searchParams.get('search');
    const status = searchParams.get('status');
    const county = searchParams.get('county');

    const where: any = { deletedAt: null };

    if (status === 'ACTIVE') where.isActive = true;
    if (status === 'INACTIVE') where.isActive = false;

    if (county && county !== 'ALL') {
      where.county = county;
    }

    if (search) {
      where.OR = [
        { code: { contains: search } },
        { name: { contains: search } },
        { location: { contains: search } },
        { townCity: { contains: search } },
        { contactPerson: { contains: search } },
      ];
    }

    const branches = await db.branch.findMany({
      where,
      orderBy: { code: 'asc' },
      include: {
        branchManager: {
          select: {
            id: true,
            employeeNumber: true,
            fullName: true,
            jobTitle: true,
          },
        },
        _count: {
          select: {
            departments: { where: { deletedAt: null } },
            stations: { where: { deletedAt: null } },
            employees: { where: { deletedAt: null, isArchived: false } },
          },
        },
      },
    });

    return apiSuccess(branches);
  } catch (error) {
    console.error('Fetch branches error:', error);
    return apiError('Failed to fetch branches.');
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requirePermission('branches.create');
    if ('errorResponse' in auth) return auth.errorResponse;

    const body = await req.json();
    const validation = branchSchema.safeParse(body);

    if (!validation.success) {
      return apiValidationError(validation.error.flatten().fieldErrors);
    }

    const data = validation.data;

    const existing = await db.branch.findUnique({
      where: { code: data.code },
    });

    if (existing) {
      return apiError(`A branch with code "${data.code}" already exists.`, 'DUPLICATE_CODE', 400);
    }

    const branch = await db.branch.create({
      data: {
        code: data.code,
        name: data.name,
        location: data.location || null,
        county: data.county || 'Nairobi',
        townCity: data.townCity || 'Nairobi',
        physicalAddress: data.physicalAddress || null,
        contactPerson: data.contactPerson || null,
        phone: data.phone || null,
        email: data.email || null,
        branchManagerId: data.branchManagerId || null,
        isActive: data.isActive,
      },
      include: {
        branchManager: {
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
      action: 'CREATE_BRANCH',
      module: 'ORGANIZATION',
      entityType: 'BRANCH',
      entityId: branch.id,
      newValue: {
        code: branch.code,
        name: branch.name,
        county: branch.county,
        isActive: branch.isActive,
      },
    });

    return apiSuccess(branch, undefined, 201);
  } catch (error) {
    console.error('Create branch error:', error);
    return apiError('Failed to create branch.');
  }
}
