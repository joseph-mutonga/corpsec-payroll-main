import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { TimesheetService } from '@/lib/attendance/TimesheetService';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getCurrentUser(req);
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const action = body.action || 'REVIEW';

    if (action === 'SUBMIT') {
      const submitted = await TimesheetService.submitTimesheet(params.id, user.id);
      return NextResponse.json({ success: true, data: submitted });
    }

    const reviewed = await TimesheetService.reviewTimesheet({
      timesheetId: params.id,
      decision: body.decision || 'APPROVE',
      reviewerUserId: user.id,
      comments: body.comments,
    });

    return NextResponse.json({ success: true, data: reviewed });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }
}
