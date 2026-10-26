import { db } from '@/lib/db';
import { AuditService } from '@/lib/audit';

export interface RecordTrainingCostInput {
  sessionId?: string;
  courseId?: string;
  programId?: string;
  departmentId?: string;
  branchId?: string;
  stationId?: string;
  employeeId?: string;
  courseFee?: number;
  trainerFee?: number;
  venueFee?: number;
  materialsCost?: number;
  travelCost?: number;
  accommodationCost?: number;
  otherCost?: number;
  currency?: string;
  notes?: string;
  recordedById?: string;
}

export class CostBudgetService {
  static async generateCostNumber(): Promise<string> {
    const year = new Date().getFullYear();
    let count = (await db.trainingCost.count()) + 1;
    let costNumber = `CST-${year}-${String(count).padStart(4, '0')}`;
    while (await db.trainingCost.findUnique({ where: { costNumber } })) {
      count++;
      costNumber = `CST-${year}-${String(count).padStart(4, '0')}`;
    }
    return costNumber;
  }

  static async recordCost(data: RecordTrainingCostInput) {
    const courseFee = Number(data.courseFee || 0);
    const trainerFee = Number(data.trainerFee || 0);
    const venueFee = Number(data.venueFee || 0);
    const materialsCost = Number(data.materialsCost || 0);
    const travelCost = Number(data.travelCost || 0);
    const accommodationCost = Number(data.accommodationCost || 0);
    const otherCost = Number(data.otherCost || 0);

    const totalCost =
      courseFee + trainerFee + venueFee + materialsCost + travelCost + accommodationCost + otherCost;

    const costNumber = await this.generateCostNumber();

    const cost = await db.trainingCost.create({
      data: {
        costNumber,
        sessionId: data.sessionId,
        courseId: data.courseId,
        programId: data.programId,
        departmentId: data.departmentId,
        branchId: data.branchId,
        stationId: data.stationId,
        employeeId: data.employeeId,
        courseFee,
        trainerFee,
        venueFee,
        materialsCost,
        travelCost,
        accommodationCost,
        otherCost,
        totalCost,
        currency: data.currency || 'KES',
        notes: data.notes,
        recordedById: data.recordedById,
      },
      include: {
        department: true,
        course: true,
        program: true,
      },
    });

    // If department specified, update usedAmount in active budget
    if (data.departmentId) {
      const year = new Date().getFullYear().toString();
      const budget = await db.trainingBudget.findFirst({
        where: { departmentId: data.departmentId, budgetPeriod: year, status: 'ACTIVE' },
      });
      if (budget) {
        const newUsed = budget.usedAmount + totalCost;
        await db.trainingBudget.update({
          where: { id: budget.id },
          data: {
            usedAmount: newUsed,
            remainingAmount: Math.max(0, budget.allocatedAmount - newUsed),
          },
        });
      }
    }

    await AuditService.log({
      userId: data.recordedById,
      action: 'RECORD_TRAINING_COST',
      module: 'TRAINING',
      entityId: cost.id,
      newValue: {
        costNumber: cost.costNumber,
        totalCost: cost.totalCost,
        currency: cost.currency,
        department: cost.department?.name,
      },
    });

    return cost;
  }

  static async setDepartmentBudget(data: {
    budgetPeriod: string;
    departmentId: string;
    allocatedAmount: number;
    approvedById?: string;
  }) {
    const allocated = Number(data.allocatedAmount);
    if (allocated < 0) throw new Error('Allocated budget amount cannot be negative.');

    const existing = await db.trainingBudget.findUnique({
      where: {
        budgetPeriod_departmentId: {
          budgetPeriod: data.budgetPeriod,
          departmentId: data.departmentId,
        },
      },
    });

    const used = existing ? existing.usedAmount : 0;
    const remaining = Math.max(0, allocated - used);

    const budget = await db.trainingBudget.upsert({
      where: {
        budgetPeriod_departmentId: {
          budgetPeriod: data.budgetPeriod,
          departmentId: data.departmentId,
        },
      },
      create: {
        budgetPeriod: data.budgetPeriod,
        departmentId: data.departmentId,
        allocatedAmount: allocated,
        usedAmount: used,
        remainingAmount: remaining,
        approvedById: data.approvedById,
        status: 'ACTIVE',
      },
      update: {
        allocatedAmount: allocated,
        remainingAmount: remaining,
        approvedById: data.approvedById,
      },
      include: {
        department: true,
      },
    });

    await AuditService.log({
      userId: data.approvedById,
      action: 'SET_TRAINING_BUDGET',
      module: 'TRAINING',
      entityId: budget.id,
      newValue: {
        department: budget.department.name,
        period: budget.budgetPeriod,
        allocatedAmount: budget.allocatedAmount,
      },
    });

    return budget;
  }

  static async listBudgets(budgetPeriod?: string) {
    const period = budgetPeriod || new Date().getFullYear().toString();
    return db.trainingBudget.findMany({
      where: { budgetPeriod: period },
      include: { department: true },
      orderBy: { department: { name: 'asc' } },
    });
  }

  static async listCosts(filters: {
    departmentId?: string;
    courseId?: string;
    sessionId?: string;
    branchId?: string;
  }) {
    const where: any = {};
    if (filters.departmentId && filters.departmentId !== 'ALL') where.departmentId = filters.departmentId;
    if (filters.courseId && filters.courseId !== 'ALL') where.courseId = filters.courseId;
    if (filters.sessionId && filters.sessionId !== 'ALL') where.sessionId = filters.sessionId;
    if (filters.branchId && filters.branchId !== 'ALL') where.branchId = filters.branchId;

    return db.trainingCost.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        department: { select: { id: true, name: true, code: true } },
        course: { select: { id: true, title: true, code: true } },
        program: { select: { id: true, name: true } },
        session: { select: { id: true, sessionNumber: true, startDate: true } },
      },
    });
  }

  static async getCostAnalytics(departmentId?: string, periodYear?: string) {
    const year = periodYear || new Date().getFullYear().toString();
    const where: any = {};
    if (departmentId && departmentId !== 'ALL') where.departmentId = departmentId;

    const costs = await db.trainingCost.findMany({ where });
    const totalCost = costs.reduce((sum, c) => sum + c.totalCost, 0);

    const enrolledEmployees = await db.trainingEnrollment.findMany({
      where: {
        status: { in: ['ATTENDED', 'COMPLETED'] },
        employee: departmentId && departmentId !== 'ALL' ? { departmentId } : undefined,
      },
      select: { employeeId: true },
      distinct: ['employeeId'],
    });

    const uniqueEmployeesTrained = enrolledEmployees.length;
    const costPerEmployee = uniqueEmployeesTrained > 0
      ? Math.round((totalCost / uniqueEmployeesTrained) * 100) / 100
      : 0;

    const budgets = await db.trainingBudget.findMany({
      where: { budgetPeriod: year, departmentId: departmentId && departmentId !== 'ALL' ? departmentId : undefined },
    });

    const totalAllocatedBudget = budgets.reduce((sum, b) => sum + b.allocatedAmount, 0);
    const totalUsedBudget = budgets.reduce((sum, b) => sum + b.usedAmount, 0);
    const totalRemainingBudget = Math.max(0, totalAllocatedBudget - totalUsedBudget);
    const budgetUtilizationRate = totalAllocatedBudget > 0
      ? Math.round((totalUsedBudget / totalAllocatedBudget) * 100)
      : 0;

    return {
      totalCost,
      uniqueEmployeesTrained,
      costPerEmployee,
      budget: {
        allocated: totalAllocatedBudget,
        used: totalUsedBudget,
        remaining: totalRemainingBudget,
        utilizationRate: budgetUtilizationRate,
      },
      categoryBreakdown: {
        courseFees: costs.reduce((sum, c) => sum + c.courseFee, 0),
        trainerFees: costs.reduce((sum, c) => sum + c.trainerFee, 0),
        venueFees: costs.reduce((sum, c) => sum + c.venueFee, 0),
        materials: costs.reduce((sum, c) => sum + c.materialsCost, 0),
        travel: costs.reduce((sum, c) => sum + c.travelCost, 0),
        accommodation: costs.reduce((sum, c) => sum + c.accommodationCost, 0),
        other: costs.reduce((sum, c) => sum + c.otherCost, 0),
      },
    };
  }
}
