import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { CoverageService } from '@/lib/attendance/CoverageService';

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser(req);
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const date = searchParams.get('date') || new Date().toISOString().split('T')[0];

    const coverage = await CoverageService.getStationCoverage(date);

    return NextResponse.json({
      success: true,
      data: coverage,
    });
  } catch (error: any) {
    console.error('Error fetching station coverage:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
