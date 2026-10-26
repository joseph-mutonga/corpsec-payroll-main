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
    const rows = body.rows || [];
    if (!rows.length && body.csvText) {
      const parsed = AttendanceImportService.parseCsv(body.csvText);
      const result = await AttendanceImportService.executeImport(parsed, user.id);
      return NextResponse.json({ success: true, data: result });
    }

    const result = await AttendanceImportService.executeImport(rows, user.id);
    return NextResponse.json({ success: true, data: result });
  } catch (error: any) {
    console.error('Error executing attendance import:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }
}
