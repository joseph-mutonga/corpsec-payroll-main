import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, hasAnyRole } from '@/lib/auth';
import { LeaveCarryForwardService } from '@/lib/leave/LeaveCarryForwardService';
import { LeaveExpiryService } from '@/lib/leave/LeaveExpiryService';

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser(req);
    if (!user || !hasAnyRole(user, ['super_admin', 'hr_admin', 'hr_manager'])) {
      return NextResponse.json({ success: false, error: 'Forbidden: Insufficient privileges.' }, { status: 403 });
    }

    const body = await req.json();
    const action = body.action || 'ROLLOVER'; // ROLLOVER or EXPIRY

    if (action === 'EXPIRY') {
      const year = body.year ? parseInt(body.year, 10) : new Date().getFullYear();
      const asOfDate = body.asOfDate ? new Date(body.asOfDate) : new Date();

      const result = await LeaveExpiryService.processExpiredLeave(year, asOfDate, user.id);
      return NextResponse.json({ success: true, data: result });
    } else {
      const fromYear = parseInt(body.fromYear, 10);
      const toYear = parseInt(body.toYear, 10);

      if (!fromYear || !toYear) {
        return NextResponse.json({ success: false, error: 'fromYear and toYear are required for rollover.' }, { status: 400 });
      }

      const result = await LeaveCarryForwardService.processYearRollover(fromYear, toYear, user.id);
      return NextResponse.json({ success: true, data: result });
    }
  } catch (error: any) {
    console.error('Error executing leave rollover/expiry:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }
}
