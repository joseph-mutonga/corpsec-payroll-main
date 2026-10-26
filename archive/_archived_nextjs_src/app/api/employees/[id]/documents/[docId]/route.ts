import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requirePermission } from '@/lib/permissions';
import { apiError, apiNotFound, apiSuccess } from '@/lib/response';
import { createAuditLog } from '@/lib/audit';
import path from 'path';
import fs from 'fs/promises';

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string; docId: string } }
) {
  try {
    const auth = await requirePermission('employee.documents.delete');
    if ('errorResponse' in auth) return auth.errorResponse;

    const document = await db.employeeDocument.findFirst({
      where: {
        id: params.docId,
        employeeId: params.id,
      },
    });

    if (!document) {
      return apiNotFound('Document not found.');
    }

    // Attempt to remove physical file from disk
    try {
      const fullFilePath = path.join(process.cwd(), document.filePath);
      await fs.unlink(fullFilePath);
    } catch (err) {
      // Ignore if already deleted from filesystem
    }

    await db.employeeDocument.delete({
      where: { id: params.docId },
    });

    await createAuditLog({
      userId: auth.session.userId,
      userEmail: auth.session.email,
      action: 'DELETE_EMPLOYEE_DOCUMENT',
      module: 'DOCUMENTS',
      entityType: 'EMPLOYEE_DOCUMENT',
      entityId: params.docId,
      previousValue: {
        employeeId: params.id,
        fileName: document.fileName,
        documentType: document.documentType,
      },
    });

    return apiSuccess({ message: 'Document deleted successfully.' });
  } catch (error) {
    console.error('Delete document error:', error);
    return apiError('Failed to delete document.');
  }
}
