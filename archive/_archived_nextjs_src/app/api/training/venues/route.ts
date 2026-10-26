import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, hasAnyRole } from '@/lib/auth';
import { VenueService } from '@/lib/training/VenueService';

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser(req);
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const search = searchParams.get('search') || undefined;
    const branchId = searchParams.get('branchId') || undefined;
    const status = searchParams.get('status') || undefined;

    const venues = await VenueService.listVenues({ search, branchId, status });
    return NextResponse.json({ success: true, data: { venues } });
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
    if (!body.name || !body.capacity) {
      return NextResponse.json({ success: false, error: 'Venue Name and Capacity are required.' }, { status: 400 });
    }

    const venue = await VenueService.createVenue({
      ...body,
      userId: user.id,
    });

    return NextResponse.json({ success: true, data: { venue } }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }
}
