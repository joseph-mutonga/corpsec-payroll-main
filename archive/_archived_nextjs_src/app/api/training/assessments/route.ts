import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, hasAnyRole } from '@/lib/auth';
import { AssessmentService } from '@/lib/training/AssessmentService';

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
    const result = searchParams.get('result') || undefined;
    const assessmentType = searchParams.get('assessmentType') || undefined;

    const isHrOrAdmin = hasAnyRole(user, ['super_admin', 'hr_admin', 'hr_manager']);
    const targetEmployeeId = (!isHrOrAdmin && user.employeeId) ? user.employeeId : employeeId;

    const assessments = await AssessmentService.listAssessments({
      sessionId,
      courseId,
      employeeId: targetEmployeeId,
      result,
      assessmentType,
    });

    return NextResponse.json({ success: true, data: { assessments } });
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
    if (!body.enrollmentId || !body.sessionId || !body.employeeId || body.obtainedMarks === undefined) {
      return NextResponse.json(
        { success: false, error: 'Enrollment ID, Session ID, Employee ID, and Obtained Marks are required.' },
        { status: 400 }
      );
    }

    const assessment = await AssessmentService.recordAssessment({
      ...body,
      evaluatorId: user.id,
    });

    return NextResponse.json({ success: true, data: { assessment } }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }
}
