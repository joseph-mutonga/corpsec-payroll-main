import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/permissions';
import { apiError, apiSuccess } from '@/lib/response';
import { salaryRecordCreateSchema } from '@/lib/validation';

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth(['salary.view', 'payroll_config.view', 'payroll.view']);
    if ('errorResponse' in auth) return auth.errorResponse;

    const { searchParams } = new URL(req.url);
    const employeeId = searchParams.get('employeeId') || undefined;
    const status = searchParams.get('status') || undefined;
    const targetDate = searchParams.get('targetDate') || undefined;

    const salaries = await db.salaryRecord.findMany({
      where: {
        ...(employeeId ? { employeeId } : {}),
        ...(status ? { status } : {}),
      },
      include: {
        employee: {
          select: {
            id: true,
            employeeNumber: true,
            fullName: true,
            jobTitle: true,
            employmentStatus: true,
            department: { select: { id: true, name: true, code: true } },
            branch: { select: { id: true, name: true, code: true } },
            station: { select: { id: true, name: true, code: true } },
            position: { select: { id: true, title: true, code: true } },
          },
        },
        proposedBy: { select: { id: true, firstName: true, lastName: true, email: true } },
        approvedBy: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
      orderBy: [{ employeeId: 'asc' }, { effectiveFrom: 'desc' }],
    });

    return apiSuccess(salaries);
  } catch (error) {
    console.error('Fetch salaries error:', error);
    return apiError('Failed to fetch employee salary structures');
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth(['salary.create', 'salary.edit', 'payroll_config.manage']);
    if ('errorResponse' in auth) return auth.errorResponse;

    const body = await req.json();
    const parsed = salaryRecordCreateSchema.safeParse(body);
    if (!parsed.success) {
      return apiError('Invalid salary structure data', 400, parsed.error.format());
    }

    const {
      employeeId,
      basicSalary,
      payFrequency,
      currency,
      effectiveFrom,
      effectiveTo,
      isOvertimeEligible,
      changeReason,
      status,
      notes,
    } = parsed.data;

    // Verify employee exists
    const employee = await db.employee.findUnique({
      where: { id: employeeId },
    });
    if (!employee) {
      return apiError('Employee not found', 404);
    }

    const effectiveFromDate = new Date(effectiveFrom);

    // If proposed as PENDING_APPROVAL, save as pending record
    if (status === 'PENDING_APPROVAL') {
      const pendingRecord = await db.salaryRecord.create({
        data: {
          employeeId,
          basicSalary,
          payFrequency,
          currency: currency || 'KES',
          effectiveFrom: effectiveFromDate,
          effectiveTo: effectiveTo ? new Date(effectiveTo) : null,
          status: 'PENDING_APPROVAL',
          isOvertimeEligible,
          changeReason,
          notes,
          proposedById: auth.user.id,
        },
        include: {
          employee: { select: { id: true, employeeNumber: true, fullName: true } },
          proposedBy: { select: { id: true, firstName: true, lastName: true, email: true } },
        },
      });

      await db.auditLog.create({
        data: {
          userId: auth.user.id,
          userEmail: auth.user.email,
          action: 'PROPOSE_SALARY',
          module: 'PAYROLL',
          entityType: 'SALARY_RECORD',
          entityId: pendingRecord.id,
          newValue: JSON.stringify({ employeeId, basicSalary, effectiveFrom, changeReason }),
        },
      });

      return apiSuccess(pendingRecord, 'Salary revision proposal submitted for management review', 201);
    }

    // Direct active assignment (for Admin / authorized HR)
    // Supersede any existing active salary whose effectiveFrom is earlier
    const existingActive = await db.salaryRecord.findFirst({
      where: {
        employeeId,
        status: 'ACTIVE',
      },
      orderBy: { effectiveFrom: 'desc' },
    });

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

    const activeSalary = await db.salaryRecord.create({
      data: {
        employeeId,
        basicSalary,
        payFrequency,
        currency: currency || 'KES',
        effectiveFrom: effectiveFromDate,
        effectiveTo: effectiveTo ? new Date(effectiveTo) : null,
        status: 'ACTIVE',
        isOvertimeEligible,
        changeReason,
        notes,
        proposedById: auth.user.id,
        approvedById: auth.user.id,
        approvedAt: new Date(),
      },
      include: {
        employee: { select: { id: true, employeeNumber: true, fullName: true } },
        approvedBy: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    });

    // Also record in EmployeeHistory
    await db.employeeHistory.create({
      data: {
        employeeId,
        changeType: 'SALARY_ADJUSTMENT',
        description: `Basic salary adjusted to ${currency} ${basicSalary.toLocaleString()} (${changeReason})`,
        previousValue: existingActive ? JSON.stringify({ basicSalary: existingActive.basicSalary }) : null,
        newValue: JSON.stringify({ basicSalary, effectiveFrom }),
        performedById: auth.user.id,
      },
    });

    await db.auditLog.create({
      data: {
        userId: auth.user.id,
        userEmail: auth.user.email,
        action: 'CREATE',
        module: 'PAYROLL',
        entityType: 'SALARY_RECORD',
        entityId: activeSalary.id,
        newValue: JSON.stringify({ employeeId, basicSalary, effectiveFrom }),
      },
    });

    return apiSuccess(activeSalary, 'Employee salary structure activated successfully', 201);
  } catch (error) {
    console.error('Create salary structure error:', error);
    return apiError('Failed to create salary structure');
  }
}
