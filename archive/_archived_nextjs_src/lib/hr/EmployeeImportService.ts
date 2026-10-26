import { db } from '@/lib/db';
import { createAuditLog } from '@/lib/audit';

export interface CSVImportRow {
  rowNumber: number;
  data: {
    employeeNumber: string;
    firstName: string;
    middleName?: string;
    lastName: string;
    nationalId: string;
    primaryPhone: string;
    email?: string;
    gender: 'MALE' | 'FEMALE' | 'OTHER';
    jobTitle: string;
    employmentType: string;
    departmentName?: string;
    stationName?: string;
    basicSalary?: number;
    employmentDate?: string;
  };
  isValid: boolean;
  errors: string[];
}

export interface ImportPreviewResult {
  totalRows: number;
  validCount: number;
  errorCount: number;
  rows: CSVImportRow[];
}

export class EmployeeImportService {
  /**
   * Parses and validates raw CSV text against database constraints
   */
  static async validateAndPreview(csvContent: string): Promise<ImportPreviewResult> {
    const lines = csvContent
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    if (lines.length <= 1) {
      return { totalRows: 0, validCount: 0, errorCount: 0, rows: [] };
    }

    const headers = lines[0].split(',').map((h) => h.trim().replace(/^["']|["']$/g, '').toLowerCase());

    const [existingEmployees, departments, stations] = await Promise.all([
      db.employee.findMany({ select: { employeeNumber: true, nationalId: true, email: true } }),
      db.department.findMany({ where: { isActive: true }, select: { id: true, name: true, code: true } }),
      db.station.findMany({ where: { isActive: true }, select: { id: true, name: true, code: true } }),
    ]);

    const existingEmpNums = new Set(existingEmployees.map((e) => e.employeeNumber.toUpperCase()));
    const existingNIds = new Set(existingEmployees.map((e) => e.nationalId));
    const existingEmails = new Set(existingEmployees.filter((e) => e.email).map((e) => e.email!.toLowerCase()));

    const seenFileEmpNums = new Set<string>();
    const seenFileNIds = new Set<string>();

    const rows: CSVImportRow[] = [];

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      // Basic CSV token parser handling quoted commas
      const values: string[] = [];
      let inQuotes = false;
      let curVal = '';
      for (let charIdx = 0; charIdx < line.length; charIdx++) {
        const char = line[charIdx];
        if (char === '"') {
          inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
          values.push(curVal.trim().replace(/^["']|["']$/g, ''));
          curVal = '';
        } else {
          curVal += char;
        }
      }
      values.push(curVal.trim().replace(/^["']|["']$/g, ''));

      const rowData: Record<string, any> = {};
      headers.forEach((h, idx) => {
        rowData[h] = values[idx] || '';
      });

      const rowErrors: string[] = [];

      const empNum = (rowData['employeenumber'] || rowData['employee_number'] || rowData['emp_no'] || '').toUpperCase();
      const firstName = rowData['firstname'] || rowData['first_name'] || '';
      const middleName = rowData['middlename'] || rowData['middle_name'] || '';
      const lastName = rowData['lastname'] || rowData['last_name'] || '';
      const nationalId = rowData['nationalid'] || rowData['national_id'] || rowData['id_number'] || '';
      const phone = rowData['phone'] || rowData['primaryphone'] || rowData['mobile'] || '';
      const email = (rowData['email'] || '').toLowerCase();
      let gender = (rowData['gender'] || 'MALE').toUpperCase();
      if (!['MALE', 'FEMALE', 'OTHER'].includes(gender)) gender = 'MALE';
      const jobTitle = rowData['jobtitle'] || rowData['job_title'] || rowData['position'] || 'Security Guard';
      const empType = (rowData['employmenttype'] || rowData['employment_type'] || 'PERMANENT').toUpperCase();
      const deptName = rowData['department'] || rowData['departmentname'] || '';
      const stationName = rowData['station'] || rowData['stationname'] || '';
      const salaryStr = rowData['basicsalary'] || rowData['basic_salary'] || rowData['salary'] || '25000';
      const basicSalary = parseFloat(salaryStr) || 25000;
      const empDate = rowData['employmentdate'] || rowData['date_joined'] || new Date().toISOString().split('T')[0];

      // Validations
      if (!empNum) rowErrors.push('Employee Number is required');
      else if (existingEmpNums.has(empNum)) rowErrors.push(`Employee number ${empNum} already exists in database`);
      else if (seenFileEmpNums.has(empNum)) rowErrors.push(`Duplicate employee number ${empNum} within CSV`);
      else seenFileEmpNums.add(empNum);

      if (!firstName) rowErrors.push('First name is required');
      if (!lastName) rowErrors.push('Last name is required');

      if (!nationalId) rowErrors.push('National ID / Passport is required');
      else if (existingNIds.has(nationalId)) rowErrors.push(`National ID ${nationalId} already exists in database`);
      else if (seenFileNIds.has(nationalId)) rowErrors.push(`Duplicate National ID ${nationalId} within CSV`);
      else seenFileNIds.add(nationalId);

      if (!phone) rowErrors.push('Primary phone number is required');

      if (email && existingEmails.has(email)) {
        rowErrors.push(`Email ${email} is already registered`);
      }

      rows.push({
        rowNumber: i,
        data: {
          employeeNumber: empNum,
          firstName,
          middleName,
          lastName,
          nationalId,
          primaryPhone: phone,
          email: email || undefined,
          gender: gender as any,
          jobTitle,
          employmentType: empType,
          departmentName: deptName || undefined,
          stationName: stationName || undefined,
          basicSalary,
          employmentDate: empDate,
        },
        isValid: rowErrors.length === 0,
        errors: rowErrors,
      });
    }

    const validCount = rows.filter((r) => r.isValid).length;
    const errorCount = rows.filter((r) => !r.isValid).length;

    return {
      totalRows: rows.length,
      validCount,
      errorCount,
      rows,
    };
  }

  /**
   * Commits validated CSV rows to database inside a transaction
   */
  static async executeImport(validRows: CSVImportRow['data'][], createdById: string) {
    const [departments, stations, defaultBranch] = await Promise.all([
      db.department.findMany({ select: { id: true, name: true, code: true } }),
      db.station.findMany({ select: { id: true, name: true, code: true, branchId: true } }),
      db.branch.findFirst({ select: { id: true } }),
    ]);

    const deptMap = new Map(departments.map((d) => [d.name.toLowerCase(), d.id]));
    const stationMap = new Map(stations.map((s) => [s.name.toLowerCase(), s.id]));

    let importedCount = 0;

    for (const item of validRows) {
      const deptId = item.departmentName ? deptMap.get(item.departmentName.toLowerCase()) || null : null;
      const stationId = item.stationName ? stationMap.get(item.stationName.toLowerCase()) || null : null;
      const fullName = [item.firstName, item.middleName, item.lastName].filter(Boolean).join(' ');

      await db.$transaction(async (tx) => {
        const emp = await tx.employee.create({
          data: {
            employeeNumber: item.employeeNumber,
            firstName: item.firstName,
            middleName: item.middleName || null,
            lastName: item.lastName,
            fullName,
            nationalId: item.nationalId,
            primaryPhone: item.primaryPhone,
            email: item.email || null,
            gender: item.gender,
            jobTitle: item.jobTitle,
            employmentType: item.employmentType,
            employmentStatus: 'ACTIVE',
            departmentId: deptId,
            stationId: stationId,
            branchId: defaultBranch?.id || null,
            employmentDate: item.employmentDate ? new Date(item.employmentDate) : new Date(),
          },
        });

        // Create base salary record
        if (item.basicSalary) {
          await tx.salaryRecord.create({
            data: {
              employeeId: emp.id,
              basicSalary: item.basicSalary,
              payFrequency: 'MONTHLY',
              currency: 'KES',
              effectiveFrom: new Date(),
              status: 'ACTIVE',
              isOvertimeEligible: true,
              changeReason: 'Initial CSV Import Setup',
              proposedById: createdById,
              approvedById: createdById,
              approvedAt: new Date(),
            },
          });
        }

        await tx.employeeHistory.create({
          data: {
            employeeId: emp.id,
            changeType: 'STATUS_CHANGE',
            description: `Employee created via bulk CSV import (${emp.employeeNumber})`,
            newValue: JSON.stringify({ employeeNumber: emp.employeeNumber, jobTitle: emp.jobTitle }),
            performedById: createdById,
          },
        });

        importedCount++;
      });
    }

    await createAuditLog({
      userId: createdById,
      action: 'BULK_EMPLOYEE_IMPORT',
      module: 'EMPLOYEES',
      newValue: { importedCount },
    });

    return { importedCount };
  }
}
