import { db } from '@/lib/db';
import { createAuditLog } from '@/lib/audit';

export interface InitiateOnboardingInput {
  employeeId: string;
  targetCompletionDate?: Date;
  assignedToId?: string;
  notes?: string;
}

export interface InitiateOffboardingInput {
  employeeId: string;
  exitType: 'RESIGNATION' | 'TERMINATION' | 'RETIREMENT' | 'CONTRACT_EXPIRY' | 'DISMISSAL';
  noticeDate?: Date;
  exitDate: Date;
  reason?: string;
  assignedToId?: string;
  notes?: string;
}

export interface FinalSettlementSummary {
  employeeId: string;
  employeeName: string;
  employeeNumber: string;
  exitDate: string;
  basicSalary: number;
  dailyRate: number;
  unpaidDaysWorked: number;
  unpaidSalaryAmount: number;
  unusedLeaveDays: number;
  leaveEncashmentAmount: number;
  grossSettlement: number;
  outstandingLoans: Array<{ id: string; name: string; balance: number }>;
  totalDeductions: number;
  netPayableSettlement: number;
}

export class EmployeeLifecycleService {
  /**
   * Generates a sequential case number: ONB-YYYYMM-XXXX or OFF-YYYYMM-XXXX
   */
  static async generateCaseNumber(prefix: 'ONB' | 'OFF'): Promise<string> {
    const now = new Date();
    const yearMonth = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
    const prefixFull = `${prefix}-${yearMonth}-`;

    let nextSequence = 1;
    if (prefix === 'ONB') {
      const lastCase = await db.onboardingCase.findFirst({
        where: { caseNumber: { startsWith: prefixFull } },
        orderBy: { caseNumber: 'desc' },
        select: { caseNumber: true },
      });
      if (lastCase) {
        const parts = lastCase.caseNumber.split('-');
        if (parts.length >= 3) {
          const num = parseInt(parts[2], 10);
          if (!isNaN(num)) nextSequence = num + 1;
        }
      }
    } else {
      const lastCase = await db.offboardingCase.findFirst({
        where: { caseNumber: { startsWith: prefixFull } },
        orderBy: { caseNumber: 'desc' },
        select: { caseNumber: true },
      });
      if (lastCase) {
        const parts = lastCase.caseNumber.split('-');
        if (parts.length >= 3) {
          const num = parseInt(parts[2], 10);
          if (!isNaN(num)) nextSequence = num + 1;
        }
      }
    }

    return `${prefixFull}${String(nextSequence).padStart(4, '0')}`;
  }

  // ===========================================================================
  // 1. ONBOARDING WORKFLOW
  // ===========================================================================

  static async initiateOnboarding(input: InitiateOnboardingInput) {
    const existing = await db.onboardingCase.findUnique({
      where: { employeeId: input.employeeId },
      include: { tasks: true },
    });
    if (existing) return existing;

    const caseNumber = await this.generateCaseNumber('ONB');

    const defaultTasks = [
      { taskKey: 'PROFILE_CREATED', title: 'Verify Employee Master Bio & Personal Profile', category: 'GENERAL', order: 1 },
      { taskKey: 'ID_VERIFIED', title: 'Verify National Identification / Passport & KRA PIN', category: 'DOCUMENTS', order: 2 },
      { taskKey: 'DOCS_COLLECTED', title: 'Collect & Upload Signed Employment Contract & Certificates', category: 'DOCUMENTS', order: 3 },
      { taskKey: 'BANK_DETAILS', title: 'Configure & Validate Bank Disbursement Account', category: 'FINANCE', order: 4 },
      { taskKey: 'MPESA_DETAILS', title: 'Configure & Validate M-Pesa Mobile Number', category: 'FINANCE', order: 5 },
      { taskKey: 'ORG_ASSIGNMENT', title: 'Assign Branch, Department, Guarding Station & Position', category: 'OPERATIONS', order: 6 },
      { taskKey: 'SALARY_CONFIG', title: 'Setup Monthly Base Salary, Risk Allowances & Welfare', category: 'FINANCE', order: 7 },
      { taskKey: 'SCHEDULE_CONFIG', title: 'Assign Shift Pattern, Rotation & Site Roster', category: 'OPERATIONS', order: 8 },
      { taskKey: 'PORTAL_ACTIVATED', title: 'Activate Employee Self-Service Portal Access', category: 'IT', order: 9 },
    ];

    const onboardingCase = await db.onboardingCase.create({
      data: {
        employeeId: input.employeeId,
        caseNumber,
        stage: 'INITIATED',
        status: 'IN_PROGRESS',
        targetCompletionDate: input.targetCompletionDate,
        assignedToId: input.assignedToId,
        notes: input.notes,
        tasks: {
          create: defaultTasks.map((t) => ({
            taskKey: t.taskKey,
            title: t.title,
            category: t.category,
            order: t.order,
            isCompleted: false,
          })),
        },
      },
      include: {
        employee: { select: { id: true, fullName: true, employeeNumber: true, jobTitle: true } },
        tasks: { orderBy: { order: 'asc' } },
        assignedTo: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    });

    return onboardingCase;
  }

  static async toggleOnboardingTask(taskId: string, isCompleted: boolean, completedById: string) {
    const task = await db.onboardingTask.update({
      where: { id: taskId },
      data: {
        isCompleted,
        completedAt: isCompleted ? new Date() : null,
        completedById: isCompleted ? completedById : null,
      },
      include: { onboardingCase: { include: { tasks: true } } },
    });

    const allTasks = task.onboardingCase.tasks;
    const completedCount = allTasks.filter((t) => t.isCompleted).length;
    const totalCount = allTasks.length;

    let nextStage = task.onboardingCase.stage;
    let nextStatus = task.onboardingCase.status;

    if (completedCount === 0) {
      nextStage = 'INITIATED';
    } else if (completedCount < 4) {
      nextStage = 'DOCUMENTS';
    } else if (completedCount < 8) {
      nextStage = 'SETUP';
    } else if (completedCount < totalCount) {
      nextStage = 'ORIENTATION';
    } else {
      nextStage = 'COMPLETED';
      nextStatus = 'COMPLETED';
    }

    const updatedCase = await db.onboardingCase.update({
      where: { id: task.onboardingCaseId },
      data: {
        stage: nextStage,
        status: nextStatus,
        completedAt: nextStatus === 'COMPLETED' ? new Date() : null,
      },
      include: { tasks: { orderBy: { order: 'asc' } }, employee: true },
    });

    return { task, onboardingCase: updatedCase };
  }

  // ===========================================================================
  // 2. OFFBOARDING & FINAL SETTLEMENT WORKFLOW
  // ===========================================================================

  static async initiateOffboarding(input: InitiateOffboardingInput) {
    const existing = await db.offboardingCase.findUnique({
      where: { employeeId: input.employeeId },
      include: { tasks: true },
    });
    if (existing) return existing;

    const caseNumber = await this.generateCaseNumber('OFF');

    const defaultClearanceTasks = [
      { taskKey: 'NOTICE_RECORDED', title: 'Formal Resignation / Exit Notice Received & Documented', category: 'HR', order: 1 },
      { taskKey: 'ASSETS_RETURNED', title: 'Security Uniform, Badges, Boots & Company Equipment Returned', category: 'OPERATIONS', order: 2 },
      { taskKey: 'ACCESS_REVOKED', title: 'Station Biometric Access & Portal Credentials Deactivated', category: 'IT', order: 3 },
      { taskKey: 'LEAVE_SETTLEMENT', title: 'Calculate Accrued Unused Annual Leave Days for Encashment', category: 'HR', order: 4 },
      { taskKey: 'LOAN_SETTLEMENT', title: 'Audit Outstanding SACCO Loans, Salary Advances & Equipment Deductions', category: 'FINANCE', order: 5 },
      { taskKey: 'FINAL_PAYROLL_PREPARED', title: 'Compute Final Settlement Payout Breakdown', category: 'FINANCE', order: 6 },
      { taskKey: 'SERVICE_CERTIFICATE', title: 'Prepare Official Certificate of Service / Employment Letter', category: 'HR', order: 7 },
      { taskKey: 'CLEARANCE_APPROVED', title: 'Executive HR Operations & Finance Clearance Authorization', category: 'HR', order: 8 },
    ];

    const settlementSummary = await this.calculateFinalSettlement(input.employeeId, input.exitDate);

    const offboardingCase = await db.offboardingCase.create({
      data: {
        employeeId: input.employeeId,
        caseNumber,
        stage: 'INITIATED',
        status: 'IN_PROGRESS',
        exitType: input.exitType,
        noticeDate: input.noticeDate,
        exitDate: input.exitDate,
        reason: input.reason,
        assignedToId: input.assignedToId,
        finalPayrollSummary: JSON.stringify(settlementSummary),
        notes: input.notes,
        tasks: {
          create: defaultClearanceTasks.map((t) => ({
            taskKey: t.taskKey,
            title: t.title,
            category: t.category,
            order: t.order,
            isCompleted: false,
          })),
        },
      },
      include: {
        employee: { select: { id: true, fullName: true, employeeNumber: true, jobTitle: true, department: true, station: true } },
        tasks: { orderBy: { order: 'asc' } },
        assignedTo: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    });

    // Update employee status to NOTICE_PERIOD if not already exited
    await db.employee.update({
      where: { id: input.employeeId },
      data: {
        employmentStatus: 'NOTICE_PERIOD',
        noticeDate: input.noticeDate || new Date(),
        exitDate: input.exitDate,
        exitReason: input.reason,
      },
    });

    return offboardingCase;
  }

  static async toggleOffboardingTask(taskId: string, isCompleted: boolean, completedById: string) {
    const task = await db.offboardingTask.update({
      where: { id: taskId },
      data: {
        isCompleted,
        completedAt: isCompleted ? new Date() : null,
        completedById: isCompleted ? completedById : null,
      },
      include: { offboardingCase: { include: { tasks: true } } },
    });

    const allTasks = task.offboardingCase.tasks;
    const completedCount = allTasks.filter((t) => t.isCompleted).length;
    const totalCount = allTasks.length;

    let nextStage = task.offboardingCase.stage;
    let nextStatus = task.offboardingCase.status;

    if (completedCount === 0) {
      nextStage = 'INITIATED';
    } else if (completedCount < 2) {
      nextStage = 'NOTICE';
    } else if (completedCount < 5) {
      nextStage = 'CLEARANCE';
    } else if (completedCount < totalCount) {
      nextStage = 'FINAL_PAYROLL';
    } else {
      nextStage = 'EXITED';
      nextStatus = 'COMPLETED';
    }

    const updatedCase = await db.offboardingCase.update({
      where: { id: task.offboardingCaseId },
      data: {
        stage: nextStage,
        status: nextStatus,
        completedAt: nextStatus === 'COMPLETED' ? new Date() : null,
      },
      include: { tasks: { orderBy: { order: 'asc' } }, employee: true },
    });

    return { task, offboardingCase: updatedCase };
  }

  static async completeOffboarding(caseId: string, authorizerUserId: string) {
    const offCase = await db.offboardingCase.findUnique({
      where: { id: caseId },
      include: { employee: true },
    });
    if (!offCase) throw new Error('Offboarding case not found');

    const updatedCase = await db.offboardingCase.update({
      where: { id: caseId },
      data: {
        stage: 'EXITED',
        status: 'COMPLETED',
        completedAt: new Date(),
        clearanceApprovedAt: new Date(),
        clearanceApprovedById: authorizerUserId,
      },
    });

    const newStatus = offCase.exitType === 'TERMINATION' || offCase.exitType === 'DISMISSAL' ? 'TERMINATED' : 'RESIGNED';

    await db.employee.update({
      where: { id: offCase.employeeId },
      data: {
        employmentStatus: newStatus,
        exitDate: offCase.exitDate,
        exitReason: offCase.reason,
      },
    });

    await db.employeeHistory.create({
      data: {
        employeeId: offCase.employeeId,
        changeType: 'STATUS_CHANGE',
        description: `Completed offboarding exit workflow (${offCase.caseNumber}). Status changed to ${newStatus}.`,
        previousValue: JSON.stringify({ status: offCase.employee.employmentStatus }),
        newValue: JSON.stringify({ status: newStatus, exitType: offCase.exitType, exitDate: offCase.exitDate }),
        performedById: authorizerUserId,
      },
    });

    return updatedCase;
  }

  /**
   * Computes the Final Settlement Breakdown for an exiting employee
   * (Unpaid days worked, Leave encashment, Loan deductions, Net settlement)
   */
  static async calculateFinalSettlement(employeeId: string, exitDate: Date): Promise<FinalSettlementSummary> {
    const employee = await db.employee.findUnique({
      where: { id: employeeId },
      include: {
        salaryRecords: { where: { status: 'ACTIVE' }, take: 1 },
        deductionAssignments: { where: { status: 'ACTIVE' }, include: { deductionType: true } },
        leaveEntitlements: { where: { leaveType: { code: 'ANNUAL' } }, include: { leaveType: true } },
      },
    });

    if (!employee) throw new Error(`Employee ${employeeId} not found`);

    const basicSalary = employee.salaryRecords[0]?.basicSalary || 25000;
    const dailyRate = Math.round((basicSalary / 30) * 100) / 100;

    // Unpaid days in exit month (day of month)
    const exitDayOfMonth = exitDate.getDate();
    const unpaidDaysWorked = exitDayOfMonth;
    const unpaidSalaryAmount = Math.round(unpaidDaysWorked * dailyRate * 100) / 100;

    // Leave Encashment
    const annualLeave = employee.leaveEntitlements[0];
    const unusedLeaveDays = annualLeave ? Math.max(0, annualLeave.availableBalance || (annualLeave.entitledDays - annualLeave.usedDays)) : 0;
    const leaveEncashmentAmount = Math.round(unusedLeaveDays * dailyRate * 100) / 100;

    const grossSettlement = Math.round((unpaidSalaryAmount + leaveEncashmentAmount) * 100) / 100;

    // Outstanding loans / deductions
    const outstandingLoans = employee.deductionAssignments.map((d) => ({
      id: d.id,
      name: d.deductionType.name,
      balance: d.currentBalance !== null && d.currentBalance !== undefined ? d.currentBalance : d.amount,
    }));

    const totalDeductions = Math.round(
      outstandingLoans.reduce((sum, l) => sum + (l.balance || 0), 0) * 100
    ) / 100;

    const netPayableSettlement = Math.max(0, Math.round((grossSettlement - totalDeductions) * 100) / 100);

    return {
      employeeId: employee.id,
      employeeName: employee.fullName,
      employeeNumber: employee.employeeNumber,
      exitDate: exitDate.toISOString().split('T')[0],
      basicSalary,
      dailyRate,
      unpaidDaysWorked,
      unpaidSalaryAmount,
      unusedLeaveDays,
      leaveEncashmentAmount,
      grossSettlement,
      outstandingLoans,
      totalDeductions,
      netPayableSettlement,
    };
  }

  // ===========================================================================
  // 3. CONTRACT EXPIRY & RENEWALS
  // ===========================================================================

  static async scanExpiringContracts(daysThreshold = 90) {
    const now = new Date();
    const futureLimit = new Date(now.getTime() + daysThreshold * 24 * 60 * 60 * 1000);

    const contracts = await db.employee.findMany({
      where: {
        employmentType: { in: ['CONTRACT', 'TEMPORARY', 'INTERN'] },
        contractEndDate: { not: null, lte: futureLimit },
        employmentStatus: { notIn: ['TERMINATED', 'RESIGNED', 'RETIRED'] },
      },
      include: {
        department: { select: { id: true, name: true } },
        station: { select: { id: true, name: true } },
        branch: { select: { id: true, name: true } },
      },
      orderBy: { contractEndDate: 'asc' },
    });

    return contracts.map((c) => {
      const diffMs = (c.contractEndDate?.getTime() || 0) - now.getTime();
      const daysRemaining = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

      let alertCategory: 'EXPIRED' | 'CRITICAL_7D' | 'URGENT_14D' | 'HIGH_30D' | 'MEDIUM_60D' | 'NOTICE_90D' = 'NOTICE_90D';
      if (daysRemaining <= 0) alertCategory = 'EXPIRED';
      else if (daysRemaining <= 7) alertCategory = 'CRITICAL_7D';
      else if (daysRemaining <= 14) alertCategory = 'URGENT_14D';
      else if (daysRemaining <= 30) alertCategory = 'HIGH_30D';
      else if (daysRemaining <= 60) alertCategory = 'MEDIUM_60D';

      return {
        id: c.id,
        employeeNumber: c.employeeNumber,
        fullName: c.fullName,
        jobTitle: c.jobTitle,
        employmentType: c.employmentType,
        contractStartDate: c.contractStartDate?.toISOString().split('T')[0] || null,
        contractEndDate: c.contractEndDate?.toISOString().split('T')[0] || null,
        daysRemaining,
        alertCategory,
        department: c.department?.name || 'Unassigned',
        station: c.station?.name || 'Unassigned',
        branch: c.branch?.name || 'Unassigned',
        status: c.employmentStatus,
      };
    });
  }

  static async renewContract(
    employeeId: string,
    newStartDate: Date,
    newEndDate: Date,
    approvedById: string,
    reason: string
  ) {
    const currentEmp = await db.employee.findUnique({ where: { id: employeeId } });
    if (!currentEmp) throw new Error('Employee not found');

    const previousDates = {
      contractStartDate: currentEmp.contractStartDate,
      contractEndDate: currentEmp.contractEndDate,
    };

    const updated = await db.employee.update({
      where: { id: employeeId },
      data: {
        contractStartDate: newStartDate,
        contractEndDate: newEndDate,
        employmentStatus: 'ACTIVE',
      },
    });

    await db.employeeHistory.create({
      data: {
        employeeId,
        changeType: 'STATUS_CHANGE',
        description: `Renewed fixed-term contract until ${newEndDate.toISOString().split('T')[0]}. Reason: ${reason}`,
        previousValue: JSON.stringify(previousDates),
        newValue: JSON.stringify({ contractStartDate: newStartDate, contractEndDate: newEndDate }),
        performedById: approvedById,
      },
    });

    return updated;
  }

  // ===========================================================================
  // 4. PROBATION OUTCOMES
  // ===========================================================================

  static async getProbationPipeline() {
    const now = new Date();
    const employees = await db.employee.findMany({
      where: {
        OR: [
          { employmentStatus: 'ON_PROBATION' },
          { probationStatus: 'IN_PROGRESS' },
          { probationEndDate: { not: null } },
        ],
        employmentStatus: { notIn: ['TERMINATED', 'RESIGNED', 'RETIRED'] },
      },
      include: {
        department: { select: { id: true, name: true } },
        station: { select: { id: true, name: true } },
        supervisor: { select: { id: true, fullName: true } },
      },
      orderBy: { probationEndDate: 'asc' },
    });

    return employees.map((emp) => {
      const diffMs = (emp.probationEndDate?.getTime() || 0) - now.getTime();
      const daysRemaining = emp.probationEndDate ? Math.ceil(diffMs / (1000 * 60 * 60 * 24)) : 0;

      return {
        id: emp.id,
        employeeNumber: emp.employeeNumber,
        fullName: emp.fullName,
        jobTitle: emp.jobTitle,
        department: emp.department?.name || 'Unassigned',
        station: emp.station?.name || 'Unassigned',
        supervisor: emp.supervisor?.fullName || 'None',
        probationStartDate: emp.probationStartDate?.toISOString().split('T')[0] || null,
        probationEndDate: emp.probationEndDate?.toISOString().split('T')[0] || null,
        daysRemaining,
        probationStatus: emp.probationStatus || 'IN_PROGRESS',
        employmentStatus: emp.employmentStatus,
      };
    });
  }

  static async recordProbationOutcome(
    employeeId: string,
    outcome: 'CONFIRM' | 'EXTEND' | 'FAIL',
    approvedById: string,
    details: { newEndDate?: Date; reason: string }
  ) {
    const employee = await db.employee.findUnique({ where: { id: employeeId } });
    if (!employee) throw new Error('Employee not found');

    let newProbationStatus = 'CONFIRMED';
    let newEmploymentStatus = 'ACTIVE';

    if (outcome === 'CONFIRM') {
      newProbationStatus = 'CONFIRMED';
      newEmploymentStatus = 'ACTIVE';
    } else if (outcome === 'EXTEND') {
      newProbationStatus = 'EXTENDED';
      newEmploymentStatus = 'ON_PROBATION';
    } else if (outcome === 'FAIL') {
      newProbationStatus = 'FAILED';
      newEmploymentStatus = 'TERMINATED';
    }

    const updated = await db.employee.update({
      where: { id: employeeId },
      data: {
        probationStatus: newProbationStatus,
        employmentStatus: newEmploymentStatus,
        probationEndDate: outcome === 'EXTEND' && details.newEndDate ? details.newEndDate : employee.probationEndDate,
        exitDate: outcome === 'FAIL' ? new Date() : employee.exitDate,
        exitReason: outcome === 'FAIL' ? details.reason : employee.exitReason,
      },
    });

    await db.employeeHistory.create({
      data: {
        employeeId,
        changeType: 'STATUS_CHANGE',
        description: `Probation review outcome: ${outcome} (${newProbationStatus}). Reason: ${details.reason}`,
        previousValue: JSON.stringify({ probationStatus: employee.probationStatus, employmentStatus: employee.employmentStatus }),
        newValue: JSON.stringify({ probationStatus: newProbationStatus, employmentStatus: newEmploymentStatus, newEndDate: details.newEndDate }),
        performedById: approvedById,
      },
    });

    return updated;
  }

  // ===========================================================================
  // 5. EMPLOYEE MOVEMENT & TRANSFERS
  // ===========================================================================

  static async recordMovement(
    employeeId: string,
    movementType: 'DEPARTMENT_TRANSFER' | 'STATION_TRANSFER' | 'BRANCH_TRANSFER' | 'PROMOTION_JOB_TITLE' | 'SUPERVISOR_CHANGE' | 'STATUS_CHANGE',
    updateData: Record<string, any>,
    reason: string,
    approvedById: string
  ) {
    const currentEmp = await db.employee.findUnique({
      where: { id: employeeId },
      include: { department: true, station: true, branch: true, supervisor: true },
    });
    if (!currentEmp) throw new Error('Employee not found');

    const previousSnapshot: Record<string, any> = {};
    for (const key of Object.keys(updateData)) {
      previousSnapshot[key] = (currentEmp as any)[key];
    }

    const updated = await db.employee.update({
      where: { id: employeeId },
      data: {
        ...updateData,
        updatedAt: new Date(),
      },
    });

    await db.employeeHistory.create({
      data: {
        employeeId,
        changeType: movementType,
        description: `${movementType.replace(/_/g, ' ')}. Reason: ${reason}`,
        previousValue: JSON.stringify(previousSnapshot),
        newValue: JSON.stringify(updateData),
        performedById: approvedById,
      },
    });

    return updated;
  }
}
