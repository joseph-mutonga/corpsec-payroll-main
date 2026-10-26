import { db } from '@/lib/db';
import { AuditService } from '@/lib/audit';

export interface CreateDeviceInput {
  deviceCode: string;
  name: string;
  deviceType?: 'WEB' | 'MOBILE' | 'BIOMETRIC' | 'RFID' | 'MANUAL';
  ipAddress?: string;
  locationName?: string;
  stationId?: string;
  branchId?: string;
  isActive?: boolean;
  createdById?: string;
}

export class AttendanceDeviceService {
  /**
   * Lists registered devices.
   */
  static async listDevices(filters: { stationId?: string; branchId?: string; isActive?: boolean } = {}) {
    const where: any = {};
    if (filters.stationId && filters.stationId !== 'ALL') where.stationId = filters.stationId;
    if (filters.branchId && filters.branchId !== 'ALL') where.branchId = filters.branchId;
    if (filters.isActive !== undefined) where.isActive = filters.isActive;

    return db.attendanceDevice.findMany({
      where,
      orderBy: { name: 'asc' },
      include: {
        station: true,
        branch: true,
      },
    });
  }

  /**
   * Registers a new attendance terminal / device.
   */
  static async createDevice(input: CreateDeviceInput) {
    const existing = await db.attendanceDevice.findUnique({
      where: { deviceCode: input.deviceCode.toUpperCase().trim() },
    });
    if (existing) {
      throw new Error(`Device with code '${input.deviceCode}' is already registered.`);
    }

    const device = await db.attendanceDevice.create({
      data: {
        deviceCode: input.deviceCode.toUpperCase().trim(),
        name: input.name.trim(),
        deviceType: input.deviceType || 'BIOMETRIC',
        ipAddress: input.ipAddress || null,
        locationName: input.locationName || null,
        stationId: input.stationId || null,
        branchId: input.branchId || null,
        isActive: input.isActive ?? true,
      },
      include: { station: true, branch: true },
    });

    if (input.createdById) {
      await AuditService.log({
        userId: input.createdById,
        action: 'REGISTER_ATTENDANCE_DEVICE',
        resource: 'attendance_devices',
        resourceId: device.id,
        details: { code: device.deviceCode, name: device.name, type: device.deviceType },
      });
    }

    return device;
  }

  /**
   * Updates device configuration or heartbeat.
   */
  static async updateDevice(id: string, input: Partial<CreateDeviceInput>, updatedById?: string) {
    const device = await db.attendanceDevice.findUnique({ where: { id } });
    if (!device) throw new Error('Device not found.');

    const updated = await db.attendanceDevice.update({
      where: { id },
      data: {
        ...(input.name ? { name: input.name.trim() } : {}),
        ...(input.deviceType ? { deviceType: input.deviceType } : {}),
        ...(input.ipAddress !== undefined ? { ipAddress: input.ipAddress } : {}),
        ...(input.locationName !== undefined ? { locationName: input.locationName } : {}),
        ...(input.stationId !== undefined ? { stationId: input.stationId || null } : {}),
        ...(input.branchId !== undefined ? { branchId: input.branchId || null } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      },
      include: { station: true, branch: true },
    });

    if (updatedById) {
      await AuditService.log({
        userId: updatedById,
        action: 'UPDATE_ATTENDANCE_DEVICE',
        resource: 'attendance_devices',
        resourceId: id,
        details: { changes: input },
      });
    }

    return updated;
  }
}
