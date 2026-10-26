import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, hasAnyRole } from '@/lib/auth';
import { db } from '@/lib/db';

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser(req);
    if (!user || !hasAnyRole(user, ['super_admin', 'hr_admin', 'hr_manager', 'finance'])) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const type = searchParams.get('type') || 'TRAINING_REGISTER';
    const format = searchParams.get('format') || 'json';

    let data: any[] = [];
    let csvHeader = '';
    let csvRows: string[] = [];

    switch (type) {
      case 'TRAINING_REGISTER': {
        const records = await db.trainingEnrollment.findMany({
          orderBy: { requestedAt: 'desc' },
          include: {
            employee: { select: { employeeNumber: true, fullName: true, department: true } },
            course: { select: { code: true, title: true } },
            session: { select: { sessionNumber: true, startDate: true, status: true } },
          },
        });

        data = records;
        csvHeader = 'Enrollment Number,Employee Number,Employee Name,Department,Course Code,Course Title,Session Number,Session Date,Status,Final Score,Final Result';
        csvRows = records.map((r) =>
          [
            r.enrollmentNumber,
            r.employee.employeeNumber,
            `"${r.employee.fullName}"`,
            `"${r.employee.department?.name || 'Unassigned'}"`,
            r.course.code,
            `"${r.course.title}"`,
            r.session.sessionNumber,
            new Date(r.session.startDate).toISOString().split('T')[0],
            r.status,
            r.finalScore ?? '',
            r.finalResult ?? '',
          ].join(',')
        );
        break;
      }

      case 'TRAINING_ATTENDANCE': {
        const records = await db.trainingAttendance.findMany({
          orderBy: { date: 'desc' },
          include: {
            employee: { select: { employeeNumber: true, fullName: true, department: true } },
            session: { select: { sessionNumber: true, course: { select: { title: true } } } },
          },
        });

        data = records;
        csvHeader = 'Employee Number,Employee Name,Department,Session Number,Course,Date,Hours Attended,Status,Finalized';
        csvRows = records.map((r) =>
          [
            r.employee.employeeNumber,
            `"${r.employee.fullName}"`,
            `"${r.employee.department?.name || 'Unassigned'}"`,
            r.session.sessionNumber,
            `"${r.session.course.title}"`,
            new Date(r.date).toISOString().split('T')[0],
            r.hoursAttended,
            r.status,
            r.isFinalized ? 'YES' : 'NO',
          ].join(',')
        );
        break;
      }

      case 'CERTIFICATIONS': {
        const records = await db.trainingCertificate.findMany({
          orderBy: { issueDate: 'desc' },
          include: {
            employee: { select: { employeeNumber: true, fullName: true, department: true } },
            course: { select: { code: true, title: true } },
          },
        });

        data = records;
        csvHeader = 'Certificate Number,Employee Number,Employee Name,Department,Course Code,Course Title,Issue Date,Expiry Date,Status';
        csvRows = records.map((r) =>
          [
            r.certificateNumber,
            r.employee.employeeNumber,
            `"${r.employee.fullName}"`,
            `"${r.employee.department?.name || 'Unassigned'}"`,
            r.course.code,
            `"${r.course.title}"`,
            new Date(r.issueDate).toISOString().split('T')[0],
            r.expiryDate ? new Date(r.expiryDate).toISOString().split('T')[0] : 'LIFETIME',
            r.status,
          ].join(',')
        );
        break;
      }

      case 'TRAINING_COSTS': {
        const records = await db.trainingCost.findMany({
          orderBy: { createdAt: 'desc' },
          include: {
            department: { select: { name: true } },
            course: { select: { code: true, title: true } },
            session: { select: { sessionNumber: true } },
          },
        });

        data = records;
        csvHeader = 'Cost Reference,Department,Course,Session,Course Fee,Trainer Fee,Venue Fee,Materials,Travel,Accommodation,Other,Total Cost,Currency';
        csvRows = records.map((r) =>
          [
            r.costNumber,
            `"${r.department?.name || 'General'}"`,
            `"${r.course?.title || ''}"`,
            r.session?.sessionNumber || '',
            r.courseFee,
            r.trainerFee,
            r.venueFee,
            r.materialsCost,
            r.travelCost,
            r.accommodationCost,
            r.otherCost,
            r.totalCost,
            r.currency,
          ].join(',')
        );
        break;
      }

      case 'SKILLS_DEVELOPMENT': {
        const records = await db.employeeSkill.findMany({
          orderBy: { dateAcquired: 'desc' },
          include: {
            employee: { select: { employeeNumber: true, fullName: true, department: true, position: true } },
            course: { select: { title: true } },
            certificate: { select: { certificateNumber: true } },
          },
        });

        data = records;
        csvHeader = 'Employee Number,Employee Name,Department,Position,Skill Name,Level,Source,Date Acquired,Certificate Number';
        csvRows = records.map((r) =>
          [
            r.employee.employeeNumber,
            `"${r.employee.fullName}"`,
            `"${r.employee.department?.name || ''}"`,
            `"${r.employee.position?.title || ''}"`,
            `"${r.skillName}"`,
            r.level,
            r.source,
            new Date(r.dateAcquired).toISOString().split('T')[0],
            r.certificate?.certificateNumber || '',
          ].join(',')
        );
        break;
      }

      default:
        return NextResponse.json({ success: false, error: 'Invalid report type specified.' }, { status: 400 });
    }

    if (format === 'csv') {
      const csvContent = [csvHeader, ...csvRows].join('\n');
      return new NextResponse(csvContent, {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="CorpSec_${type}_${new Date().toISOString().split('T')[0]}.csv"`,
        },
      });
    }

    return NextResponse.json({ success: true, count: data.length, data });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
