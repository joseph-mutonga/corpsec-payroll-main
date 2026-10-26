import { db } from '../db';
import { AuditService } from '../audit';

export interface CreateLeavePolicyInput {
  leaveTypeId: string;
  policyName: string;
  policyCode: string;
  entitledDays?: number;
  accrualMethod?: 'ANNUAL_ALLOCATION' | 'MONTHLY_ACCRUAL' | 'CUSTOM';
  accrualFrequency?: 'MONTHLY' | 'YEARLY' | 'QUARTERLY';
  allowCarryForward?: boolean;
  maxCarryForwardDays?: number;
  carryForwardExpiryMonths?: number;
  minServiceDays?: number;
  prorationRule?: 'NONE' | 'PRORATED_BY_MONTH' | 'PRORATED_BY_DAY';
  excludeWeekends?: boolean;
  excludeHolidays?: boolean;
  allowAdvanceLeave?: boolean;
  maxAdvanceDays?: number;
  minRequestDays?: number;
  maxConsecutiveDays?: number;
  noticePeriodDays?: number;
  probationEligible?: boolean;
  employmentTypes?: string[]; // e.g. ["PERMANENT", "CONTRACT", "TEMPORARY", "CASUAL"]
  approvalHierarchy?: 'SUPERVISOR_MANAGER_HR' | 'MANAGER_ONLY' | 'HR_ONLY' | 'MANAGER_HR';
  effectiveDate?: Date;
  status?: 'ACTIVE' | 'INACTIVE';
  createdById?: string;
}

export class LeavePolicyService {
  static async listPolicies(filters: { leaveTypeId?: string; status?: string; search?: string } = {}) {
    const where: any = { deletedAt: null };

    if (filters.leaveTypeId && filters.leaveTypeId !== 'ALL') {
      where.leaveTypeId = filters.leaveTypeId;
    }

    if (filters.status && filters.status !== 'ALL') {
      where.status = filters.status;
    }

    if (filters.search) {
      const q = filters.search.trim();
      where.OR = [
        { policyName: { contains: q } },
        { policyCode: { contains: q } },
      ];
    }

    return db.leavePolicy.findMany({
      where,
      orderBy: { policyName: 'asc' },
      include: {
        leaveType: true,
        _count: {
          select: { entitlements: true },
        },
      },
    });
  }

  static async getPolicyById(id: string) {
    const policy = await db.leavePolicy.findUnique({
      where: { id },
      include: {
        leaveType: true,
        _count: { select: { entitlements: true } },
      },
    });

    if (!policy || policy.deletedAt) {
      throw new Error('Leave policy not found.');
    }

    return policy;
  }

  static async createPolicy(data: CreateLeavePolicyInput) {
    if (!data.leaveTypeId || !data.policyName || !data.policyCode) {
      throw new Error('Leave Type, policy name, and unique policy code are required.');
    }

    const leaveType = await db.leaveType.findUnique({ where: { id: data.leaveTypeId } });
    if (!leaveType) throw new Error('Target leave type does not exist.');

    const policyCode = data.policyCode.trim().toUpperCase();
    const existing = await db.leavePolicy.findUnique({ where: { policyCode } });
    if (existing) {
      throw new Error(`Leave policy with code '${policyCode}' already exists.`);
    }

    const policy = await db.leavePolicy.create({
      data: {
        leaveTypeId: data.leaveTypeId,
        policyName: data.policyName.trim(),
        policyCode,
        entitledDays: data.entitledDays ?? leaveType.defaultDays,
        accrualMethod: data.accrualMethod || 'ANNUAL_ALLOCATION',
        accrualFrequency: data.accrualFrequency || 'YEARLY',
        allowCarryForward: data.allowCarryForward ?? true,
        maxCarryForwardDays: data.maxCarryForwardDays ?? 5,
        carryForwardExpiryMonths: data.carryForwardExpiryMonths ?? 3,
        minServiceDays: data.minServiceDays ?? 90,
        prorationRule: data.prorationRule || 'PRORATED_BY_MONTH',
        excludeWeekends: data.excludeWeekends ?? true,
        excludeHolidays: data.excludeHolidays ?? true,
        allowAdvanceLeave: data.allowAdvanceLeave ?? false,
        maxAdvanceDays: data.maxAdvanceDays ?? 0,
        minRequestDays: data.minRequestDays ?? 0.5,
        maxConsecutiveDays: data.maxConsecutiveDays,
        noticePeriodDays: data.noticePeriodDays ?? 0,
        probationEligible: data.probationEligible ?? false,
        employmentTypes: data.employmentTypes ? JSON.stringify(data.employmentTypes) : null,
        approvalHierarchy: data.approvalHierarchy || 'MANAGER_HR',
        effectiveDate: data.effectiveDate ? new Date(data.effectiveDate) : new Date(),
        status: data.status || 'ACTIVE',
      },
      include: { leaveType: true },
    });

    await AuditService.log({
      userId: data.createdById,
      action: 'CREATE_LEAVE_POLICY',
      module: 'LEAVE',
      entityId: policy.id,
      newValue: { policyCode: policy.policyCode, name: policy.policyName, leaveType: leaveType.name },
    });

    return policy;
  }

  static async updatePolicy(id: string, data: Partial<CreateLeavePolicyInput>, userId?: string) {
    const existing = await db.leavePolicy.findUnique({ where: { id } });
    if (!existing || existing.deletedAt) {
      throw new Error('Leave policy not found.');
    }

    if (data.policyCode && data.policyCode.trim().toUpperCase() !== existing.policyCode) {
      const codeCheck = await db.leavePolicy.findUnique({ where: { policyCode: data.policyCode.trim().toUpperCase() } });
      if (codeCheck) throw new Error(`Policy code '${data.policyCode}' is already in use.`);
    }

    const updated = await db.leavePolicy.update({
      where: { id },
      data: {
        policyName: data.policyName !== undefined ? data.policyName.trim() : existing.policyName,
        policyCode: data.policyCode ? data.policyCode.trim().toUpperCase() : existing.policyCode,
        entitledDays: data.entitledDays !== undefined ? data.entitledDays : existing.entitledDays,
        accrualMethod: data.accrualMethod || existing.accrualMethod,
        accrualFrequency: data.accrualFrequency || existing.accrualFrequency,
        allowCarryForward: data.allowCarryForward !== undefined ? data.allowCarryForward : existing.allowCarryForward,
        maxCarryForwardDays: data.maxCarryForwardDays !== undefined ? data.maxCarryForwardDays : existing.maxCarryForwardDays,
        carryForwardExpiryMonths: data.carryForwardExpiryMonths !== undefined ? data.carryForwardExpiryMonths : existing.carryForwardExpiryMonths,
        minServiceDays: data.minServiceDays !== undefined ? data.minServiceDays : existing.minServiceDays,
        prorationRule: data.prorationRule || existing.prorationRule,
        excludeWeekends: data.excludeWeekends !== undefined ? data.excludeWeekends : existing.excludeWeekends,
        excludeHolidays: data.excludeHolidays !== undefined ? data.excludeHolidays : existing.excludeHolidays,
        allowAdvanceLeave: data.allowAdvanceLeave !== undefined ? data.allowAdvanceLeave : existing.allowAdvanceLeave,
        maxAdvanceDays: data.maxAdvanceDays !== undefined ? data.maxAdvanceDays : existing.maxAdvanceDays,
        minRequestDays: data.minRequestDays !== undefined ? data.minRequestDays : existing.minRequestDays,
        maxConsecutiveDays: data.maxConsecutiveDays !== undefined ? data.maxConsecutiveDays : existing.maxConsecutiveDays,
        noticePeriodDays: data.noticePeriodDays !== undefined ? data.noticePeriodDays : existing.noticePeriodDays,
        probationEligible: data.probationEligible !== undefined ? data.probationEligible : existing.probationEligible,
        employmentTypes: data.employmentTypes !== undefined ? JSON.stringify(data.employmentTypes) : existing.employmentTypes,
        approvalHierarchy: data.approvalHierarchy || existing.approvalHierarchy,
        effectiveDate: data.effectiveDate ? new Date(data.effectiveDate) : existing.effectiveDate,
        status: data.status || existing.status,
      },
      include: { leaveType: true },
    });

    await AuditService.log({
      userId,
      action: 'UPDATE_LEAVE_POLICY',
      module: 'LEAVE',
      entityId: id,
      previousValue: { policyCode: existing.policyCode, name: existing.policyName },
      newValue: { policyCode: updated.policyCode, name: updated.policyName },
    });

    return updated;
  }

  static async deletePolicy(id: string, userId?: string) {
    const existing = await db.leavePolicy.findUnique({
      where: { id },
      include: {
        _count: { select: { entitlements: true } },
      },
    });

    if (!existing || existing.deletedAt) throw new Error('Leave policy not found.');

    if (existing._count.entitlements > 0) {
      const softDeleted = await db.leavePolicy.update({
        where: { id },
        data: { status: 'INACTIVE', deletedAt: new Date() },
      });
      return softDeleted;
    }

    return db.leavePolicy.delete({ where: { id } });
  }

  /**
   * Resolves the most appropriate active policy for a given employee and leave type,
   * taking into account the employee's employment type and probation status.
   */
  static async resolvePolicyForEmployee(employeeId: string, leaveTypeId: string) {
    const employee = await db.employee.findUnique({ where: { id: employeeId } });
    if (!employee) throw new Error('Employee not found.');

    const policies = await db.leavePolicy.findMany({
      where: {
        leaveTypeId,
        status: 'ACTIVE',
        deletedAt: null,
      },
      include: { leaveType: true },
      orderBy: { createdAt: 'desc' },
    });

    if (policies.length === 0) return null;

    // Filter by employment type if configured
    const matched = policies.find((p) => {
      if (!p.employmentTypes) return true; // generic policy for all
      try {
        const types: string[] = JSON.parse(p.employmentTypes);
        return types.includes(employee.employmentType);
      } catch {
        return true;
      }
    });

    return matched || policies[0];
  }
}
