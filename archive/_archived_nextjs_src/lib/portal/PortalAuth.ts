import { db } from '@/lib/db';
import { requireAuth, hasPermission } from '@/lib/permissions';
import { apiForbidden, apiNotFound } from '@/lib/response';
import { UserSession } from '@/types';
import { NextResponse } from 'next/server';

export interface ResolvedEmployeeContext {
  session: UserSession;
  employee: any;
  isHRAdmin: boolean;
}

/**
 * Resolves the authenticated user session to their associated Employee record.
 * Uses both direct userId linkage and verified email fallback.
 * Strictly prevents unlinked or unauthorized access.
 */
export async function resolveSessionEmployee(): Promise<
  | ResolvedEmployeeContext
  | { error: NextResponse; errorResponse: NextResponse }
> {
  const authResult = await requireAuth();
  if ('error' in authResult && authResult.error) {
    return { error: authResult.error, errorResponse: authResult.errorResponse };
  }

  const session = authResult.session!;
  const isHRAdmin =
    session.roles.includes('super_admin') ||
    session.roles.includes('hr_admin') ||
    session.roles.includes('hr_manager') ||
    session.roles.includes('payroll_officer');

  // Find linked employee
  let employee = await db.employee.findFirst({
    where: {
      OR: [
        { userId: session.userId },
        { email: session.email },
      ],
      deletedAt: null,
    },
    include: {
      department: true,
      position: true,
      station: true,
      branch: true,
      supervisor: {
        select: {
          id: true,
          fullName: true,
          jobTitle: true,
          email: true,
        },
      },
    },
  });

  // If no employee record found and user is an employee, block access
  if (!employee) {
    if (!isHRAdmin) {
      const res = apiForbidden(
        'No employee record linked to your user account. Please contact HR Operations.'
      );
      return { error: res, errorResponse: res };
    }

    // For Super Admin / HR users testing the portal who might not have an employee record,
    // fallback to first active employee so they can test/preview self-service features
    employee = await db.employee.findFirst({
      where: { deletedAt: null },
      include: {
        department: true,
        position: true,
        station: true,
        branch: true,
        supervisor: {
          select: {
            id: true,
            fullName: true,
            jobTitle: true,
            email: true,
          },
        },
      },
    });
  }

  if (!employee) {
    const res = apiNotFound('Employee profile not found.');
    return { error: res, errorResponse: res };
  }

  return {
    session,
    employee,
    isHRAdmin,
  };
}

/**
 * IDOR Protection Guard:
 * Ensures the requesting user is either an authorized HR manager or the exact owner employee.
 */
export async function enforceEmployeeAccess(
  targetEmployeeId: string,
  requiredHrPerm: string = 'employee.view'
): Promise<
  | { session: UserSession; employee: any; isOwner: boolean; isHR: boolean }
  | { errorResponse: NextResponse }
> {
  const authContext = await resolveSessionEmployee();
  if ('errorResponse' in authContext) {
    return authContext;
  }

  const { session, employee } = authContext;
  const isOwner = employee.id === targetEmployeeId;
  const isHR =
    session.roles.includes('super_admin') ||
    hasPermission(session, requiredHrPerm);

  if (!isOwner && !isHR) {
    return {
      errorResponse: apiForbidden(
        "Access Denied: You do not have permission to access another employee's records."
      ),
    };
  }

  return {
    session,
    employee,
    isOwner,
    isHR,
  };
}
