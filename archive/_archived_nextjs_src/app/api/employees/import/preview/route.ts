import { NextRequest } from 'next/server';
import { requirePermission } from '@/lib/permissions';
import { apiBadRequest, apiError, apiSuccess } from '@/lib/response';
import { EmployeeImportService } from '@/lib/hr/EmployeeImportService';

export async function POST(req: NextRequest) {
  try {
    const auth = await requirePermission('employee.create');
    if ('errorResponse' in auth) return auth.errorResponse;

    const body = await req.json();
    const { csvContent } = body;

    if (!csvContent || typeof csvContent !== 'string') {
      return apiBadRequest('csvContent string is required');
    }

    const preview = await EmployeeImportService.validateAndPreview(csvContent);
    return apiSuccess(preview);
  } catch (error: any) {
    console.error('Error previewing employee import CSV:', error);
    return apiError(error.message || 'Failed to preview CSV');
  }
}
