import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/permissions';
import { apiError, apiSuccess } from '@/lib/response';
import { companyPayrollSettingSchema } from '@/lib/validation';

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth(['payroll_config.view', 'settings.view', 'payroll.view']);
    if ('errorResponse' in auth) return auth.errorResponse;

    let settings = await db.companyPayrollSetting.findFirst();
    if (!settings) {
      settings = await db.companyPayrollSetting.create({
        data: {
          id: 'corpsec_payroll_config_default',
          payFrequency: 'MONTHLY',
          defaultPayDay: 28,
          cutoffDay: 24,
          defaultCurrency: 'KES',
          roundingMethod: 'ROUND_NEAREST_1',
          prorationBaseDays: 30,
          overtimeHourlyDivisor: 225,
          allowNegativeNetPay: false,
          requireTwoTierApproval: true,
          payrollNumberPrefix: 'PAY-',
          payslipNumberPrefix: 'PS-',
          paymentBatchPrefix: 'PB-',
        },
      });
    }

    return apiSuccess(settings);
  } catch (error) {
    console.error('Fetch payroll settings error:', error);
    return apiError('Failed to fetch company payroll settings');
  }
}

export async function PUT(req: NextRequest) {
  try {
    const auth = await requireAuth(['payroll_config.manage', 'settings.edit']);
    if ('errorResponse' in auth) return auth.errorResponse;

    const body = await req.json();
    const parsed = companyPayrollSettingSchema.partial().safeParse(body);
    if (!parsed.success) {
      return apiError('Invalid payroll settings data', 400, parsed.error.format());
    }

    const data = parsed.data;

    let current = await db.companyPayrollSetting.findFirst();
    let updated;

    if (current) {
      updated = await db.companyPayrollSetting.update({
        where: { id: current.id },
        data: {
          ...(data.payFrequency ? { payFrequency: data.payFrequency } : {}),
          ...(data.defaultPayDay !== undefined ? { defaultPayDay: data.defaultPayDay } : {}),
          ...(data.cutoffDay !== undefined ? { cutoffDay: data.cutoffDay } : {}),
          ...(data.defaultCurrency ? { defaultCurrency: data.defaultCurrency } : {}),
          ...(data.roundingMethod ? { roundingMethod: data.roundingMethod } : {}),
          ...(data.prorationBaseDays !== undefined ? { prorationBaseDays: data.prorationBaseDays } : {}),
          ...(data.overtimeHourlyDivisor !== undefined ? { overtimeHourlyDivisor: data.overtimeHourlyDivisor } : {}),
          ...(data.allowNegativeNetPay !== undefined ? { allowNegativeNetPay: data.allowNegativeNetPay } : {}),
          ...(data.requireTwoTierApproval !== undefined ? { requireTwoTierApproval: data.requireTwoTierApproval } : {}),
          ...(data.payrollNumberPrefix ? { payrollNumberPrefix: data.payrollNumberPrefix } : {}),
          ...(data.payslipNumberPrefix ? { payslipNumberPrefix: data.payslipNumberPrefix } : {}),
          ...(data.paymentBatchPrefix ? { paymentBatchPrefix: data.paymentBatchPrefix } : {}),
        },
      });
    } else {
      updated = await db.companyPayrollSetting.create({
        data: {
          id: 'corpsec_payroll_config_default',
          ...data,
        },
      });
    }

    await db.auditLog.create({
      data: {
        userId: auth.user.id,
        userEmail: auth.user.email,
        action: 'UPDATE_PAYROLL_SETTINGS',
        module: 'PAYROLL',
        entityType: 'PAYROLL_SETTINGS',
        entityId: updated.id,
        newValue: JSON.stringify(updated),
      },
    });

    return apiSuccess(updated, 'Company payroll configuration saved successfully');
  } catch (error) {
    console.error('Update payroll settings error:', error);
    return apiError('Failed to update payroll settings');
  }
}
