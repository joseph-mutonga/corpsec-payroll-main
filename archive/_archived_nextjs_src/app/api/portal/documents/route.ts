import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { resolveSessionEmployee } from '@/lib/portal/PortalAuth';
import { apiSuccess, apiError } from '@/lib/response';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const authContext = await resolveSessionEmployee();
    if ('errorResponse' in authContext) {
      return authContext.errorResponse;
    }

    const { employee } = authContext;

    const documents = await db.employeeDocument.findMany({
      where: {
        employeeId: employee.id,
      },
      orderBy: {
        createdAt: 'desc',
      },
      select: {
        id: true,
        documentType: true,
        fileName: true,
        filePath: true,
        fileSize: true,
        mimeType: true,
        description: true,
        expiryDate: true,
        createdAt: true,
      },
    });

    return apiSuccess(documents);
  } catch (error: any) {
    console.error('Error fetching employee documents:', error);
    return apiError(error.message || 'Failed to load employee documents');
  }
}
