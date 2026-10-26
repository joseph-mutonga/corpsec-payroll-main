import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth, errorResponse, successResponse } from '@/lib/auth-helpers';
import { leaveEntitlementInitSchema } from '@/lib/validation';
import { calculateProratedEntitlement } from '@/lib/leave-calculator';
import { logAudit } from '@/lib/audit';

export async function GET(req: NextRequest) {
  try {
    await requireAuth(['leave.view']);
    const { searchParams } = new URL(req.url);

    const employeeId = searchParams.get('employeeId');
    const leaveTypeId = searchParams.get('leaveTypeId');
    const leaveYear = parseInt(searchParams.get('year') || String(new Date().getFullYear()), 10);
    const departmentId = searchParams.get('departmentId');
    const branchId = searchParams.get('branchId');
    const search = searchParams.get('search');

    const where: any = {
      leaveYear,
      employee: { deletedAt: null, isArchived: false },
    };

    if (employeeId) where.employeeId = employeeId;
    if (leaveTypeId) where.leaveTypeId = leaveTypeId;
    if (departmentId) where.employee.departmentId = departmentId;
    if (branchId) where.employee.branchId = branchId;
    if (search) {
      where.employee.OR = [
        { fullName: { contains: search } },
        { employeeNumber: { contains: search } },
        { nationalId: { contains: search } },
      ];
    }

    const entitlements = await db.leaveEntitlement.findMany({
      where,
      orderBy: [{ employee: { fullName: 'asc' } }, { leaveType: { name: 'asc' } }],
      include: {
        employee: {
          select: {
            id: true,
            employeeNumber: true,
            fullName: true,
            gender: true,
            department: { select: { name: true, code: true } },
            branch: { select: { name: true, code: true } },
            station: { select: { name: true, code: true } },
            position: { select: { title: true, code: true } },
          },
        },
        leaveType: true,
        policy: true,
      },
    });

    return successResponse(entitlements);
  } catch (error: any) {
    if (error.status) return errorResponse(error.message, error.status);
    console.error('Fetch leave entitlements error:', error);
    return errorResponse('Failed to fetch leave entitlements.');
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth(['leave.manage_policies', 'leave.adjust_balance']);
    const body = await req.json();

    const parsed = leaveEntitlementInitSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse('Validation failed', 400, parsed.error.flatten().fieldErrors);
    }

    const leaveYear = parsed.data.leaveYear;
    const leaveYearStart = new Date(leaveYear, 0, 1);
    const leaveYearEnd = new Date(leaveYear, 11, 31);

    // Fetch leave types & policies
    const leaveTypes = await db.leaveType.findMany({
      where: {
        status: 'ACTIVE',
        deletedAt: null,
        ...(parsed.data.leaveTypeId ? { id: parsed.data.leaveTypeId } : {}),
      },
      include: {
        policies: {
          where: { status: 'ACTIVE', deletedAt: null },
          take: 1,
        },
      },
    });

    // Fetch target employees
    const employeeWhere: any = {
      deletedAt: null,
      isArchived: false,
    };
    if (parsed.data.employeeIds && parsed.data.employeeIds.length > 0) {
      employeeWhere.id = { in: parsed.data.employeeIds };
    }

    const employees = await db.employee.findMany({
      where: employeeWhere,
      select: {
        id: true,
        fullName: true,
        employeeNumber: true,
        gender: true,
        employmentDate: true,
      },
    });

    let initializedCount = 0;

    for (const emp of employees) {
      for (const lt of leaveTypes) {
        // Check gender applicability
        if (lt.genderApplicability === 'MALE' && emp.gender !== 'MALE') continue;
        if (lt.genderApplicability === 'FEMALE' && emp.gender !== 'FEMALE') continue;

        const policy = lt.policies[0];
        const defaultEntitled = policy?.entitledDays ?? lt.defaultDays;
        const prorationRule = policy?.prorationRule ?? 'PRORATED_BY_MONTH';

        // Calculate proration if joined in this leave year
        const proration = calculateProratedEntitlement(
          defaultEntitled,
          emp.employmentDate,
          leaveYearStart,
          leaveYearEnd,
          prorationRule
        );

        const entitledDays = proration.entitledDays;

        await db.leaveEntitlement.upsert({
          where: {
            employeeId_leaveTypeId_leaveYear: {
              employeeId: emp.id,
              leaveTypeId: lt.id,
              leaveYear,
            },
          },
          update: {
            policyId: policy?.id || null,
            entitledDays,
            availableBalance: entitledDays,
          },
          create: {
            employeeId: emp.id,
            leaveTypeId: lt.id,
            policyId: policy?.id || null,
            leaveYear,
            openingBalance: 0,
            entitledDays,
            accruedDays: 0,
            carriedForwardDays: 0,
            usedDays: 0,
            pendingDays: 0,
            adjustmentDays: 0,
            expiredDays: 0,
            availableBalance: entitledDays,
          },
        });
        initializedCount++;
      }
    }

    await logAudit({
      userId: session.user.id,
      userEmail: session.user.email,
      action: 'INITIALIZE_LEAVE_ENTITLEMENTS',
      module: 'LEAVE',
      entityType: 'LeaveEntitlement',
      newValue: { leaveYear, initializedRecords: initializedCount },
    });

    return successResponse(
      { initializedCount, leaveYear },
      `Successfully initialized ${initializedCount} leave entitlement records for year ${leaveYear}.`,
      201
    );
  } catch (error: any) {
    if (error.status) return errorResponse(error.message, error.status);
    console.error('Initialize leave entitlements error:', error);
    return errorResponse('Failed to initialize leave entitlements.');
  }
}
