import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requirePermission } from '@/lib/permissions';
import { companySettingsSchema } from '@/lib/validation';
import { apiError, apiSuccess, apiValidationError } from '@/lib/response';
import { createAuditLog } from '@/lib/audit';

export async function GET(req: NextRequest) {
  try {
    let settings = await db.companySetting.findFirst();

    if (!settings) {
      // Create default if not present
      settings = await db.companySetting.create({
        data: {
          id: 'corpsec_settings_default',
          companyName: 'CorpSec Investigations & Guarding Services',
          country: 'Kenya',
          defaultCurrency: 'KES',
          timezone: 'Africa/Nairobi',
        },
      });
    }

    return apiSuccess(settings);
  } catch (error) {
    console.error('Fetch company settings error:', error);
    return apiError('Failed to load company settings.');
  }
}

export async function PUT(req: NextRequest) {
  try {
    const auth = await requirePermission('settings.manage');
    if ('errorResponse' in auth) return auth.errorResponse;

    const body = await req.json();
    const validation = companySettingsSchema.safeParse(body);

    if (!validation.success) {
      return apiValidationError(validation.error.flatten().fieldErrors);
    }

    const current = await db.companySetting.findFirst();
    const previousValue = current ? { ...current } : null;

    const updated = await db.companySetting.upsert({
      where: { id: current?.id || 'corpsec_settings_default' },
      update: {
        ...validation.data,
        updatedBy: auth.session.userId,
      },
      create: {
        id: 'corpsec_settings_default',
        ...validation.data,
        updatedBy: auth.session.userId,
      },
    });

    await createAuditLog({
      userId: auth.session.userId,
      userEmail: auth.session.email,
      action: 'UPDATE_COMPANY_SETTINGS',
      module: 'SETTINGS',
      entityType: 'COMPANY_SETTINGS',
      entityId: updated.id,
      previousValue,
      newValue: updated,
    });

    return apiSuccess(updated);
  } catch (error) {
    console.error('Update company settings error:', error);
    return apiError('Failed to update company settings.');
  }
}
