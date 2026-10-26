import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requirePermission } from '@/lib/permissions';
import { apiError, apiNotFound } from '@/lib/response';
import path from 'path';
import fs from 'fs/promises';

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string; docId: string } }
) {
  try {
    const auth = await requirePermission('employee.documents.view');
    if ('errorResponse' in auth) return auth.errorResponse;

    const document = await db.employeeDocument.findFirst({
      where: {
        id: params.docId,
        employeeId: params.id,
      },
    });

    if (!document) {
      return apiNotFound('Document not found or unauthorized.');
    }

    const fullFilePath = path.join(process.cwd(), document.filePath);

    try {
      const fileBuffer = await fs.readFile(fullFilePath);

      const headers = new Headers();
      headers.set('Content-Type', document.mimeType || 'application/octet-stream');
      headers.set(
        'Content-Disposition',
        `attachment; filename="${encodeURIComponent(document.fileName)}"`
      );
      headers.set('Content-Length', fileBuffer.length.toString());

      return new NextResponse(fileBuffer, {
        status: 200,
        headers,
      });
    } catch (fsErr) {
      console.error('File read error on disk:', fsErr);
      return apiError('The requested file could not be read from secure storage.', 'FILE_NOT_FOUND', 404);
    }
  } catch (error) {
    console.error('Download document error:', error);
    return apiError('Failed to download document.');
  }
}
