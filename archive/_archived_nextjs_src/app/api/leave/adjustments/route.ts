import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth, errorResponse, successResponse } from '@/lib/auth-helpers';
import { leaveAdjustmentCreateSchema } from '@/lib/validation';
import { logAudit } from '@/lib/audit';

export async function GET(req: NextRequest) {
  try {
    await requireAuth(['leave.view']);
    const { searchParams } = new URL(req.url);

    const employeeId = searchParams.get('employeeId');
    const leaveTypeId = searchParams.get('leaveTypeId');
    const leaveYear = searchParams.get('year') ? parseInt(searchParams.get('year')!, 10) : undefined;

    const where: any = {};
    if (employeeId) where.employeeId = employeeId;
    if (leaveTypeId) where.leaveTypeId = leaveTypeId;
    if (leaveYear) where.leaveYear = leaveYear;

    const adjustments = await db.leaveAdjustment.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        employee: {
          select: { id: true, employeeNumber: true, fullName: true },
        },
        leaveType: {
          select: { id: true, name: true, code: true, color: true },
        },
        approvedBy: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
    });

    return successResponse(adjustments);
  } catch (error: any) {
    if (error.status) return errorResponse(error.message, error.status);
    console.error('Fetch leave adjustments error:', error);
    return errorResponse('Failed to fetch leave adjustments.');
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth(['leave.adjust_balance']);
    const body = await req.json();

    const parsed = leaveAdjustmentCreateSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse('Validation failed', 400, parsed.error.flatten().fieldErrors);
    }

    const { employeeId, leaveTypeId, leaveYear, adjustmentType, adjustmentDays, reason } = parsed.data;

    // Fetch or create entitlement
    let entitlement = await db.leaveEntitlement.findUnique({
      where: {
        employeeId_leaveTypeId_leaveYear: {
          employeeId,
          leaveTypeId,
          leaveYear,
        },
      },
    });

    if (!entitlement) {
      const lt = await db.leaveType.findUnique({ where: { id: leaveTypeId } });
      if (!lt) return errorResponse('Leave type not found.', 404);

      entitlement = await db.leaveEntitlement.create({
        data: {
          employeeId,
          leaveTypeId,
          leaveYear,
          openingBalance: 0,
          entitledDays: lt.defaultDays,
          availableBalance: lt.defaultDays,
        },
      });
    }

    const previousBalance = entitlement.availableBalance;
    const newAdjustmentTotal = entitlement.adjustmentDays + adjustmentDays;
    const newBalance =
      entitlement.openingBalance +
      entitlement.entitledDays +
      entitlement.accruedDays +
      entitlement.carriedForwardDays +
      newAdjustmentTotal -
      entitlement.usedDays -
      entitlement.pendingDays;

    if (newBalance < 0) {
      return errorResponse(
        `Adjustment would cause negative available balance (${newBalance} days). Operation rejected.`,
        400
      );
    }

    // Atomic update
    const [updatedEntitlement, adjustmentRecord] = await db.$transaction([
      db.leaveEntitlement.update({
        where: { id: entitlement.id },
        data: {
          adjustmentDays: newAdjustmentTotal,
          availableBalance: newBalance,
        },
      }),
      db.leaveAdjustment.create({
        data: {
          employeeId,
          leaveTypeId,
          entitlementId: entitlement.id,
          leaveYear,
          adjustmentType,
          adjustmentDays,
          previousBalance,
          newBalance,
          reason,
          approvedById: session.user.id,
        },
        include: {
          employee: { select: { id: true, fullName: true, employeeNumber: true } },
          leaveType: { select: { id: true, name: true, code: true } },
        },
      }),
    ]);

    await logAudit({
      userId: session.user.id,
      userEmail: session.user.email,
      action: 'LEAVE_BALANCE_ADJUSTMENT',
      module: 'LEAVE',
      entityType: 'LeaveAdjustment',
      entityId: adjustmentRecord.id,
      previousValue: { availableBalance: previousBalance },
      newValue: { availableBalance: newBalance, adjustmentDays, reason },
    });

    return successResponse(
      adjustmentRecord,
      `Successfully applied ${adjustmentDays > 0 ? `+${adjustmentDays}` : adjustmentDays} days balance adjustment.`,
      201
    );
  } catch (error: any) {
    if (error.status) return errorResponse(error.message, error.status);
    console.error('Create leave adjustment error:', error);
    return errorResponse('Failed to record leave adjustment.');
  }
}
