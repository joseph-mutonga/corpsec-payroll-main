import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, hasAnyRole } from '@/lib/auth';
import { SkillService } from '@/lib/training/SkillService';

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser(req);
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const isHrOrAdmin = hasAnyRole(user, ['super_admin', 'hr_admin', 'hr_manager']);
    const employeeId = searchParams.get('employeeId') || user.employeeId;

    if (!employeeId) {
      return NextResponse.json({ success: false, error: 'Employee ID is required.' }, { status: 400 });
    }

    if (!isHrOrAdmin && user.employeeId && employeeId !== user.employeeId) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    const skills = await SkillService.listEmployeeSkills(employeeId);
    return NextResponse.json({ success: true, data: { skills } });
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
    if (!body.employeeId || !body.skillName || !body.level) {
      return NextResponse.json(
        { success: false, error: 'Employee ID, Skill Name, and Skill Level are required.' },
        { status: 400 }
      );
    }

    const skill = await SkillService.recordSkill({
      ...body,
      userId: user.id,
    });

    return NextResponse.json({ success: true, data: { skill } }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }
}
