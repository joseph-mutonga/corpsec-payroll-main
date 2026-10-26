import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, hasAnyRole } from '@/lib/auth';
import { SessionService } from '@/lib/training/SessionService';

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getCurrentUser(req);
    if (!user || !hasAnyRole(user, ['super_admin', 'hr_admin', 'hr_manager'])) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    const body = await req.json();
    if (!body.status) {
      return NextResponse.json({ success: false, error: 'Status is required.' }, { status: 400 });
    }

    const session = await SessionService.updateSessionStatus(params.id, body.status, user.id);
    return NextResponse.json({ success: true, data: { session } });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }
}
