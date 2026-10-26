import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth, errorResponse, successResponse } from '@/lib/auth-helpers';

export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth(['attendance.view']);
    const { searchParams } = new URL(req.url);

    let employeeId = searchParams.get('employeeId');
    if (!employeeId) {
      const emp = await db.employee.findFirst({
        where: { email: session.user.email, deletedAt: null },
      });
      if (!emp) {
        // Fallback for admin
        const firstActive = await db.employee.findFirst({
          where: { employmentStatus: 'ACTIVE', deletedAt: null },
        });
        employeeId = firstActive?.id || null;
      } else {
        employeeId = emp.id;
      }
    }

    if (!employeeId) {
      return successResponse({
        hasRecord: false,
        employee: null,
        record: null,
        status: 'NO_EMPLOYEE_FOUND',
      });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [employee, record, recentEvents] = await Promise.all([
      db.employee.findUnique({
        where: { id: employeeId },
        include: {
          shiftAssignments: {
            where: { status: 'ACTIVE' },
            include: { shift: true },
            take: 1,
          },
          station: { select: { name: true } },
          branch: { select: { name: true } },
        },
      }),
      db.attendanceRecord.findUnique({
        where: {
          employeeId_date: {
            employeeId,
            date: today,
          },
        },
        include: {
          scheduledShift: true,
        },
      }),
      db.attendanceEvent.findMany({
        where: {
          employeeId,
          timestamp: { gte: today },
        },
        orderBy: { timestamp: 'desc' },
      }),
    ]);

    const activeShift = employee?.shiftAssignments[0]?.shift || null;
    const isClockedIn = !!(record?.actualClockIn && !record?.actualClockOut);
    const isClockedOut = !!(record?.actualClockIn && record?.actualClockOut);

    return successResponse({
      hasRecord: !!record,
      employee,
      activeShift,
      record,
      recentEvents,
      isClockedIn,
      isClockedOut,
      status: record?.attendanceStatus || (isClockedIn ? 'PRESENT' : 'NOT_CLOCKED_IN'),
    });
  } catch (error: any) {
    return errorResponse(error.message || "Failed to fetch today's clock status", error.status || 500);
  }
}
