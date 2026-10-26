import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, hasAnyRole } from '@/lib/auth';
import { CourseService } from '@/lib/training/CourseService';

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser(req);
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const categories = await CourseService.listCategories();
    return NextResponse.json({ success: true, data: { categories } });
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
    if (!body.name || !body.code) {
      return NextResponse.json({ success: false, error: 'Category Name and Code are required.' }, { status: 400 });
    }

    const category = await CourseService.createCategory({
      name: body.name,
      code: body.code,
      description: body.description,
      icon: body.icon,
    });

    return NextResponse.json({ success: true, data: { category } }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }
}
