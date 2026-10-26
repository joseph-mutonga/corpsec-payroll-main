import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/permissions';
import { apiError, apiSuccess } from '@/lib/response';
import { employeeDeductionSchema } from '@/lib/validation';

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth(['deduction.view', 'salary.view', 'payroll_config.view']);
    if ('errorResponse' in auth) return auth.errorResponse;

    const { searchParams } = new URL(req.url);
    const employeeId = searchParams.get('employeeId') || undefined;
    const deductionTypeId = searchParams.get('deductionTypeId') || undefined;
    const status = searchParams.get('status') || undefined;

    const assignments = await db.employeeDeduction.findMany({
      where: {
        ...(employeeId ? { employeeId } : {}),
        ...(deductionTypeId ? { deductionTypeId } : {}),
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
        deductionType: true,
      },
      orderBy: [{ employeeId: 'asc' }, { effectiveFrom: 'desc' }],
    });

    return apiSuccess(assignments);
  } catch (error) {
    console.error('Fetch employee deductions error:', error);
    return apiError('Failed to fetch employee deduction assignments');
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth(['employee_deduction.assign', 'payroll_config.manage']);
    if ('errorResponse' in auth) return auth.errorResponse;

    const body = await req.json();
    const parsed = employeeDeductionSchema.safeParse(body);
    if (!parsed.success) {
      return apiError('Invalid deduction assignment data', 400, parsed.error.format());
    }

    const {
      employeeId,
      deductionTypeId,
      amount,
      calculationMethod,
      percentageValue,
      totalTargetAmount,
      currentBalance,
      effectiveFrom,
      effectiveTo,
      isRecurring,
      status,
      notes,
    } = parsed.data;

    const [emp, dedType] = await Promise.all([
      db.employee.findUnique({ where: { id: employeeId } }),
      db.deductionType.findUnique({ where: { id: deductionTypeId } }),
    ]);

    if (!emp) return apiError('Employee not found', 404);
    if (!dedType) return apiError('Deduction type not found', 404);

    const effectiveFromDate = new Date(effectiveFrom);

    // If an active assignment exists for the same deduction type, supersede it
    const existingActive = await db.employeeDeduction.findFirst({
      where: {
        employeeId,
        deductionTypeId,
        status: 'ACTIVE',
      },
      orderBy: { effectiveFrom: 'desc' },
    });

    if (existingActive) {
      const prevEffectiveTo = new Date(effectiveFromDate.getTime() - 24 * 60 * 60 * 1000);
      await db.employeeDeduction.update({
        where: { id: existingActive.id },
        data: {
          effectiveTo: prevEffectiveTo,
          status: 'SUPERSEDED',
        },
      });
    }

    const assignment = await db.employeeDeduction.create({
      data: {
        employeeId,
        deductionTypeId,
        amount,
        calculationMethod: calculationMethod || dedType.calculationMethod,
        percentageValue: percentageValue ?? null,
        totalTargetAmount: totalTargetAmount ?? (dedType.calculationMethod === 'BALANCE_BASED' ? amount : null),
        currentBalance: currentBalance ?? (dedType.calculationMethod === 'BALANCE_BASED' ? totalTargetAmount || amount : null),
        effectiveFrom: effectiveFromDate,
        effectiveTo: effectiveTo ? new Date(effectiveTo) : null,
        isRecurring: isRecurring ?? dedType.isRecurring,
        status: status || 'ACTIVE',
        notes,
      },
      include: {
        employee: { select: { id: true, employeeNumber: true, fullName: true } },
        deductionType: true,
      },
    });

    await db.auditLog.create({
      data: {
        userId: auth.user.id,
        userEmail: auth.user.email,
        action: 'ASSIGN_DEDUCTION',
        module: 'PAYROLL',
        entityType: 'EMPLOYEE_DEDUCTION',
        entityId: assignment.id,
        newValue: JSON.stringify({ employeeId, deductionTypeId, amount, effectiveFrom }),
      },
    });

    return apiSuccess(assignment, 'Deduction assigned to employee successfully', 201);
  } catch (error) {
    console.error('Assign deduction error:', error);
    return apiError('Failed to assign deduction');
  }
}
