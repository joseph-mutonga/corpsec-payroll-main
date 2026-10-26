import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { EvaluationService } from '@/lib/training/EvaluationService';

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser(req);
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const sessionId = searchParams.get('sessionId') || undefined;
    const courseId = searchParams.get('courseId') || undefined;

    const evaluations = await EvaluationService.listEvaluations({ sessionId, courseId });
    return NextResponse.json({ success: true, data: { evaluations } });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser(req);
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    if (!body.enrollmentId) {
      return NextResponse.json({ success: false, error: 'Enrollment ID is required.' }, { status: 400 });
    }

    const evaluation = await EvaluationService.submitEvaluation(body);
    return NextResponse.json({ success: true, data: { evaluation } }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }
}
