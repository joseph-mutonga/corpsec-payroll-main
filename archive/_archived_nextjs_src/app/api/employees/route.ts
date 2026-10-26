import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { hasPermission, requirePermission } from '@/lib/permissions';
import { createEmployeeSchema } from '@/lib/validation';
import { generateNextEmployeeNumber, sanitizeEmployeeForView } from '@/lib/employee-utils';
import { apiError, apiSuccess, apiValidationError } from '@/lib/response';
import { createAuditLog } from '@/lib/audit';

export async function GET(req: NextRequest) {
  try {
    const auth = await requirePermission('employee.view');
    if ('errorResponse' in auth) return auth.errorResponse;

    const { searchParams } = new URL(req.url);
    const search = searchParams.get('search');
    const status = searchParams.get('status');
    const type = searchParams.get('type');
    const departmentId = searchParams.get('departmentId');
    const branchId = searchParams.get('branchId');
    const stationId = searchParams.get('stationId');
    const positionId = searchParams.get('positionId');
    const isArchived = searchParams.get('isArchived');
    const sortBy = searchParams.get('sortBy') || 'createdAt';
    const sortOrder = searchParams.get('sortOrder') === 'asc' ? 'asc' : 'desc';

    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const pageSize = Math.min(100, Math.max(5, parseInt(searchParams.get('pageSize') || '20', 10)));

    const where: any = {
      deletedAt: null,
    };

    if (isArchived === 'true') {
      where.isArchived = true;
    } else if (isArchived === 'false' || !isArchived) {
      where.isArchived = false;
    }

    if (status && status !== 'ALL') {
      where.employmentStatus = status.toUpperCase();
    }

    if (type && type !== 'ALL') {
      where.employmentType = type.toUpperCase();
    }

    if (departmentId && departmentId !== 'ALL') {
      where.departmentId = departmentId;
    }

    if (branchId && branchId !== 'ALL') {
      where.branchId = branchId;
    }

    if (stationId && stationId !== 'ALL') {
      where.stationId = stationId;
    }

    if (positionId && positionId !== 'ALL') {
      where.positionId = positionId;
    }

    if (search) {
      where.OR = [
        { employeeNumber: { contains: search } },
        { firstName: { contains: search } },
        { lastName: { contains: search } },
        { fullName: { contains: search } },
        { nationalId: { contains: search } },
        { primaryPhone: { contains: search } },
        { email: { contains: search } },
        { jobTitle: { contains: search } },
      ];
    }

    const validSortFields = ['employeeNumber', 'fullName', 'employmentDate', 'employmentStatus', 'jobTitle', 'createdAt'];
    const orderByField = validSortFields.includes(sortBy) ? sortBy : 'createdAt';

    const [total, employees] = await Promise.all([
      db.employee.count({ where }),
      db.employee.findMany({
        where,
        orderBy: { [orderByField]: sortOrder },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          department: { select: { id: true, code: true, name: true } },
          branch: { select: { id: true, code: true, name: true } },
          station: { select: { id: true, code: true, name: true } },
          position: { select: { id: true, code: true, title: true } },
        },
      }),
    ]);

    const canViewSensitive = hasPermission(auth.session, 'employee.view_sensitive');

    const sanitizedList = employees.map((emp) =>
      sanitizeEmployeeForView(emp, canViewSensitive)
    );

    return apiSuccess(sanitizedList, {
      total,
      page,
      pageSize,
    });
  } catch (error) {
    console.error('Fetch employees error:', error);
    return apiError('Failed to fetch employee records.');
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requirePermission('employee.create');
    if ('errorResponse' in auth) return auth.errorResponse;

    const body = await req.json();
    const validation = createEmployeeSchema.safeParse(body);

    if (!validation.success) {
      return apiValidationError(validation.error.flatten().fieldErrors);
    }

    const data = validation.data;

    // Check national ID uniqueness
    const existingNatId = await db.employee.findUnique({
      where: { nationalId: data.nationalId },
    });

    if (existingNatId) {
      return apiError(`An employee with National ID "${data.nationalId}" already exists.`, 'DUPLICATE_NATIONAL_ID', 400);
    }

    // Check email uniqueness if email provided
    if (data.email) {
      const existingEmail = await db.employee.findUnique({
        where: { email: data.email },
      });
      if (existingEmail) {
        return apiError(`An employee with email "${data.email}" already exists.`, 'DUPLICATE_EMAIL', 400);
      }
    }

    // Auto-generate employee number if not specified
    const employeeNumber = data.employeeNumber || (await generateNextEmployeeNumber('CORP-'));

    // Check custom employee number uniqueness
    const existingEmpNo = await db.employee.findUnique({
      where: { employeeNumber },
    });
    if (existingEmpNo) {
      return apiError(`Employee number "${employeeNumber}" is already in use.`, 'DUPLICATE_EMPLOYEE_NUMBER', 400);
    }

    const fullName = [data.firstName, data.middleName, data.lastName].filter(Boolean).join(' ');

    const newEmployee = await db.$transaction(async (tx) => {
      const emp = await tx.employee.create({
        data: {
          employeeNumber,
          firstName: data.firstName,
          middleName: data.middleName || null,
          lastName: data.lastName,
          fullName,
          nationalId: data.nationalId,
          dateOfBirth: data.dateOfBirth ? new Date(data.dateOfBirth) : null,
          gender: data.gender,
          maritalStatus: data.maritalStatus || null,
          nationality: data.nationality || 'Kenyan',
          profilePhotoUrl: data.profilePhotoUrl || null,

          primaryPhone: data.primaryPhone,
          alternativePhone: data.alternativePhone || null,
          email: data.email || null,
          physicalAddress: data.physicalAddress || null,
          county: data.county || 'Nairobi',
          townCity: data.townCity || 'Nairobi',
          postalAddress: data.postalAddress || null,

          employmentDate: new Date(data.employmentDate),
          contractStartDate: data.contractStartDate ? new Date(data.contractStartDate) : null,
          contractEndDate: data.contractEndDate ? new Date(data.contractEndDate) : null,
          employmentType: data.employmentType,
          jobTitle: data.jobTitle,
          positionId: data.positionId || null,
          departmentId: data.departmentId || null,
          branchId: data.branchId || null,
          stationId: data.stationId || null,
          supervisorId: data.supervisorId || null,
          employmentStatus: data.employmentStatus,

          preferredPaymentMethod: data.preferredPaymentMethod,
          bankName: data.bankName || null,
          bankAccountName: data.bankAccountName || null,
          bankAccountNumber: data.bankAccountNumber || null,
          bankBranch: data.bankBranch || null,
          bankBranchCode: data.bankBranchCode || null,
          mpesaPhoneNumber: data.mpesaPhoneNumber || null,

          kraPin: data.kraPin || null,
          nssfNumber: data.nssfNumber || null,
          shaNumber: data.shaNumber || null,
          housingLevyNumber: data.housingLevyNumber || null,
          helbNumber: data.helbNumber || null,
        },
      });

      // Create Initial Active Assignment if branch and department provided
      if (emp.branchId && emp.departmentId) {
        await tx.employeeAssignment.create({
          data: {
            employeeId: emp.id,
            branchId: emp.branchId,
            departmentId: emp.departmentId,
            stationId: emp.stationId || null,
            positionId: emp.positionId || null,
            jobTitle: emp.jobTitle,
            supervisorId: emp.supervisorId || null,
            startDate: emp.employmentDate,
            status: 'ACTIVE',
            reason: 'Initial organizational assignment on onboarding',
            createdById: auth.session.userId,
          },
        });
      }

      // Create Next of Kin records
      if (data.nextOfKin && data.nextOfKin.length > 0) {
        for (const nok of data.nextOfKin) {
          await tx.nextOfKin.create({
            data: {
              employeeId: emp.id,
              fullName: nok.fullName,
              relationship: nok.relationship,
              primaryPhone: nok.primaryPhone,
              alternativePhone: nok.alternativePhone || null,
              email: nok.email || null,
              physicalAddress: nok.physicalAddress || null,
              percentageShare: nok.percentageShare ?? 100,
              isPrimary: nok.isPrimary ?? true,
            },
          });
        }
      }

      // Create Emergency Contact records
      if (data.emergencyContacts && data.emergencyContacts.length > 0) {
        for (const ec of data.emergencyContacts) {
          await tx.emergencyContact.create({
            data: {
              employeeId: emp.id,
              fullName: ec.fullName,
              relationship: ec.relationship,
              primaryPhone: ec.primaryPhone,
              alternativePhone: ec.alternativePhone || null,
              physicalAddress: ec.physicalAddress || null,
            },
          });
        }
      }

      // Initial Career History
      await tx.employeeHistory.create({
        data: {
          employeeId: emp.id,
          changeType: 'INITIAL_ONBOARDING',
          description: `Employee ${fullName} (${employeeNumber}) onboarded as ${data.jobTitle}.`,
          newValue: JSON.stringify({
            employeeNumber,
            jobTitle: data.jobTitle,
            status: data.employmentStatus,
            department: data.departmentId,
            branch: data.branchId,
          }),
          performedById: auth.session.userId,
        },
      });

      return emp;
    });

    await createAuditLog({
      userId: auth.session.userId,
      userEmail: auth.session.email,
      action: 'CREATE_EMPLOYEE',
      module: 'EMPLOYEES',
      entityType: 'EMPLOYEE',
      entityId: newEmployee.id,
      newValue: {
        employeeNumber: newEmployee.employeeNumber,
        fullName: newEmployee.fullName,
        nationalId: newEmployee.nationalId,
        jobTitle: newEmployee.jobTitle,
        status: newEmployee.employmentStatus,
      },
    });

    return apiSuccess(newEmployee, undefined, 201);
  } catch (error) {
    console.error('Create employee error:', error);
    return apiError('Failed to create employee record.');
  }
}
