import { db } from '@/lib/db';
import { AuditService } from '@/lib/audit';

export class KpiService {
  static async generateKpiCode(departmentCode?: string): Promise<string> {
    const prefix = departmentCode ? `KPI-${departmentCode.slice(0, 3).toUpperCase()}` : 'KPI-GEN';
    let count = (await db.kpiTemplate.count()) + 1;
    let code = `${prefix}-${String(count).padStart(3, '0')}`;
    while (await db.kpiTemplate.findUnique({ where: { code } })) {
      count++;
      code = `${prefix}-${String(count).padStart(3, '0')}`;
    }
    return code;
  }

  static mapAchievementToScore(achievementRate: number): number {
    if (achievementRate >= 120) return 5.0;
    if (achievementRate >= 100) {
      // 100% -> 4.0, 119% -> 4.95
      const score = 4.0 + ((achievementRate - 100) / 20) * 0.95;
      return Math.min(5.0, Math.round(score * 100) / 100);
    }
    if (achievementRate >= 80) {
      // 80% -> 3.0, 99% -> 3.95
      const score = 3.0 + ((achievementRate - 80) / 20) * 0.95;
      return Math.round(score * 100) / 100;
    }
    if (achievementRate >= 60) {
      // 60% -> 2.0, 79% -> 2.95
      const score = 2.0 + ((achievementRate - 60) / 20) * 0.95;
      return Math.round(score * 100) / 100;
    }
    // Below 60%: 1.0 - 1.99
    const score = Math.max(1.0, 1.0 + (achievementRate / 60) * 0.99);
    return Math.round(score * 100) / 100;
  }

  static async createKpiTemplate(data: {
    name: string;
    code?: string;
    description?: string;
    departmentId?: string;
    positionId?: string;
    measurementUnit?: string;
    target: number;
    minThreshold?: number;
    maxThreshold?: number;
    defaultWeight?: number;
    frequency?: string;
    createdById?: string;
  }) {
    let code = data.code;
    if (!code) {
      let deptCode = 'GEN';
      if (data.departmentId) {
        const dept = await db.department.findUnique({ where: { id: data.departmentId } });
        if (dept) deptCode = dept.code;
      }
      code = await this.generateKpiCode(deptCode);
    }

    const template = await db.kpiTemplate.create({
      data: {
        code,
        name: data.name,
        description: data.description,
        departmentId: data.departmentId,
        positionId: data.positionId,
        measurementUnit: data.measurementUnit || 'PERCENTAGE',
        target: data.target,
        minThreshold: data.minThreshold,
        maxThreshold: data.maxThreshold,
        defaultWeight: data.defaultWeight || 10,
        frequency: data.frequency || 'MONTHLY',
        isActive: true,
        createdById: data.createdById,
      },
    });

    if (data.createdById) {
      await AuditService.log({
        userId: data.createdById,
        action: 'CREATE_KPI_TEMPLATE',
        module: 'PERFORMANCE',
        resourceId: template.id,
        newValues: { code: template.code, name: template.name, target: template.target },
      });
    }

    return template;
  }

  static async assignKpiToEmployee(data: {
    kpiId: string;
    employeeId: string;
    cycleId: string;
    customTarget?: number;
    weight?: number;
  }) {
    const kpi = await db.kpiTemplate.findUnique({ where: { id: data.kpiId } });
    if (!kpi) throw new Error('KPI Template not found.');

    const assignment = await db.kpiAssignment.upsert({
      where: {
        kpiId_employeeId_cycleId: {
          kpiId: data.kpiId,
          employeeId: data.employeeId,
          cycleId: data.cycleId,
        },
      },
      update: {
        customTarget: data.customTarget,
        weight: data.weight !== undefined ? data.weight : kpi.defaultWeight,
      },
      create: {
        kpiId: data.kpiId,
        employeeId: data.employeeId,
        cycleId: data.cycleId,
        customTarget: data.customTarget,
        weight: data.weight !== undefined ? data.weight : kpi.defaultWeight,
      },
    });

    return assignment;
  }

  static async recordMeasurement(data: {
    kpiId: string;
    employeeId: string;
    cycleId?: string;
    assignmentId?: string;
    periodName: string;
    target?: number;
    actual: number;
    comments?: string;
    verifiedById?: string;
  }) {
    const kpi = await db.kpiTemplate.findUnique({ where: { id: data.kpiId } });
    if (!kpi) throw new Error('KPI Template not found.');

    const targetVal = data.target !== undefined ? data.target : kpi.target;
    if (targetVal <= 0) throw new Error('KPI target value must be strictly positive.');

    const achievementRate = Math.round((data.actual / targetVal) * 10000) / 100; // e.g. 105.25%
    const score = this.mapAchievementToScore(achievementRate);

    const measurement = await db.kpiMeasurement.create({
      data: {
        kpiId: data.kpiId,
        employeeId: data.employeeId,
        cycleId: data.cycleId,
        assignmentId: data.assignmentId,
        periodName: data.periodName,
        target: targetVal,
        actual: data.actual,
        achievementRate,
        score,
        comments: data.comments,
        verifiedById: data.verifiedById,
        verifiedAt: data.verifiedById ? new Date() : undefined,
      },
    });

    if (data.verifiedById) {
      await AuditService.log({
        userId: data.verifiedById,
        action: 'RECORD_KPI_MEASUREMENT',
        module: 'PERFORMANCE',
        resourceId: measurement.id,
        newValues: {
          employeeId: data.employeeId,
          achievementRate,
          score,
          period: data.periodName,
        },
      });
    }

    return measurement;
  }

  static async verifyMeasurement(measurementId: string, verifiedById: string) {
    const updated = await db.kpiMeasurement.update({
      where: { id: measurementId },
      data: {
        verifiedById,
        verifiedAt: new Date(),
      },
    });

    await AuditService.log({
      userId: verifiedById,
      action: 'VERIFY_KPI_MEASUREMENT',
      module: 'PERFORMANCE',
      resourceId: measurementId,
      newValues: { verifiedAt: updated.verifiedAt },
    });

    return updated;
  }

  static async listKpiTemplates(filters?: { departmentId?: string; positionId?: string; isActive?: boolean }) {
    const where: any = {};
    if (filters?.departmentId && filters.departmentId !== 'ALL') where.departmentId = filters.departmentId;
    if (filters?.positionId && filters.positionId !== 'ALL') where.positionId = filters.positionId;
    if (filters?.isActive !== undefined) where.isActive = filters.isActive;

    return db.kpiTemplate.findMany({
      where,
      orderBy: { code: 'asc' },
      include: {
        department: { select: { id: true, name: true, code: true } },
        position: { select: { id: true, title: true, code: true } },
        _count: { select: { kpiAssignments: true, kpiMeasurements: true } },
      },
    });
  }

  static async calculateEmployeeKpisScore(
    employeeId: string,
    cycleId: string
  ): Promise<{ rawScore: number; totalWeight: number; kpisCount: number; averageAchievement: number }> {
    const measurements = await db.kpiMeasurement.findMany({
      where: { employeeId, cycleId },
      include: { kpi: true },
    });

    if (measurements.length === 0) {
      return { rawScore: 3.0, totalWeight: 0, kpisCount: 0, averageAchievement: 100 };
    }

    let weightedScoreSum = 0;
    let totalWeight = 0;
    let totalAchievement = 0;

    for (const m of measurements) {
      const weight = m.kpi.defaultWeight || 10;
      const score = m.score || this.mapAchievementToScore(m.achievementRate);
      weightedScoreSum += score * weight;
      totalWeight += weight;
      totalAchievement += m.achievementRate;
    }

    const rawScore = totalWeight > 0 ? weightedScoreSum / totalWeight : 3.0;
    const averageAchievement = totalAchievement / measurements.length;

    return {
      rawScore: Math.round(rawScore * 100) / 100,
      totalWeight,
      kpisCount: measurements.length,
      averageAchievement: Math.round(averageAchievement * 100) / 100,
    };
  }
}
