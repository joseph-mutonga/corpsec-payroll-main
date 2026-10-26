import { db } from '@/lib/db';
import { createAuditLog } from '@/lib/audit';
import { EmployeeLifecycleService } from '@/lib/hr/EmployeeLifecycleService';

export interface ConvertCandidateInput {
  candidateId: string;
  nationalId: string;
  gender: 'MALE' | 'FEMALE' | 'OTHER';
  dateOfBirth?: Date | string;
  startDate?: Date | string;
  departmentId?: string;
  stationId?: string;
  branchId?: string;
  positionId?: string;
  jobTitle?: string;
  employmentType?: string;
  basicSalary?: number;
  assignedRecruiterId?: string;
}

export class HiringService {
  /**
   * Generates next sequential Employee Number: CORP-XXXXXX (e.g. CORP-000016)
   */
  static async generateEmployeeNumber(): Promise<string> {
    const lastEmployee = await db.employee.findFirst({
      where: { employeeNumber: { startsWith: 'CORP-' } },
      orderBy: { employeeNumber: 'desc' },
      select: { employeeNumber: true },
    });

    let seq = 1;
    if (lastEmployee) {
      const parts = lastEmployee.employeeNumber.split('-');
      if (parts.length >= 2) {
        const num = parseInt(parts[1], 10);
        if (!isNaN(num)) seq = num + 1;
      }
    }
    return `CORP-${String(seq).padStart(6, '0')}`;
  }

  /**
   * Convert Accepted Candidate to Formal Employee & Trigger Onboarding
   */
  static async convertCandidateToEmployee(input: ConvertCandidateInput, currentUserId?: string) {
    const candidate = await db.candidate.findUnique({
      where: { id: input.candidateId },
      include: {
        vacancy: {
          include: { department: true, station: true, position: true, branch: true },
        },
        offers: {
          where: { status: { in: ['ACCEPTED', 'APPROVED', 'SENT'] } },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    if (!candidate) throw new Error('Candidate record not found.');

    if (candidate.employeeId) {
      throw new Error(`Candidate is already converted to Employee (ID: ${candidate.employeeId}). Duplicate conversion blocked.`);
    }

    const nationalIdClean = input.nationalId.trim();
    if (!nationalIdClean) {
      throw new Error('National ID is required to create a formal employee record.');
    }

    // Verify nationalId uniqueness in employee directory
    const existingNatId = await db.employee.findUnique({ where: { nationalId: nationalIdClean } });
    if (existingNatId) {
      throw new Error(`An employee with National ID ${nationalIdClean} already exists (${existingNatId.fullName} - ${existingNatId.employeeNumber}).`);
    }

    const offer = candidate.offers[0];
    const startDate = input.startDate
      ? new Date(input.startDate)
      : offer?.startDate
      ? new Date(offer.startDate)
      : new Date();

    const basicSalary = input.basicSalary || offer?.proposedSalary || candidate.vacancy.minSalary || 25000;
    const departmentId = input.departmentId || offer?.departmentId || candidate.vacancy.departmentId;
    const stationId = input.stationId || offer?.stationId || candidate.vacancy.stationId;
    const branchId = input.branchId || candidate.vacancy.branchId;
    const positionId = input.positionId || offer?.positionId || candidate.vacancy.positionId;
    const employmentType = input.employmentType || offer?.employmentType || candidate.vacancy.employmentType || 'PERMANENT';
    const jobTitle = input.jobTitle || candidate.vacancy.position?.title || candidate.vacancy.title;

    // Parse candidate full name
    const nameParts = candidate.fullName.trim().split(' ');
    const firstName = nameParts[0] || 'Employee';
    const lastName = nameParts.length > 1 ? nameParts[nameParts.length - 1] : 'Staff';
    const middleName = nameParts.length > 2 ? nameParts.slice(1, -1).join(' ') : undefined;

    const employeeNumber = await this.generateEmployeeNumber();

    // Execute atomic transaction for Employee, Salary, Assignment, Candidate status update
    const result = await db.$transaction(async (tx) => {
      // 1. Create Employee master record
      const newEmployee = await tx.employee.create({
        data: {
          employeeNumber,
          firstName,
          middleName,
          lastName,
          fullName: candidate.fullName.trim(),
          nationalId: nationalIdClean,
          dateOfBirth: input.dateOfBirth ? new Date(input.dateOfBirth) : undefined,
          gender: input.gender || 'OTHER',
          email: candidate.email,
          primaryPhone: candidate.phone,
          physicalAddress: candidate.location,
          employmentDate: startDate,
          contractStartDate: startDate,
          employmentType,
          jobTitle,
          positionId,
          departmentId,
          branchId,
          stationId,
          employmentStatus: 'ACTIVE',
          probationStatus: 'IN_PROGRESS',
          probationStartDate: startDate,
          probationEndDate: new Date(startDate.getTime() + 90 * 24 * 60 * 60 * 1000), // 90 days probation
        },
      });

      // 2. Create Initial Active Salary Record
      await tx.salaryRecord.create({
        data: {
          employeeId: newEmployee.id,
          basicSalary,
          effectiveFrom: startDate,
          status: 'ACTIVE',
          changeReason: 'Initial appointment from recruitment conversion',
          approvedById: currentUserId,
          approvedAt: new Date(),
        },
      });

      // 3. Create Initial Employee Assignment Record
      if (branchId && departmentId) {
        await tx.employeeAssignment.create({
          data: {
            employeeId: newEmployee.id,
            branchId,
            departmentId,
            stationId,
            positionId,
            jobTitle,
            startDate,
            status: 'ACTIVE',
            reason: 'Initial assignment upon hire',
            createdById: currentUserId,
          },
        });
      }

      // 4. Update Candidate to HIRED and link employeeId
      await tx.candidate.update({
        where: { id: candidate.id },
        data: {
          currentStage: 'HIRED',
          employeeId: newEmployee.id,
          convertedAt: new Date(),
          stageHistories: {
            create: {
              fromStage: candidate.currentStage,
              toStage: 'HIRED',
              reason: `Converted to Employee ${employeeNumber} (${newEmployee.fullName}) with basic salary KES ${basicSalary}`,
              changedById: currentUserId,
            },
          },
        },
      });

      return newEmployee;
    });

    // 5. Automatically initiate Phase 11 Onboarding Case
    let onboardingCase: any = null;
    try {
      onboardingCase = await EmployeeLifecycleService.initiateOnboarding({
        employeeId: result.id,
        assignedToId: currentUserId || candidate.assignedRecruiterId || undefined,
        notes: `Automatically initiated from Candidate Hiring conversion (${candidate.applicationNumber} - ${candidate.fullName})`,
      });
    } catch (e: any) {
      console.warn('Could not auto-initiate onboarding case:', e.message);
    }

    if (currentUserId) {
      await createAuditLog({
        userId: currentUserId,
        action: 'CANDIDATE_HIRE_CONVERT',
        module: 'RECRUITMENT',
        entityType: 'RECRUITMENT',
        entityId: candidate.id,
        newValue: {
          employeeNumber: result.employeeNumber,
          fullName: result.fullName,
          basicSalary,
        },
      });
    }

    return {
      success: true,
      employee: result,
      onboardingCase,
    };
  }
}
