import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requirePermission } from '@/lib/permissions';
import { stationSchema } from '@/lib/validation';
import { apiError, apiSuccess, apiValidationError } from '@/lib/response';
import { createAuditLog } from '@/lib/audit';

export async function GET(req: NextRequest) {
  try {
    const auth = await requirePermission('stations.view');
    if ('errorResponse' in auth) return auth.errorResponse;

    const { searchParams } = new URL(req.url);
    const search = searchParams.get('search');
    const status = searchParams.get('status');
    const branchId = searchParams.get('branchId');
    const county = searchParams.get('county');

    const where: any = { deletedAt: null };

    if (status === 'ACTIVE') where.isActive = true;
    if (status === 'INACTIVE') where.isActive = false;

    if (branchId && branchId !== 'ALL') {
      where.branchId = branchId;
    }

    if (county && county !== 'ALL') {
      where.county = county;
    }

    if (search) {
      where.OR = [
        { code: { contains: search } },
        { name: { contains: search } },
        { clientLocationName: { contains: search } },
        { physicalLocation: { contains: search } },
        { county: { contains: search } },
      ];
    }

    const stations = await db.station.findMany({
      where,
      orderBy: { code: 'asc' },
      include: {
        branch: { select: { id: true, name: true, code: true } },
        supervisor: {
          select: {
            id: true,
            employeeNumber: true,
            fullName: true,
            jobTitle: true,
            primaryPhone: true,
          },
        },
        _count: {
          select: {
            employees: { where: { deletedAt: null, isArchived: false, employmentStatus: 'ACTIVE' } },
          },
        },
      },
    });

    const stationsWithStaffing = stations.map((s) => {
      const currentStaffing = s._count.employees;
      const staffingDifference = s.requiredStaffing - currentStaffing;
      return {
        ...s,
        currentStaffing,
        staffingDifference,
      };
    });

    return apiSuccess(stationsWithStaffing);
  } catch (error) {
    console.error('Fetch stations error:', error);
    return apiError('Failed to fetch guarding stations.');
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requirePermission('stations.create');
    if ('errorResponse' in auth) return auth.errorResponse;

    const body = await req.json();
    const validation = stationSchema.safeParse(body);

    if (!validation.success) {
      return apiValidationError(validation.error.flatten().fieldErrors);
    }

    const data = validation.data;

    const existing = await db.station.findUnique({
      where: { code: data.code },
    });

    if (existing) {
      return apiError(`A station with code "${data.code}" already exists.`, 'DUPLICATE_CODE', 400);
    }

    const station = await db.station.create({
      data: {
        code: data.code,
        name: data.name,
        clientLocationName: data.clientLocationName || null,
        physicalLocation: data.physicalLocation || null,
        county: data.county || 'Nairobi',
        townCity: data.townCity || 'Nairobi',
        address: data.address || null,
        branchId: data.branchId,
        supervisorId: data.supervisorId || null,
        requiredStaffing: data.requiredStaffing || 0,
        isActive: data.isActive,
      },
      include: {
        branch: { select: { id: true, name: true, code: true } },
        supervisor: {
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
      action: 'CREATE_STATION',
      module: 'ORGANIZATION',
      entityType: 'STATION',
      entityId: station.id,
      newValue: {
        code: station.code,
        name: station.name,
        branchId: station.branchId,
        requiredStaffing: station.requiredStaffing,
      },
    });

    return apiSuccess(station, undefined, 201);
  } catch (error) {
    console.error('Create station error:', error);
    return apiError('Failed to create station.');
  }
}
