import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, hasAnyRole } from '@/lib/auth';
import { SessionService } from '@/lib/training/SessionService';

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser(req);
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const search = searchParams.get('search') || undefined;
    const courseId = searchParams.get('courseId') || undefined;
    const programId = searchParams.get('programId') || undefined;
    const trainerId = searchParams.get('trainerId') || undefined;
    const venueId = searchParams.get('venueId') || undefined;
    const status = searchParams.get('status') || undefined;
    const deliveryMethod = searchParams.get('deliveryMethod') || undefined;

    const sessions = await SessionService.listSessions({
      search,
      courseId,
      programId,
      trainerId,
      venueId,
      status,
      deliveryMethod,
    });

    return NextResponse.json({ success: true, data: { sessions } });
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
    if (!body.courseId || !body.startDate || !body.endDate) {
      return NextResponse.json(
        { success: false, error: 'Course, Start Date, and End Date are required.' },
        { status: 400 }
      );
    }

    const session = await SessionService.createSession({
      ...body,
      createdById: user.id,
    });

    return NextResponse.json({ success: true, data: { session } }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }
}
