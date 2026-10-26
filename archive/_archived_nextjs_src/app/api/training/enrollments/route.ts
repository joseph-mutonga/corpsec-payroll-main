import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, hasAnyRole } from '@/lib/auth';
import { EnrollmentService } from '@/lib/training/EnrollmentService';

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser(req);
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const sessionId = searchParams.get('sessionId') || undefined;
    const courseId = searchParams.get('courseId') || undefined;
    const employeeId = searchParams.get('employeeId') || undefined;
    const status = searchParams.get('status') || undefined;
    const departmentId = searchParams.get('departmentId') || undefined;

    // Scope check: regular employee can only view their own enrollments
    const isHrOrAdmin = hasAnyRole(user, ['super_admin', 'hr_admin', 'hr_manager']);
    let scopedEmployeeId = employeeId;
    if (!isHrOrAdmin && user.employeeId) {
      scopedEmployeeId = user.employeeId;
    }

    const enrollments = await EnrollmentService.listEnrollments({
      sessionId,
      courseId,
      employeeId: scopedEmployeeId,
      status,
      departmentId,
    });

    return NextResponse.json({ success: true, data: { enrollments } });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser(req);
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    if (!body.sessionId) {
      return NextResponse.json({ success: false, error: 'Session ID is required.' }, { status: 400 });
    }

    const isHrOrAdmin = hasAnyRole(user, ['super_admin', 'hr_admin', 'hr_manager']);
    const targetEmployeeId = body.employeeId || user.employeeId;
    if (!targetEmployeeId) {
      return NextResponse.json({ success: false, error: 'Employee ID is required.' }, { status: 400 });
    }

    // If regular employee, they cannot enroll someone else
    if (!isHrOrAdmin && user.employeeId && targetEmployeeId !== user.employeeId) {
      return NextResponse.json({ success: false, error: 'You can only enroll yourself in training.' }, { status: 403 });
    }

    const enrollment = await EnrollmentService.requestEnrollment({
      sessionId: body.sessionId,
      employeeId: targetEmployeeId,
      requestedById: user.id,
      trainingNeedId: body.trainingNeedId,
      developmentPlanId: body.developmentPlanId,
      autoApprove: isHrOrAdmin,
    });

    return NextResponse.json({ success: true, data: { enrollment } }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }
}
