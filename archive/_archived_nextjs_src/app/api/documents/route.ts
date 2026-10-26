import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requirePermission } from '@/lib/permissions';
import { apiError, apiSuccess } from '@/lib/response';

export async function GET(req: NextRequest) {
  try {
    const auth = await requirePermission('employee.documents.view');
    if ('errorResponse' in auth) return auth.errorResponse;

    const { searchParams } = new URL(req.url);
    const documentType = searchParams.get('documentType');
    const search = searchParams.get('search');

    const where: any = {};

    if (documentType && documentType !== 'ALL') {
      where.documentType = documentType.toUpperCase();
    }

    if (search) {
      where.OR = [
        { fileName: { contains: search } },
        { description: { contains: search } },
        { employee: { fullName: { contains: search } } },
        { employee: { employeeNumber: { contains: search } } },
      ];
    }

    const documents = await db.employeeDocument.findMany({
      where,
      include: {
        employee: {
          select: {
            id: true,
            employeeNumber: true,
            fullName: true,
            jobTitle: true,
            department: { select: { name: true } },
          },
        },
        uploadedBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    return apiSuccess(documents);
  } catch (error) {
    console.error('Fetch all documents error:', error);
    return apiError('Failed to fetch HR documents.');
  }
}
