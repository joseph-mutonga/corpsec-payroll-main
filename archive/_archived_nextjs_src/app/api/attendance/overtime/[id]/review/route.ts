import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { OvertimeService } from '@/lib/attendance/OvertimeService';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getCurrentUser(req);
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const result = await OvertimeService.reviewOvertime({
      overtimeId: params.id,
      decision: body.decision || 'APPROVE',
      reviewerUserId: user.id,
      level: body.level || 'MANAGER',
      comments: body.comments,
    });

    return NextResponse.json({ success: true, data: result });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }
}
