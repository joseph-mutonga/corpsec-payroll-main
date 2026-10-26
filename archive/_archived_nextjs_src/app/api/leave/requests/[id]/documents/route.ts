import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth, errorResponse, successResponse } from '@/lib/auth-helpers';
import { writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { logAudit } from '@/lib/audit';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requireAuth(['leave.documents.view', 'leave.view']);

    const documents = await db.leaveDocument.findMany({
      where: { leaveRequestId: params.id },
      orderBy: { createdAt: 'desc' },
      include: {
        uploadedBy: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    return successResponse(documents);
  } catch (error: any) {
    if (error.status) return errorResponse(error.message, error.status);
    console.error('Fetch leave documents error:', error);
    return errorResponse('Failed to fetch leave documents.');
  }
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await requireAuth(['leave.documents.upload', 'leave.create']);

    const leaveRequest = await db.leaveRequest.findUnique({
      where: { id: params.id },
      include: { employee: true },
    });

    if (!leaveRequest) {
      return errorResponse('Leave request not found.', 404);
    }

    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const documentType = (formData.get('documentType') as string) || 'MEDICAL_CERT';
    const description = formData.get('description') as string | null;

    if (!file) {
      return errorResponse('No file attached.', 400);
    }

    // Validate size (max 10MB)
    const MAX_SIZE = 10 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      return errorResponse('File size exceeds 10MB limit.', 400);
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const uploadDir = path.join(process.cwd(), 'storage', 'leave-documents', params.id);

    if (!existsSync(uploadDir)) {
      await mkdir(uploadDir, { recursive: true });
    }

    const safeFileName = `${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
    const filePath = path.join(uploadDir, safeFileName);
    await writeFile(filePath, buffer);

    const document = await db.leaveDocument.create({
      data: {
        leaveRequestId: params.id,
        employeeId: leaveRequest.employeeId,
        documentType,
        fileName: file.name,
        filePath,
        fileSize: file.size,
        mimeType: file.type || 'application/octet-stream',
        description: description || null,
        uploadedById: session.user.id,
      },
    });

    await logAudit({
      userId: session.user.id,
      userEmail: session.user.email,
      action: 'UPLOAD_LEAVE_DOCUMENT',
      module: 'LEAVE',
      entityType: 'LeaveDocument',
      entityId: document.id,
      newValue: {
        leaveRequestId: params.id,
        fileName: file.name,
        documentType,
        fileSize: file.size,
      },
    });

    return successResponse(document, 'Supporting document uploaded successfully.', 201);
  } catch (error: any) {
    if (error.status) return errorResponse(error.message, error.status);
    console.error('Upload leave document error:', error);
    return errorResponse('Failed to upload supporting document.');
  }
}
