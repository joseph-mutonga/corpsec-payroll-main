import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, hasAnyRole } from '@/lib/auth';
import { CertificateService } from '@/lib/training/CertificateService';

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser(req);
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const employeeId = searchParams.get('employeeId') || undefined;
    const courseId = searchParams.get('courseId') || undefined;
    const status = searchParams.get('status') || undefined;
    const search = searchParams.get('search') || undefined;

    const isHrOrAdmin = hasAnyRole(user, ['super_admin', 'hr_admin', 'hr_manager']);
    const targetEmployeeId = (!isHrOrAdmin && user.employeeId) ? user.employeeId : employeeId;

    const certificates = await CertificateService.listCertificates({
      employeeId: targetEmployeeId,
      courseId,
      status,
      search,
    });

    return NextResponse.json({ success: true, data: { certificates } });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser(req);
    if (!user || !hasAnyRole(user, ['super_admin', 'hr_admin', 'hr_manager'])) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    const body = await req.json();
    if (!body.enrollmentId) {
      return NextResponse.json({ success: false, error: 'Enrollment ID is required.' }, { status: 400 });
    }

    const certificate = await CertificateService.issueCertificate({
      enrollmentId: body.enrollmentId,
      issuedById: user.id,
      documentUrl: body.documentUrl,
      customExpiryDate: body.customExpiryDate,
    });

    return NextResponse.json({ success: true, data: { certificate } }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }
}
