import { NextRequest } from 'next/server';
import { clearSessionCookie, getCurrentSession } from '@/lib/auth';
import { apiSuccess } from '@/lib/response';
import { createAuditLog } from '@/lib/audit';

export async function POST(req: NextRequest) {
  const session = await getCurrentSession();

  if (session) {
    await createAuditLog({
      userId: session.userId,
      userEmail: session.email,
      action: 'USER_LOGOUT',
      module: 'AUTH',
      entityType: 'USER',
      entityId: session.userId,
    });
  }

  await clearSessionCookie();
  return apiSuccess({ message: 'Logged out successfully.' });
}
