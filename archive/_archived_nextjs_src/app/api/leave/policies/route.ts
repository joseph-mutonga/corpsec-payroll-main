import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, hasAnyRole } from '@/lib/auth';
import { LeavePolicyService } from '@/lib/leave/LeavePolicyService';

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser(req);
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const leaveTypeId = searchParams.get('leaveTypeId') || undefined;
    const status = searchParams.get('status') || undefined;
    const search = searchParams.get('search') || undefined;

    const policies = await LeavePolicyService.listPolicies({ leaveTypeId, status, search });
    return NextResponse.json({ success: true, data: { policies } });
  } catch (error: any) {
    console.error('Error listing leave policies:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser(req);
    if (!user || !hasAnyRole(user, ['super_admin', 'hr_admin', 'hr_manager'])) {
      return NextResponse.json({ success: false, error: 'Forbidden: Insufficient privileges.' }, { status: 403 });
    }

    const body = await req.json();
    const policy = await LeavePolicyService.createPolicy({
      ...body,
      createdById: user.id,
    });

    return NextResponse.json({ success: true, data: { policy } }, { status: 201 });
  } catch (error: any) {
    console.error('Error creating leave policy:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }
}
