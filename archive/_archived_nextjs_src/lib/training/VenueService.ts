import { db } from '@/lib/db';
import { AuditService } from '@/lib/audit';

export interface CreateVenueInput {
  name: string;
  branchId?: string;
  stationId?: string;
  physicalAddress?: string;
  capacity: number;
  contactPerson?: string;
  contactPhone?: string;
  facilities?: string;
  status?: 'ACTIVE' | 'INACTIVE' | 'MAINTENANCE';
  userId?: string;
}

export class VenueService {
  static async createVenue(data: CreateVenueInput) {
    if (data.capacity < 1) {
      throw new Error('Venue capacity must be at least 1 person.');
    }

    const venue = await db.trainingVenue.create({
      data: {
        name: data.name.trim(),
        branchId: data.branchId,
        stationId: data.stationId,
        physicalAddress: data.physicalAddress,
        capacity: Number(data.capacity),
        contactPerson: data.contactPerson,
        contactPhone: data.contactPhone,
        facilities: data.facilities,
        status: data.status || 'ACTIVE',
      },
      include: {
        branch: true,
        station: true,
      },
    });

    await AuditService.log({
      userId: data.userId,
      action: 'CREATE_TRAINING_VENUE',
      module: 'TRAINING',
      entityId: venue.id,
      newValue: { name: venue.name, capacity: venue.capacity, status: venue.status },
    });

    return venue;
  }

  static async updateVenue(id: string, data: Partial<CreateVenueInput>, userId?: string) {
    const existing = await db.trainingVenue.findUnique({ where: { id } });
    if (!existing) throw new Error('Training venue not found.');

    if (data.capacity !== undefined && Number(data.capacity) < 1) {
      throw new Error('Venue capacity must be at least 1 person.');
    }

    const updated = await db.trainingVenue.update({
      where: { id },
      data: {
        name: data.name !== undefined ? data.name.trim() : existing.name,
        branchId: data.branchId !== undefined ? data.branchId : existing.branchId,
        stationId: data.stationId !== undefined ? data.stationId : existing.stationId,
        physicalAddress: data.physicalAddress !== undefined ? data.physicalAddress : existing.physicalAddress,
        capacity: data.capacity !== undefined ? Number(data.capacity) : existing.capacity,
        contactPerson: data.contactPerson !== undefined ? data.contactPerson : existing.contactPerson,
        contactPhone: data.contactPhone !== undefined ? data.contactPhone : existing.contactPhone,
        facilities: data.facilities !== undefined ? data.facilities : existing.facilities,
        status: data.status || existing.status,
      },
      include: {
        branch: true,
        station: true,
      },
    });

    await AuditService.log({
      userId,
      action: 'UPDATE_TRAINING_VENUE',
      module: 'TRAINING',
      entityId: id,
      previousValue: { name: existing.name, capacity: existing.capacity },
      newValue: { name: updated.name, capacity: updated.capacity },
    });

    return updated;
  }

  static async getVenueById(id: string) {
    const venue = await db.trainingVenue.findUnique({
      where: { id },
      include: {
        branch: true,
        station: true,
        sessions: {
          orderBy: { startDate: 'desc' },
          include: {
            course: true,
            trainer: true,
            _count: { select: { enrollments: true } },
          },
        },
      },
    });
    if (!venue) throw new Error('Training venue not found.');
    return venue;
  }

  static async listVenues(filters: { search?: string; branchId?: string; status?: string }) {
    const where: any = {};
    if (filters.status && filters.status !== 'ALL') where.status = filters.status;
    if (filters.branchId && filters.branchId !== 'ALL') where.branchId = filters.branchId;
    if (filters.search) {
      const q = filters.search.trim();
      where.OR = [
        { name: { contains: q } },
        { physicalAddress: { contains: q } },
        { facilities: { contains: q } },
      ];
    }

    return db.trainingVenue.findMany({
      where,
      orderBy: { name: 'asc' },
      include: {
        branch: true,
        station: true,
        _count: { select: { sessions: true } },
      },
    });
  }

  static async validateVenueCapacity(venueId: string, requestedCapacity: number) {
    const venue = await db.trainingVenue.findUnique({ where: { id: venueId } });
    if (!venue) throw new Error('Venue not found.');
    if (requestedCapacity > venue.capacity) {
      throw new Error(
        `Session capacity (${requestedCapacity}) exceeds venue maximum capacity (${venue.capacity} for ${venue.name}).`
      );
    }
    return true;
  }
}
