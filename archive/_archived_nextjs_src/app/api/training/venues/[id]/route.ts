import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, hasAnyRole } from '@/lib/auth';
import { VenueService } from '@/lib/training/VenueService';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getCurrentUser(req);
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const venue = await VenueService.getVenueById(params.id);
    return NextResponse.json({ success: true, data: { venue } });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 404 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getCurrentUser(req);
    if (!user || !hasAnyRole(user, ['super_admin', 'hr_admin', 'hr_manager'])) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    const body = await req.json();
    const venue = await VenueService.updateVenue(params.id, body, user.id);
    return NextResponse.json({ success: true, data: { venue } });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }
}
