import { db } from '@/lib/db';
import { HRRequestType, HRRequestStatus, HRRequestPriority } from '@/types';

export interface CreateHRRequestInput {
  employeeId: string;
  requestType: HRRequestType;
  subject: string;
  description: string;
  priority?: HRRequestPriority;
  proposedData?: Record<string, any> | null;
  previousData?: Record<string, any> | null;
}

export interface ReviewHRRequestInput {
  requestId: string;
  status: HRRequestStatus;
  employeeVisibleResponse?: string;
  internalHrNotes?: string;
  rejectionReason?: string;
  assignedToId?: string;
  reviewerUserId: string;
}

export class HRRequestService {
  /**
   * Generates a sequential monthly request number e.g. REQ-202608-0001
   */
  public static async generateRequestNumber(): Promise<string> {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const prefix = `REQ-${year}${month}-`;

    const lastRequest = await db.hRRequest.findFirst({
      where: {
        requestNumber: {
          startsWith: prefix,
        },
      },
      orderBy: {
        requestNumber: 'desc',
      },
      select: {
        requestNumber: true,
      },
    });

    let nextSequence = 1;
    if (lastRequest) {
      const parts = lastRequest.requestNumber.split('-');
      if (parts.length >= 3) {
        const lastSeq = parseInt(parts[2], 10);
        if (!isNaN(lastSeq)) {
          nextSequence = lastSeq + 1;
        }
      }
    }

    return `${prefix}${String(nextSequence).padStart(4, '0')}`;
  }

  /**
   * Submits a new HR service desk ticket or change request
   */
  public static async createRequest(input: CreateHRRequestInput) {
    const employee = await db.employee.findUnique({
      where: { id: input.employeeId },
      select: { id: true, fullName: true, employeeNumber: true, userId: true },
    });

    if (!employee) {
      throw new Error('Employee record not found');
    }

    const requestNumber = await this.generateRequestNumber();

    const request = await db.hRRequest.create({
      data: {
        requestNumber,
        employeeId: input.employeeId,
        requestType: input.requestType,
        subject: input.subject.trim(),
        description: input.description.trim(),
        priority: input.priority || 'MEDIUM',
        status: 'SUBMITTED',
        proposedData: input.proposedData ? JSON.stringify(input.proposedData) : null,
        previousData: input.previousData ? JSON.stringify(input.previousData) : null,
      },
      include: {
        employee: {
          select: {
            id: true,
            employeeNumber: true,
            fullName: true,
            jobTitle: true,
          },
        },
      },
    });

    // Notify HR Admins and Managers about new incoming request
    const hrUsers = await db.user.findMany({
      where: {
        isActive: true,
        userRoles: {
          some: {
            role: {
              name: { in: ['super_admin', 'hr_admin', 'hr_manager'] },
            },
          },
        },
      },
      select: { id: true },
    });

    if (hrUsers.length > 0) {
      await db.systemNotification.createMany({
        data: hrUsers.map((u) => ({
          userId: u.id,
          title: `New HR Request: ${requestNumber}`,
          message: `${employee.fullName} (${employee.employeeNumber}) submitted a ${input.requestType.replace(/_/g, ' ')}: "${input.subject}"`,
          type: 'info',
          link: '/hr/requests',
        })),
      });
    }

    // Confirmation notification to employee if they have a linked user account
    if (employee.userId) {
      await db.systemNotification.create({
        data: {
          userId: employee.userId,
          title: `HR Request Submitted: ${requestNumber}`,
          message: `Your request "${input.subject}" has been successfully received by HR Operations.`,
          type: 'success',
          link: '/employee/requests',
        },
      });
    }

    return request;
  }

  /**
   * Retrieves requests for a specific employee.
   * Internal HR notes are strictly scrubbed for employee privacy/security.
   */
  public static async getEmployeeRequests(employeeId: string) {
    const requests = await db.hRRequest.findMany({
      where: { employeeId },
      orderBy: { createdAt: 'desc' },
      include: {
        assignedTo: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        reviewedBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        documents: true,
      },
    });

    // Strip internal notes
    return requests.map((req) => ({
      ...req,
      internalHrNotes: null,
    }));
  }

  /**
   * Retrieves a single request with strict internal notes confidentiality
   */
  public static async getRequestById(requestId: string, isHRAdmin: boolean) {
    const request = await db.hRRequest.findUnique({
      where: { id: requestId },
      include: {
        employee: {
          select: {
            id: true,
            employeeNumber: true,
            fullName: true,
            jobTitle: true,
            department: { select: { name: true } },
            station: { select: { name: true } },
            primaryPhone: true,
            email: true,
            preferredPaymentMethod: true,
            bankName: true,
            bankAccountNumber: true,
            mpesaPhoneNumber: true,
          },
        },
        assignedTo: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        reviewedBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        documents: true,
      },
    });

    if (!request) return null;

    if (!isHRAdmin) {
      return {
        ...request,
        internalHrNotes: null,
      };
    }

    return request;
  }

  /**
   * HR Staff administrative review, approval, rejection, or resolution
   */
  public static async reviewRequest(input: ReviewHRRequestInput) {
    const request = await db.hRRequest.findUnique({
      where: { id: input.requestId },
      include: { employee: true },
    });

    if (!request) {
      throw new Error('HR Request not found');
    }

    const isFinalDecision =
      input.status === 'APPROVED' ||
      input.status === 'REJECTED' ||
      input.status === 'RESOLVED' ||
      input.status === 'CANCELLED';

    // Update the request ticket
    const updated = await db.hRRequest.update({
      where: { id: input.requestId },
      data: {
        status: input.status,
        employeeVisibleResponse: input.employeeVisibleResponse || request.employeeVisibleResponse,
        internalHrNotes: input.internalHrNotes !== undefined ? input.internalHrNotes : request.internalHrNotes,
        rejectionReason: input.rejectionReason || request.rejectionReason,
        assignedToId: input.assignedToId !== undefined ? input.assignedToId : request.assignedToId,
        reviewedById: input.reviewerUserId,
        reviewedAt: isFinalDecision ? new Date() : request.reviewedAt,
        resolvedAt: input.status === 'RESOLVED' || input.status === 'APPROVED' ? new Date() : request.resolvedAt,
      },
    });

    // If APPROVED, apply automated changes where applicable
    if (input.status === 'APPROVED' && request.proposedData) {
      try {
        const proposed = JSON.parse(request.proposedData);
        await this.applyApprovedChanges(request, proposed, input.reviewerUserId);
      } catch (err: any) {
        console.error('Error applying approved request changes:', err);
      }
    }

    // Send notification to employee
    if (request.employee.userId) {
      const statusTitle =
        input.status === 'APPROVED'
          ? 'Approved'
          : input.status === 'REJECTED'
          ? 'Rejected'
          : input.status === 'RESOLVED'
          ? 'Resolved'
          : 'Updated';

      await db.systemNotification.create({
        data: {
          userId: request.employee.userId,
          title: `HR Request ${request.requestNumber} ${statusTitle}`,
          message:
            input.employeeVisibleResponse ||
            `Your request "${request.subject}" has been marked as ${input.status}.`,
          type:
            input.status === 'APPROVED' || input.status === 'RESOLVED'
              ? 'success'
              : input.status === 'REJECTED'
              ? 'alert'
              : 'info',
          link: '/employee/requests',
        },
      });
    }

    return updated;
  }

  /**
   * Applies approved profile updates, bank changes, or M-Pesa updates directly to Employee record with audit history
   */
  private static async applyApprovedChanges(
    request: any,
    proposed: Record<string, any>,
    reviewerUserId: string
  ) {
    const empId = request.employeeId;
    const currentEmp = await db.employee.findUnique({ where: { id: empId } });
    if (!currentEmp) return;

    const allowedFields = [
      'primaryPhone',
      'alternativePhone',
      'email',
      'physicalAddress',
      'postalAddress',
      'townCity',
      'county',
      'preferredPaymentMethod',
      'bankName',
      'bankAccountName',
      'bankAccountNumber',
      'bankBranch',
      'bankBranchCode',
      'mpesaPhoneNumber',
    ];

    const updateData: Record<string, any> = {};
    const changesAudit: Record<string, { from: any; to: any }> = {};

    for (const field of allowedFields) {
      if (proposed[field] !== undefined && proposed[field] !== (currentEmp as any)[field]) {
        updateData[field] = proposed[field];
        changesAudit[field] = {
          from: (currentEmp as any)[field],
          to: proposed[field],
        };
      }
    }

    if (Object.keys(updateData).length > 0) {
      await db.employee.update({
        where: { id: empId },
        data: updateData,
      });

      const changeType =
        request.requestType === 'BANK_DETAILS_CHANGE' || request.requestType === 'MPESA_CHANGE'
          ? 'PAYMENT_INFO_CHANGE'
          : 'CONTACT_UPDATE';

      await db.employeeHistory.create({
        data: {
          employeeId: empId,
          changeType,
          description: `Approved ${request.requestType.replace(/_/g, ' ')} via request ${request.requestNumber}.`,
          previousValue: JSON.stringify(changesAudit),
          newValue: JSON.stringify(updateData),
          performedById: reviewerUserId,
        },
      });
    }
  }
}
