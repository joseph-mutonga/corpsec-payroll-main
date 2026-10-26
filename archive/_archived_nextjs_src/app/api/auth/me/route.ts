import { NextRequest } from 'next/server';
import { getCurrentSession } from '@/lib/auth';
import { apiError, apiSuccess, apiUnauthorized } from '@/lib/response';

export async function GET(req: NextRequest) {
  const session = await getCurrentSession();
  if (!session) {
    return apiUnauthorized();
  }
  return apiSuccess({ session });
}
