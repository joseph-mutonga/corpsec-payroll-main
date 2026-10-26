import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { hasPermission, requirePermission } from '@/lib/permissions';
import { maskSensitiveNumber, maskMpesaPhone } from '@/lib/employee-utils';
import { apiError } from '@/lib/response';
import { createAuditLog } from '@/lib/audit';

export async function GET(req: NextRequest) {
  try {
    const auth = await requirePermission('employee.export');
    if ('errorResponse' in auth) return auth.errorResponse;

    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status');
    const departmentId = searchParams.get('departmentId');
    const branchId = searchParams.get('branchId');
    const format = searchParams.get('format') || 'csv';

    const where: any = { deletedAt: null };
    if (status && status !== 'ALL') where.employmentStatus = status;
    if (departmentId && departmentId !== 'ALL') where.departmentId = departmentId;
    if (branchId && branchId !== 'ALL') where.branchId = branchId;

    const employees = await db.employee.findMany({
      where,
      include: {
        department: true,
        branch: true,
        station: true,
      },
      orderBy: { employeeNumber: 'asc' },
    });

    const canViewSensitive = hasPermission(auth.session, 'employee.view_sensitive');

    // Build CSV Content
    const headers = [
      'Employee Number',
      'Full Name',
      'National ID',
      'Gender',
      'Primary Phone',
      'Email',
      'Job Title',
      'Department',
      'Branch',
      'Guarding Station',
      'Employment Type',
      'Employment Status',
      'Employment Date',
      'KRA PIN',
      'NSSF Number',
      'SHA Number',
      'Preferred Payment Method',
      'Bank Name',
      'Bank Account Number',
      'M-Pesa Phone',
    ];

    const escapeCsv = (str: string | null | undefined) => {
      if (!str) return '""';
      return `"${String(str).replace(/"/g, '""')}"`;
    };

    const rows = employees.map((emp) => [
      emp.employeeNumber,
      emp.fullName,
      emp.nationalId,
      emp.gender,
      emp.primaryPhone,
      emp.email || '',
      emp.jobTitle,
      emp.department?.name || '',
      emp.branch?.name || '',
      emp.station?.name || '',
      emp.employmentType,
      emp.employmentStatus,
      emp.employmentDate.toISOString().split('T')[0],
      emp.kraPin || '',
      emp.nssfNumber || '',
      emp.shaNumber || '',
      emp.preferredPaymentMethod,
      emp.bankName || '',
      canViewSensitive ? (emp.bankAccountNumber || '') : maskSensitiveNumber(emp.bankAccountNumber) || '',
      canViewSensitive ? (emp.mpesaPhoneNumber || '') : maskMpesaPhone(emp.mpesaPhoneNumber) || '',
    ]);

    const csvContent = [
      headers.map(escapeCsv).join(','),
      ...rows.map((r) => r.map(escapeCsv).join(',')),
    ].join('\r\n');

    await createAuditLog({
      userId: auth.session.userId,
      userEmail: auth.session.email,
      action: 'EXPORT_EMPLOYEES',
      module: 'EMPLOYEES',
      entityType: 'EMPLOYEE_BATCH',
      newValue: {
        recordCount: employees.length,
        format,
        sensitiveUnmasked: canViewSensitive,
      },
    });

    const filename = `corpsec_employees_${new Date().toISOString().split('T')[0]}.csv`;

    return new NextResponse(csvContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error('Export employees error:', error);
    return apiError('Failed to export employee dataset.');
  }
}
