import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, hasAnyRole } from '@/lib/auth';
import { EnrollmentService } from '@/lib/training/EnrollmentService';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getCurrentUser(req);
    if (!user || !hasAnyRole(user, ['super_admin', 'hr_admin', 'hr_manager'])) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const role = user.role?.name || '';

    if (role === 'hr_manager' && body.isManagerReview) {
      const enrollment = await EnrollmentService.managerReview(params.id, {
        decision: body.decision || 'APPROVED',
        reason: body.reason,
        managerUserId: user.id,
      });
      return NextResponse.json({ success: true, data: { enrollment } });
    }

    const enrollment = await EnrollmentService.hrApprove(params.id, {
      hrUserId: user.id,
      hrReason: body.reason,
    });

    return NextResponse.json({ success: true, data: { enrollment } });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }
}
