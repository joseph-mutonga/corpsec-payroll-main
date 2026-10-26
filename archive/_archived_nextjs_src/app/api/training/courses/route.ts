import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, hasAnyRole } from '@/lib/auth';
import { CourseService } from '@/lib/training/CourseService';

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser(req);
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const search = searchParams.get('search') || undefined;
    const categoryId = searchParams.get('categoryId') || undefined;
    const level = searchParams.get('level') || undefined;
    const deliveryMethod = searchParams.get('deliveryMethod') || undefined;
    const status = searchParams.get('status') || undefined;
    const isMandatory = searchParams.get('isMandatory') ? searchParams.get('isMandatory') === 'true' : undefined;

    const courses = await CourseService.listCourses({
      search,
      categoryId,
      level,
      deliveryMethod,
      status,
      isMandatory,
    });

    return NextResponse.json({ success: true, data: { courses } });
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
    if (!body.title) {
      return NextResponse.json({ success: false, error: 'Course Title is required.' }, { status: 400 });
    }

    const course = await CourseService.createCourse({
      ...body,
      createdById: user.id,
    });

    return NextResponse.json({ success: true, data: { course } }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }
}
