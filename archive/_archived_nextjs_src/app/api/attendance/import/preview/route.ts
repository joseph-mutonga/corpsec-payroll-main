import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { AttendanceImportService } from '@/lib/attendance/AttendanceImportService';

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser(req);
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const csvContent = body.csvText || '';
    if (!csvContent) {
      return NextResponse.json({ success: false, error: 'csvText is required' }, { status: 400 });
    }

    const parsedRows = AttendanceImportService.parseCsv(csvContent);
    const preview = await AttendanceImportService.previewImport(parsedRows);

    return NextResponse.json({
      success: true,
      data: preview,
    });
  } catch (error: any) {
    console.error('Error previewing attendance import:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }
}
