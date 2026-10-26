import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { EnrollmentService } from '@/lib/training/EnrollmentService';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getCurrentUser(req);
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const enrollment = await EnrollmentService.cancelEnrollment(params.id, {
      cancelledById: user.id,
      reason: body.reason,
    });

    return NextResponse.json({ success: true, data: { enrollment } });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }
}
