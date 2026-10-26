import { db } from '@/lib/db';
import { AuditService } from '@/lib/audit';

export type GoalStatus =
  | 'DRAFT'
  | 'ACTIVE'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'OVERDUE'
  | 'CANCELLED';

export class GoalService {
  static async generateGoalNumber(): Promise<string> {
    const year = new Date().getFullYear();
    let count = (await db.performanceGoal.count()) + 1;
    let goalNumber = `GOAL-${year}-${String(count).padStart(4, '0')}`;
    while (await db.performanceGoal.findUnique({ where: { goalNumber } })) {
      count++;
      goalNumber = `GOAL-${year}-${String(count).padStart(4, '0')}`;
    }
    return goalNumber;
  }

  static async validateEmployeeGoalWeights(
    employeeId: string,
    cycleId: string,
    excludeGoalId?: string
  ): Promise<{ totalWeight: number; isValid: boolean; difference: number }> {
    const goals = await db.performanceGoal.findMany({
      where: {
        employeeId,
        cycleId,
        status: { notIn: ['CANCELLED'] },
        id: excludeGoalId ? { not: excludeGoalId } : undefined,
      },
      select: { weight: true },
    });

    const totalWeight = goals.reduce((sum, g) => sum + (g.weight || 0), 0);
    const rounded = Math.round(totalWeight * 100) / 100;
    const isValid = Math.abs(rounded - 100) < 0.01;
    const difference = Math.round((100 - rounded) * 100) / 100;

    return { totalWeight: rounded, isValid, difference };
  }

  static async createGoal(data: {
    employeeId: string;
    cycleId: string;
    title: string;
    description?: string;
    departmentId?: string;
    positionId?: string;
    category?: string;
    priority?: string;
    weight: number;
    target?: string;
    measurementMethod?: string;
    startDate: Date;
    dueDate: Date;
    status?: GoalStatus;
    createdById?: string;
  }) {
    if (data.weight < 0 || data.weight > 100) {
      throw new Error('Goal weight must be between 0% and 100%.');
    }
    if (data.startDate >= data.dueDate) {
      throw new Error('Goal Start Date must be strictly before Due Date.');
    }

    const employee = await db.employee.findUnique({
      where: { id: data.employeeId },
      select: { id: true, departmentId: true, positionId: true },
    });
    if (!employee) throw new Error('Employee not found.');

    const cycle = await db.performanceCycle.findUnique({ where: { id: data.cycleId } });
    if (!cycle) throw new Error('Performance cycle not found.');

    const goalNumber = await this.generateGoalNumber();

    const goal = await db.performanceGoal.create({
      data: {
        goalNumber,
        employeeId: data.employeeId,
        cycleId: data.cycleId,
        title: data.title,
        description: data.description,
        departmentId: data.departmentId || employee.departmentId,
        positionId: data.positionId || employee.positionId,
        category: data.category || 'OPERATIONAL',
        priority: data.priority || 'MEDIUM',
        weight: data.weight,
        target: data.target,
        measurementMethod: data.measurementMethod,
        startDate: data.startDate,
        dueDate: data.dueDate,
        status: data.status || 'ACTIVE',
        createdById: data.createdById,
      },
    });

    if (data.createdById) {
      await AuditService.log({
        userId: data.createdById,
        action: 'CREATE_PERFORMANCE_GOAL',
        module: 'PERFORMANCE',
        resourceId: goal.id,
        newValues: { goalNumber: goal.goalNumber, title: goal.title, weight: goal.weight },
      });
    }

    return goal;
  }

  static async updateGoal(
    id: string,
    data: {
      title?: string;
      description?: string;
      category?: string;
      priority?: string;
      weight?: number;
      target?: string;
      measurementMethod?: string;
      startDate?: Date;
      dueDate?: Date;
      status?: GoalStatus;
      progressPercentage?: number;
      selfRating?: number;
      selfComment?: string;
      managerRating?: number;
      managerComment?: string;
    },
    userId?: string
  ) {
    const existing = await db.performanceGoal.findUnique({ where: { id } });
    if (!existing) throw new Error('Performance goal not found.');

    if (data.weight !== undefined && (data.weight < 0 || data.weight > 100)) {
      throw new Error('Goal weight must be between 0% and 100%.');
    }
    if (data.progressPercentage !== undefined && (data.progressPercentage < 0 || data.progressPercentage > 100)) {
      throw new Error('Progress percentage must be between 0% and 100%.');
    }
    if (data.selfRating !== undefined && (data.selfRating < 1 || data.selfRating > 5)) {
      throw new Error('Self rating must be between 1.0 and 5.0.');
    }
    if (data.managerRating !== undefined && (data.managerRating < 1 || data.managerRating > 5)) {
      throw new Error('Manager rating must be between 1.0 and 5.0.');
    }

    const updated = await db.performanceGoal.update({
      where: { id },
      data: {
        title: data.title,
        description: data.description,
        category: data.category,
        priority: data.priority,
        weight: data.weight,
        target: data.target,
        measurementMethod: data.measurementMethod,
        startDate: data.startDate,
        dueDate: data.dueDate,
        status: data.status,
        progressPercentage: data.progressPercentage,
        selfRating: data.selfRating,
        selfComment: data.selfComment,
        managerRating: data.managerRating,
        managerComment: data.managerComment,
      },
    });

    if (userId) {
      await AuditService.log({
        userId,
        action: 'UPDATE_PERFORMANCE_GOAL',
        module: 'PERFORMANCE',
        resourceId: id,
        newValues: { status: updated.status, progress: updated.progressPercentage },
      });
    }

    return updated;
  }

  static async listGoals(filters?: {
    employeeId?: string;
    cycleId?: string;
    departmentId?: string;
    status?: string;
  }) {
    const where: any = {};
    if (filters?.employeeId) where.employeeId = filters.employeeId;
    if (filters?.cycleId && filters.cycleId !== 'ALL') where.cycleId = filters.cycleId;
    if (filters?.departmentId && filters.departmentId !== 'ALL') where.departmentId = filters.departmentId;
    if (filters?.status && filters.status !== 'ALL') where.status = filters.status;

    return db.performanceGoal.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        employee: {
          select: {
            id: true,
            employeeNumber: true,
            fullName: true,
            jobTitle: true,
            department: { select: { id: true, name: true } },
          },
        },
        cycle: { select: { id: true, code: true, name: true, status: true } },
      },
    });
  }

  static async calculateEmployeeGoalsScore(
    employeeId: string,
    cycleId: string,
    useManagerRating: boolean = true
  ): Promise<{ rawScore: number; totalWeight: number; goalsCount: number }> {
    const goals = await db.performanceGoal.findMany({
      where: {
        employeeId,
        cycleId,
        status: { notIn: ['CANCELLED'] },
      },
    });

    if (goals.length === 0) return { rawScore: 3.0, totalWeight: 0, goalsCount: 0 };

    let weightedSum = 0;
    let totalWeight = 0;

    for (const g of goals) {
      const rating = useManagerRating
        ? g.managerRating || g.selfRating || 3.0
        : g.selfRating || 3.0;
      const weight = g.weight || 10;
      weightedSum += rating * weight;
      totalWeight += weight;
    }

    const rawScore = totalWeight > 0 ? weightedSum / totalWeight : 3.0;
    return {
      rawScore: Math.round(rawScore * 100) / 100,
      totalWeight,
      goalsCount: goals.length,
    };
  }
}
