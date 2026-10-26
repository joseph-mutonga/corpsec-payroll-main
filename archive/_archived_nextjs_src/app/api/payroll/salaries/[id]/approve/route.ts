import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/permissions';
import { apiError, apiSuccess } from '@/lib/response';
import { salaryApprovalSchema } from '@/lib/validation';

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireAuth(['salary.approve', 'payroll_config.manage']);
    if ('errorResponse' in auth) return auth.errorResponse;

    const salaryRecord = await db.salaryRecord.findUnique({
      where: { id: params.id },
      include: {
        employee: {
          select: {
            id: true,
            email: true,
            fullName: true,
            employeeNumber: true,
          },
        },
      },
    });

    if (!salaryRecord) {
      return apiError('Salary record not found', 404);
    }

    if (salaryRecord.status !== 'PENDING_APPROVAL') {
      return apiError(`Cannot review a salary record with status "${salaryRecord.status}".`, 400);
    }

    // Anti-Self Approval Rule: Reviewer cannot approve their own salary proposal
    if (salaryRecord.proposedById === auth.user.id && !auth.user.roles.includes('super_admin')) {
      return apiError('Anti-Self-Approval violation: You cannot approve a salary revision that you proposed.', 403);
    }

    const body = await req.json();
    const parsed = salaryApprovalSchema.safeParse(body);
    if (!parsed.success) {
      return apiError('Invalid review data', 400, parsed.error.format());
    }

    const { action, notes } = parsed.data;

    if (action === 'REJECT') {
      const rejected = await db.salaryRecord.update({
        where: { id: params.id },
        data: {
          status: 'REJECTED',
          approvedById: auth.user.id,
          approvedAt: new Date(),
          notes: notes ? `Rejected: ${notes}` : 'Rejected by HR Management',
        },
      });

      await db.auditLog.create({
        data: {
          userId: auth.user.id,
          userEmail: auth.user.email,
          action: 'REJECT_SALARY',
          module: 'PAYROLL',
          entityType: 'SALARY_RECORD',
          entityId: rejected.id,
          newValue: JSON.stringify({ status: 'REJECTED', notes }),
        },
      });

      return apiSuccess(rejected, 'Salary revision proposal rejected');
    }

    // On APPROVE: Find current active salary for this employee and supersede it
    const existingActive = await db.salaryRecord.findFirst({
      where: {
        employeeId: salaryRecord.employeeId,
        status: 'ACTIVE',
      },
      orderBy: { effectiveFrom: 'desc' },
    });

    const effectiveFromDate = new Date(salaryRecord.effectiveFrom);

    if (existingActive) {
      const prevEffectiveTo = new Date(effectiveFromDate.getTime() - 24 * 60 * 60 * 1000);
      await db.salaryRecord.update({
        where: { id: existingActive.id },
        data: {
          effectiveTo: prevEffectiveTo,
          status: 'SUPERSEDED',
        },
      });
    }

    const approvedRecord = await db.salaryRecord.update({
      where: { id: params.id },
      data: {
        status: 'ACTIVE',
        approvedById: auth.user.id,
        approvedAt: new Date(),
        notes: notes || salaryRecord.notes,
      },
      include: {
        employee: { select: { id: true, employeeNumber: true, fullName: true } },
        approvedBy: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    });

    // Record in EmployeeHistory
    await db.employeeHistory.create({
      data: {
        employeeId: salaryRecord.employeeId,
        changeType: 'SALARY_ADJUSTMENT',
        description: `Approved salary revision to ${salaryRecord.currency} ${salaryRecord.basicSalary.toLocaleString()} (Effective: ${effectiveFromDate.toISOString().slice(0, 10)})`,
        previousValue: existingActive ? JSON.stringify({ basicSalary: existingActive.basicSalary }) : null,
        newValue: JSON.stringify({ basicSalary: salaryRecord.basicSalary, effectiveFrom: salaryRecord.effectiveFrom }),
        performedById: auth.user.id,
      },
    });

    // Audit Log
    await db.auditLog.create({
      data: {
        userId: auth.user.id,
        userEmail: auth.user.email,
        action: 'APPROVE_SALARY',
        module: 'PAYROLL',
        entityType: 'SALARY_RECORD',
        entityId: approvedRecord.id,
        newValue: JSON.stringify({
          employeeId: salaryRecord.employeeId,
          basicSalary: salaryRecord.basicSalary,
          effectiveFrom: salaryRecord.effectiveFrom,
        }),
      },
    });

    return apiSuccess(approvedRecord, 'Salary revision approved and activated successfully');
  } catch (error) {
    console.error('Approve salary error:', error);
    return apiError('Failed to approve salary revision');
  }
}
