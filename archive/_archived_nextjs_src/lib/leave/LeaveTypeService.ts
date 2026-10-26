import { db } from '../db';
import { AuditService } from '../audit';

export interface CreateLeaveTypeInput {
  code: string;
  name: string;
  description?: string;
  isPaid?: boolean;
  defaultDays?: number;
  maxDays?: number;
  minNoticeDays?: number;
  accrualEnabled?: boolean;
  carryForwardEnabled?: boolean;
  employmentTypes?: string[]; // e.g. ["PERMANENT", "CONTRACT", "TEMPORARY", "CASUAL"]
  requiresApproval?: boolean;
  requiresDocument?: boolean;
  requiresMedicalCert?: boolean;
  genderApplicability?: 'ALL' | 'MALE' | 'FEMALE';
  color?: string;
  status?: 'ACTIVE' | 'INACTIVE';
  createdById?: string;
}

export class LeaveTypeService {
  static async listLeaveTypes(filters: { status?: string; search?: string } = {}) {
    const where: any = { deletedAt: null };

    if (filters.status && filters.status !== 'ALL') {
      where.status = filters.status;
    }

    if (filters.search) {
      const q = filters.search.trim();
      where.OR = [
        { name: { contains: q } },
        { code: { contains: q } },
        { description: { contains: q } },
      ];
    }

    return db.leaveType.findMany({
      where,
      orderBy: { name: 'asc' },
      include: {
        _count: {
          select: {
            policies: true,
            entitlements: true,
            requests: true,
          },
        },
      },
    });
  }

  static async getLeaveTypeById(id: string) {
    const leaveType = await db.leaveType.findUnique({
      where: { id },
      include: {
        policies: { where: { deletedAt: null } },
        _count: {
          select: {
            policies: true,
            entitlements: true,
            requests: true,
          },
        },
      },
    });

    if (!leaveType || leaveType.deletedAt) {
      throw new Error('Leave type not found.');
    }

    return leaveType;
  }

  static async createLeaveType(data: CreateLeaveTypeInput) {
    if (!data.name || !data.code) {
      throw new Error('Leave type name and unique code are required.');
    }

    const code = data.code.trim().toUpperCase();
    const existing = await db.leaveType.findUnique({ where: { code } });
    if (existing) {
      throw new Error(`Leave type with code '${code}' already exists.`);
    }

    const leaveType = await db.leaveType.create({
      data: {
        code,
        name: data.name.trim(),
        description: data.description,
        isPaid: data.isPaid ?? true,
        defaultDays: data.defaultDays ?? 21,
        maxDays: data.maxDays,
        minNoticeDays: data.minNoticeDays ?? 0,
        accrualEnabled: data.accrualEnabled ?? true,
        carryForwardEnabled: data.carryForwardEnabled ?? true,
        employmentTypes: data.employmentTypes ? JSON.stringify(data.employmentTypes) : null,
        requiresApproval: data.requiresApproval ?? true,
        requiresDocument: data.requiresDocument ?? false,
        requiresMedicalCert: data.requiresMedicalCert ?? false,
        genderApplicability: data.genderApplicability || 'ALL',
        color: data.color || '#2563eb',
        status: data.status || 'ACTIVE',
      },
    });

    await AuditService.log({
      userId: data.createdById,
      action: 'CREATE_LEAVE_TYPE',
      module: 'LEAVE',
      entityId: leaveType.id,
      newValue: { code: leaveType.code, name: leaveType.name, status: leaveType.status },
    });

    return leaveType;
  }

  static async updateLeaveType(id: string, data: Partial<CreateLeaveTypeInput>, userId?: string) {
    const existing = await db.leaveType.findUnique({ where: { id } });
    if (!existing || existing.deletedAt) {
      throw new Error('Leave type not found.');
    }

    if (data.code && data.code.trim().toUpperCase() !== existing.code) {
      const codeCheck = await db.leaveType.findUnique({ where: { code: data.code.trim().toUpperCase() } });
      if (codeCheck) throw new Error(`Leave type code '${data.code}' is already in use.`);
    }

    const updated = await db.leaveType.update({
      where: { id },
      data: {
        code: data.code ? data.code.trim().toUpperCase() : existing.code,
        name: data.name !== undefined ? data.name.trim() : existing.name,
        description: data.description !== undefined ? data.description : existing.description,
        isPaid: data.isPaid !== undefined ? data.isPaid : existing.isPaid,
        defaultDays: data.defaultDays !== undefined ? data.defaultDays : existing.defaultDays,
        maxDays: data.maxDays !== undefined ? data.maxDays : existing.maxDays,
        minNoticeDays: data.minNoticeDays !== undefined ? data.minNoticeDays : existing.minNoticeDays,
        accrualEnabled: data.accrualEnabled !== undefined ? data.accrualEnabled : existing.accrualEnabled,
        carryForwardEnabled: data.carryForwardEnabled !== undefined ? data.carryForwardEnabled : existing.carryForwardEnabled,
        employmentTypes: data.employmentTypes !== undefined ? JSON.stringify(data.employmentTypes) : existing.employmentTypes,
        requiresApproval: data.requiresApproval !== undefined ? data.requiresApproval : existing.requiresApproval,
        requiresDocument: data.requiresDocument !== undefined ? data.requiresDocument : existing.requiresDocument,
        requiresMedicalCert: data.requiresMedicalCert !== undefined ? data.requiresMedicalCert : existing.requiresMedicalCert,
        genderApplicability: data.genderApplicability || existing.genderApplicability,
        color: data.color || existing.color,
        status: data.status || existing.status,
      },
    });

    await AuditService.log({
      userId,
      action: 'UPDATE_LEAVE_TYPE',
      module: 'LEAVE',
      entityId: id,
      previousValue: { code: existing.code, name: existing.name, status: existing.status },
      newValue: { code: updated.code, name: updated.name, status: updated.status },
    });

    return updated;
  }

  static async toggleLeaveTypeStatus(id: string, userId?: string) {
    const existing = await db.leaveType.findUnique({ where: { id } });
    if (!existing || existing.deletedAt) throw new Error('Leave type not found.');

    const newStatus = existing.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    const updated = await db.leaveType.update({
      where: { id },
      data: { status: newStatus },
    });

    await AuditService.log({
      userId,
      action: 'TOGGLE_LEAVE_TYPE_STATUS',
      module: 'LEAVE',
      entityId: id,
      previousValue: { status: existing.status },
      newValue: { status: newStatus },
    });

    return updated;
  }

  static async deleteLeaveType(id: string, userId?: string) {
    const existing = await db.leaveType.findUnique({
      where: { id },
      include: {
        _count: {
          select: { requests: true, entitlements: true },
        },
      },
    });

    if (!existing || existing.deletedAt) throw new Error('Leave type not found.');

    if (existing._count.requests > 0 || existing._count.entitlements > 0) {
      // Soft-delete to preserve immutable historical leave records
      const softDeleted = await db.leaveType.update({
        where: { id },
        data: { status: 'INACTIVE', deletedAt: new Date() },
      });

      await AuditService.log({
        userId,
        action: 'SOFT_DELETE_LEAVE_TYPE',
        module: 'LEAVE',
        entityId: id,
        previousValue: { status: existing.status },
        newValue: { status: 'INACTIVE', deletedAt: new Date() },
      });

      return softDeleted;
    }

    const deleted = await db.leaveType.delete({ where: { id } });
    await AuditService.log({
      userId,
      action: 'DELETE_LEAVE_TYPE',
      module: 'LEAVE',
      entityId: id,
      previousValue: { code: existing.code, name: existing.name },
    });

    return deleted;
  }
}
