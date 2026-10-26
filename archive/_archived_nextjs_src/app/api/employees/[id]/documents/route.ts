import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requirePermission } from '@/lib/permissions';
import { apiError, apiNotFound, apiSuccess } from '@/lib/response';
import { createAuditLog } from '@/lib/audit';
import path from 'path';
import fs from 'fs/promises';

const UPLOAD_BASE_DIR = path.join(process.cwd(), 'uploads', 'documents');

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requirePermission('employee.documents.view');
    if ('errorResponse' in auth) return auth.errorResponse;

    const documents = await db.employeeDocument.findMany({
      where: { employeeId: params.id },
      include: {
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
    });

    return apiSuccess(documents);
  } catch (error) {
    console.error('Fetch documents error:', error);
    return apiError('Failed to fetch employee documents.');
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requirePermission('employee.documents.upload');
    if ('errorResponse' in auth) return auth.errorResponse;

    const employee = await db.employee.findFirst({
      where: { id: params.id, deletedAt: null },
    });

    if (!employee) return apiNotFound('Employee not found.');

    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const documentType = (formData.get('documentType') as string) || 'OTHER';
    const description = (formData.get('description') as string) || null;
    const expiryDateStr = formData.get('expiryDate') as string | null;

    if (!file) {
      return apiError('No file was uploaded.', 'FILE_REQUIRED', 400);
    }

    const maxSizeBytes = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSizeBytes) {
      return apiError('File size exceeds the 10MB limit.', 'FILE_TOO_LARGE', 400);
    }

    // Ensure employee upload folder exists
    const employeeDir = path.join(UPLOAD_BASE_DIR, params.id);
    await fs.mkdir(employeeDir, { recursive: true });

    const originalName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const uniqueFileName = `${Date.now()}_${originalName}`;
    const targetFilePath = path.join(employeeDir, uniqueFileName);

    const buffer = Buffer.from(await file.arrayBuffer());
    await fs.writeFile(targetFilePath, buffer);

    const relativePath = path.join('uploads', 'documents', params.id, uniqueFileName).replace(/\\/g, '/');

    const documentRecord = await db.employeeDocument.create({
      data: {
        employeeId: params.id,
        documentType: documentType.toUpperCase(),
        fileName: file.name,
        filePath: relativePath,
        fileSize: file.size,
        mimeType: file.type || 'application/octet-stream',
        description,
        expiryDate: expiryDateStr ? new Date(expiryDateStr) : null,
        uploadedById: auth.session.userId,
      },
      include: {
        uploadedBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
    });

    await createAuditLog({
      userId: auth.session.userId,
      userEmail: auth.session.email,
      action: 'UPLOAD_EMPLOYEE_DOCUMENT',
      module: 'DOCUMENTS',
      entityType: 'EMPLOYEE_DOCUMENT',
      entityId: documentRecord.id,
      newValue: {
        employeeId: params.id,
        fileName: file.name,
        documentType,
        fileSize: file.size,
      },
    });

    return apiSuccess(documentRecord, undefined, 201);
  } catch (error) {
    console.error('Document upload error:', error);
    return apiError('Failed to upload employee document.');
  }
}
