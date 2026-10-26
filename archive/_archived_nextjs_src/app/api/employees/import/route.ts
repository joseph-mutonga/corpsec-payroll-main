import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requirePermission } from '@/lib/permissions';
import { generateNextEmployeeNumber, normalizeKenyanPhone } from '@/lib/employee-utils';
import { apiError, apiSuccess } from '@/lib/response';
import { createAuditLog } from '@/lib/audit';

export async function POST(req: NextRequest) {
  try {
    const auth = await requirePermission('employee.create');
    if ('errorResponse' in auth) return auth.errorResponse;

    const body = await req.json();
    const records = body.records as Array<any>;

    if (!Array.isArray(records) || records.length === 0) {
      return apiError('No valid employee records provided for import.', 'EMPTY_IMPORT_DATA', 400);
    }

    if (records.length > 500) {
      return apiError('Import batch size limit is 500 records per upload.', 'BATCH_LIMIT_EXCEEDED', 400);
    }

    const branches = await db.branch.findMany({ select: { id: true, code: true, name: true } });
    const departments = await db.department.findMany({ select: { id: true, code: true, name: true } });
    const stations = await db.station.findMany({ select: { id: true, code: true, name: true } });

    const branchMap = new Map(branches.map((b) => [b.code.toUpperCase(), b.id]));
    const deptMap = new Map(departments.map((d) => [d.code.toUpperCase(), d.id]));
    const stationMap = new Map(stations.map((s) => [s.code.toUpperCase(), s.id]));

    const errors: Array<{ row: number; nationalId?: string; message: string }> = [];
    const validImports: Array<any> = [];

    // Pre-fetch existing national IDs and emails to prevent collisions
    const existingNationalIds = new Set(
      (await db.employee.findMany({ select: { nationalId: true } })).map((e) => e.nationalId)
    );
    const existingEmails = new Set(
      (await db.employee.findMany({ where: { email: { not: null } }, select: { email: true } })).map(
        (e) => e.email!
      )
    );

    let rowIdx = 1;
    for (const rec of records) {
      rowIdx++;
      const firstName = rec.firstName?.toString().trim();
      const lastName = rec.lastName?.toString().trim();
      const nationalId = rec.nationalId?.toString().trim();
      const primaryPhone = rec.primaryPhone?.toString().trim();
      const jobTitle = rec.jobTitle?.toString().trim();

      if (!firstName || !lastName || !nationalId || !primaryPhone || !jobTitle) {
        errors.push({
          row: rowIdx,
          nationalId,
          message: 'Missing mandatory fields (First Name, Last Name, National ID, Primary Phone, or Job Title)',
        });
        continue;
      }

      if (existingNationalIds.has(nationalId)) {
        errors.push({
          row: rowIdx,
          nationalId,
          message: `National ID "${nationalId}" already exists in the database.`,
        });
        continue;
      }

      const email = rec.email ? rec.email.toString().trim() : null;
      if (email && existingEmails.has(email)) {
        errors.push({
          row: rowIdx,
          nationalId,
          message: `Email address "${email}" is already registered.`,
        });
        continue;
      }

      const normalizedPhone = normalizeKenyanPhone(primaryPhone) || primaryPhone;
      const middleName = rec.middleName ? rec.middleName.toString().trim() : null;
      const fullName = [firstName, middleName, lastName].filter(Boolean).join(' ');

      const branchCode = rec.branchCode?.toString().trim().toUpperCase();
      const deptCode = rec.departmentCode?.toString().trim().toUpperCase();
      const stationCode = rec.stationCode?.toString().trim().toUpperCase();

      validImports.push({
        firstName,
        middleName,
        lastName,
        fullName,
        nationalId,
        gender: ['MALE', 'FEMALE', 'OTHER'].includes(rec.gender?.toUpperCase()) ? rec.gender.toUpperCase() : 'MALE',
        primaryPhone: normalizedPhone,
        email,
        jobTitle,
        employmentType: ['PERMANENT', 'CONTRACT', 'TEMPORARY', 'CASUAL'].includes(rec.employmentType?.toUpperCase())
          ? rec.employmentType.toUpperCase()
          : 'PERMANENT',
        employmentStatus: 'ACTIVE',
        employmentDate: rec.employmentDate ? new Date(rec.employmentDate) : new Date(),
        branchId: branchCode ? branchMap.get(branchCode) || null : null,
        departmentId: deptCode ? deptMap.get(deptCode) || null : null,
        stationId: stationCode ? stationMap.get(stationCode) || null : null,
        kraPin: rec.kraPin ? rec.kraPin.toString().trim().toUpperCase() : null,
        nssfNumber: rec.nssfNumber ? rec.nssfNumber.toString().trim() : null,
        shaNumber: rec.shaNumber ? rec.shaNumber.toString().trim() : null,
        preferredPaymentMethod: rec.preferredPaymentMethod?.toUpperCase() === 'MPESA' ? 'MPESA' : 'BANK',
        bankName: rec.bankName ? rec.bankName.toString().trim() : null,
        bankAccountName: rec.bankAccountName ? rec.bankAccountName.toString().trim() : null,
        bankAccountNumber: rec.bankAccountNumber ? rec.bankAccountNumber.toString().trim() : null,
        mpesaPhoneNumber: rec.mpesaPhoneNumber ? normalizeKenyanPhone(rec.mpesaPhoneNumber) : null,
      });

      existingNationalIds.add(nationalId);
      if (email) existingEmails.add(email);
    }

    if (errors.length > 0 && validImports.length === 0) {
      return apiError('All records failed validation.', 'IMPORT_VALIDATION_FAILED', 422, { errors });
    }

    // Batch insert valid records
    const createdEmployees: string[] = [];
    for (const emp of validImports) {
      const employeeNumber = await generateNextEmployeeNumber('CORP-');
      const record = await db.employee.create({
        data: {
          ...emp,
          employeeNumber,
        },
      });

      await db.employeeHistory.create({
        data: {
          employeeId: record.id,
          changeType: 'BULK_IMPORT',
          description: `Employee created via batch import by ${auth.session.email}`,
          performedById: auth.session.userId,
        },
      });

      createdEmployees.push(record.id);
    }

    await createAuditLog({
      userId: auth.session.userId,
      userEmail: auth.session.email,
      action: 'BULK_IMPORT_EMPLOYEES',
      module: 'EMPLOYEES',
      entityType: 'EMPLOYEE_BATCH',
      newValue: {
        totalSubmitted: records.length,
        successfullyImported: createdEmployees.length,
        failedCount: errors.length,
      },
    });

    return apiSuccess({
      message: `Batch import completed. Successfully imported ${createdEmployees.length} employees.`,
      importedCount: createdEmployees.length,
      errorsCount: errors.length,
      errors,
    });
  } catch (error) {
    console.error('Batch import error:', error);
    return apiError('Failed to execute bulk employee import.');
  }
}
