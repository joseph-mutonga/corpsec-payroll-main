import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { EnrollmentService } from '@/lib/training/EnrollmentService';

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser(req);
    if (!user || !user.employeeId) {
      return NextResponse.json({ success: false, error: 'Unauthorized or no employee profile linked.' }, { status: 401 });
    }

    const employeeId = user.employeeId;

    const [
      employee,
      availableCourses,
      myEnrollments,
      myCertificates,
      mySkills,
      upcomingSessions,
      mandatoryCourses,
    ] = await Promise.all([
      db.employee.findUnique({
        where: { id: employeeId },
        select: { id: true, fullName: true, employeeNumber: true, department: true, position: true },
      }),
      db.course.findMany({
        where: { status: 'ACTIVE' },
        include: { category: true, _count: { select: { sessions: true } } },
        orderBy: { title: 'asc' },
      }),
      db.trainingEnrollment.findMany({
        where: { employeeId },
        orderBy: { requestedAt: 'desc' },
        include: {
          course: true,
          session: { include: { venue: true, trainer: true } },
          attendances: true,
          assessments: true,
          certificates: true,
          evaluation: true,
        },
      }),
      db.trainingCertificate.findMany({
        where: { employeeId },
        orderBy: { issueDate: 'desc' },
        include: { course: true, program: true },
      }),
      db.employeeSkill.findMany({
        where: { employeeId },
        orderBy: { dateAcquired: 'desc' },
        include: { course: true, certificate: true },
      }),
      db.trainingSession.findMany({
        where: {
          startDate: { gte: new Date() },
          status: { in: ['SCHEDULED', 'OPEN', 'FULL'] },
        },
        include: {
          course: true,
          venue: true,
          trainer: true,
          _count: { select: { enrollments: true } },
        },
        orderBy: { startDate: 'asc' },
      }),
      db.course.findMany({
        where: { isMandatory: true, status: 'ACTIVE' },
      }),
    ]);

    // Check compliance status for mandatory courses
    const mandatoryStatus = mandatoryCourses.map((course) => {
      const cert = myCertificates.find((c) => c.courseId === course.id);
      const isExpired = cert?.expiryDate ? new Date() > new Date(cert.expiryDate) : false;
      const isCompliant = cert && cert.status === 'ACTIVE' && !isExpired;

      return {
        course,
        isCompliant: !!isCompliant,
        status: isCompliant ? 'COMPLIANT' : isExpired ? 'EXPIRED' : 'DUE',
        certificate: cert || null,
      };
    });

    return NextResponse.json({
      success: true,
      data: {
        employee,
        availableCourses,
        myEnrollments,
        myCertificates,
        mySkills,
        upcomingSessions,
        mandatoryStatus,
      },
    });
  } catch (error: any) {
    console.error('Error fetching employee portal training data:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser(req);
    if (!user || !user.employeeId) {
      return NextResponse.json({ success: false, error: 'Unauthorized or no employee profile linked.' }, { status: 401 });
    }

    const body = await req.json();
    if (!body.sessionId) {
      return NextResponse.json({ success: false, error: 'Session ID is required.' }, { status: 400 });
    }

    const enrollment = await EnrollmentService.requestEnrollment({
      sessionId: body.sessionId,
      employeeId: user.employeeId,
      requestedById: user.id,
      autoApprove: false,
    });

    return NextResponse.json({ success: true, data: { enrollment } }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }
}
