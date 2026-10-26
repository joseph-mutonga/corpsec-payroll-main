import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/permissions';
import { apiError, apiSuccess } from '@/lib/response';
import { employeeAllowanceSchema } from '@/lib/validation';

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth(['allowance.view', 'salary.view', 'payroll_config.view']);
    if ('errorResponse' in auth) return auth.errorResponse;

    const { searchParams } = new URL(req.url);
    const employeeId = searchParams.get('employeeId') || undefined;
    const allowanceTypeId = searchParams.get('allowanceTypeId') || undefined;
    const status = searchParams.get('status') || undefined;

    const assignments = await db.employeeAllowance.findMany({
      where: {
        ...(employeeId ? { employeeId } : {}),
        ...(allowanceTypeId ? { allowanceTypeId } : {}),
        ...(status ? { status } : {}),
      },
      include: {
        employee: {
          select: {
            id: true,
            employeeNumber: true,
            fullName: true,
            jobTitle: true,
            department: { select: { name: true, code: true } },
            branch: { select: { name: true, code: true } },
          },
        },
        allowanceType: true,
      },
      orderBy: [{ employeeId: 'asc' }, { effectiveFrom: 'desc' }],
    });

    return apiSuccess(assignments);
  } catch (error) {
    console.error('Fetch employee allowances error:', error);
    return apiError('Failed to fetch employee allowance assignments');
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth(['employee_allowance.assign', 'payroll_config.manage']);
    if ('errorResponse' in auth) return auth.errorResponse;

    const body = await req.json();
    const parsed = employeeAllowanceSchema.safeParse(body);
    if (!parsed.success) {
      return apiError('Invalid allowance assignment data', 400, parsed.error.format());
    }

    const {
      employeeId,
      allowanceTypeId,
      amount,
      calculationMethod,
      percentageValue,
      effectiveFrom,
      effectiveTo,
      isRecurring,
      status,
      notes,
    } = parsed.data;

    const [emp, alwType] = await Promise.all([
      db.employee.findUnique({ where: { id: employeeId } }),
      db.allowanceType.findUnique({ where: { id: allowanceTypeId } }),
    ]);

    if (!emp) return apiError('Employee not found', 404);
    if (!alwType) return apiError('Allowance type not found', 404);

    const effectiveFromDate = new Date(effectiveFrom);

    // If an active assignment exists for the same allowance type, supersede it
    const existingActive = await db.employeeAllowance.findFirst({
      where: {
        employeeId,
        allowanceTypeId,
        status: 'ACTIVE',
      },
      orderBy: { effectiveFrom: 'desc' },
    });

    if (existingActive) {
      const prevEffectiveTo = new Date(effectiveFromDate.getTime() - 24 * 60 * 60 * 1000);
      await db.employeeAllowance.update({
        where: { id: existingActive.id },
        data: {
          effectiveTo: prevEffectiveTo,
          status: 'SUPERSEDED',
        },
      });
    }

    const assignment = await db.employeeAllowance.create({
      data: {
        employeeId,
        allowanceTypeId,
        amount,
        calculationMethod: calculationMethod || alwType.calculationMethod,
        percentageValue: percentageValue ?? alwType.percentageValue,
        effectiveFrom: effectiveFromDate,
        effectiveTo: effectiveTo ? new Date(effectiveTo) : null,
        isRecurring: isRecurring ?? alwType.isRecurring,
        status: status || 'ACTIVE',
        notes,
      },
      include: {
        employee: { select: { id: true, employeeNumber: true, fullName: true } },
        allowanceType: true,
      },
    });

    await db.auditLog.create({
      data: {
        userId: auth.user.id,
        userEmail: auth.user.email,
        action: 'ASSIGN_ALLOWANCE',
        module: 'PAYROLL',
        entityType: 'EMPLOYEE_ALLOWANCE',
        entityId: assignment.id,
        newValue: JSON.stringify({ employeeId, allowanceTypeId, amount, effectiveFrom }),
      },
    });

    return apiSuccess(assignment, 'Allowance assigned to employee successfully', 201);
  } catch (error) {
    console.error('Assign allowance error:', error);
    return apiError('Failed to assign allowance');
  }
}
