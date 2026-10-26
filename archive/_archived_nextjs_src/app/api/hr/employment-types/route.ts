import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/permissions';
import { apiBadRequest, apiError, apiSuccess } from '@/lib/response';

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth('organization.view');
    if ('errorResponse' in auth) return auth.errorResponse;

    const types = await db.employmentTypeConfig.findMany({
      orderBy: { createdAt: 'asc' },
    });
    return apiSuccess(types);
  } catch (error: any) {
    console.error('Error fetching employment types:', error);
    return apiError(error.message || 'Failed to fetch employment types');
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth('organization.manage');
    if ('errorResponse' in auth) return auth.errorResponse;

    const body = await req.json();
    const { code, name, description, hasContractEnd, hasProbation, defaultProbationMonths, hasLeaveEntitlement, hasStatutoryDeductions } = body;

    if (!code || !name) {
      return apiBadRequest('code and name are required');
    }

    const type = await db.employmentTypeConfig.upsert({
      where: { code: code.toUpperCase() },
      update: {
        name,
        description,
        hasContractEnd: Boolean(hasContractEnd),
        hasProbation: Boolean(hasProbation),
        defaultProbationMonths: defaultProbationMonths || 3,
        hasLeaveEntitlement: hasLeaveEntitlement !== false,
        hasStatutoryDeductions: hasStatutoryDeductions !== false,
      },
      create: {
        code: code.toUpperCase(),
        name,
        description,
        hasContractEnd: Boolean(hasContractEnd),
        hasProbation: Boolean(hasProbation),
        defaultProbationMonths: defaultProbationMonths || 3,
        hasLeaveEntitlement: hasLeaveEntitlement !== false,
        hasStatutoryDeductions: hasStatutoryDeductions !== false,
      },
    });

    return apiSuccess(type);
  } catch (error: any) {
    console.error('Error saving employment type:', error);
    return apiError(error.message || 'Failed to save employment type');
  }
}
