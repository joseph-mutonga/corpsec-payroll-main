import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, hasAnyRole } from '@/lib/auth';
import { ProgramService } from '@/lib/training/ProgramService';

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser(req);
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const search = searchParams.get('search') || undefined;
    const departmentId = searchParams.get('departmentId') || undefined;
    const status = searchParams.get('status') || undefined;
    const isMandatory = searchParams.get('isMandatory') ? searchParams.get('isMandatory') === 'true' : undefined;

    const programs = await ProgramService.listPrograms({
      search,
      departmentId,
      status,
      isMandatory,
    });

    return NextResponse.json({ success: true, data: { programs } });
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
    if (!body.name || !body.startDate || !body.endDate) {
      return NextResponse.json(
        { success: false, error: 'Program Name, Start Date, and End Date are required.' },
        { status: 400 }
      );
    }

    const program = await ProgramService.createProgram({
      ...body,
      createdById: user.id,
    });

    return NextResponse.json({ success: true, data: { program } }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }
}
