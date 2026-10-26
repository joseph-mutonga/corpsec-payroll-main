import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth, errorResponse } from '@/lib/auth-helpers';
import { readFile } from 'fs/promises';
import { existsSync } from 'fs';

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string; docId: string } }
) {
  try {
    await requireAuth(['leave.documents.view', 'leave.view']);

    const document = await db.leaveDocument.findFirst({
      where: { id: params.docId, leaveRequestId: params.id },
    });

    if (!document || !existsSync(document.filePath)) {
      return errorResponse('Document file not found.', 404);
    }

    const fileBuffer = await readFile(document.filePath);

    return new NextResponse(fileBuffer, {
      status: 200,
      headers: {
        'Content-Type': document.mimeType || 'application/octet-stream',
        'Content-Disposition': `inline; filename="${document.fileName}"`,
        'Content-Length': String(document.fileSize),
      },
    });
  } catch (error: any) {
    if (error.status) return errorResponse(error.message, error.status);
    console.error('Download leave document error:', error);
    return errorResponse('Failed to download document.');
  }
}
