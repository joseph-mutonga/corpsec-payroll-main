import crypto from 'crypto';
import { db } from '@/lib/db';
import { createAuditLog } from '@/lib/audit';

export interface CreateOfferInput {
  candidateId: string;
  vacancyId: string;
  positionId?: string;
  departmentId?: string;
  stationId?: string;
  employmentType?: string;
  proposedSalary: number;
  allowancesJson?: string;
  startDate: Date | string;
  offerExpiryDate: Date | string;
  offerLetterContent?: string;
}

export class OfferService {
  /**
   * Generates next sequential Offer Number: OFFER-YYYY-XXXX
   */
  static async generateOfferNumber(): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `OFFER-${year}-`;
    const lastOffer = await db.jobOffer.findFirst({
      where: { offerNumber: { startsWith: prefix } },
      orderBy: { offerNumber: 'desc' },
      select: { offerNumber: true },
    });

    let seq = 1;
    if (lastOffer) {
      const parts = lastOffer.offerNumber.split('-');
      if (parts.length >= 3) {
        const num = parseInt(parts[2], 10);
        if (!isNaN(num)) seq = num + 1;
      }
    }
    return `${prefix}${String(seq).padStart(4, '0')}`;
  }

  /**
   * Generates a standard offer letter text template
   */
  static generateDefaultOfferLetter(params: {
    candidateName: string;
    jobTitle: string;
    departmentName: string;
    stationName?: string;
    employmentType: string;
    proposedSalary: number;
    startDate: string;
    offerExpiryDate: string;
  }): string {
    return `CORPSEC INVESTVIAGATIONS & GUARDING SERVICES
P.O. Box 45678 - 00100, Nairobi, Kenya | info@corpsec.co.ke | +254 700 000 000

OFFICIAL OFFER OF EMPLOYMENT

Date: ${new Date().toLocaleDateString('en-KE', { dateStyle: 'long' })}

Dear ${params.candidateName},

We are pleased to offer you employment with CorpSec Investigations & Guarding Services under the following terms:

1. POSITION & DEPLOYMENT
   - Job Title: ${params.jobTitle}
   - Department: ${params.departmentName}
   - Station / Location: ${params.stationName || 'Nairobi Central Command'}
   - Employment Type: ${params.employmentType}

2. COMMENCEMENT & REMUNERATION
   - Effective Start Date: ${params.startDate}
   - Basic Monthly Salary: KES ${params.proposedSalary.toLocaleString('en-KE', { minimumFractionDigits: 2 })}
   - Statutory Deductions: Subject to standard Kenyan statutory deductions (PAYE, NSSF, SHA, Affordable Housing Levy).

3. PROBATION & POLICIES
   - Standard probation terms apply in accordance with the Kenya Employment Act and CorpSec Code of Conduct.
   - Uniforms, security credentials, and equipment will be issued during induction.

4. ACCEPTANCE TIMELINE
   - This offer remains valid until ${params.offerExpiryDate}.

Please indicate your acceptance by signing or confirming electronically via the secure CorpSec portal link.

Yours Sincerely,
HR Directorate
CorpSec Investigations & Guarding Services`;
  }

  static async createOffer(input: CreateOfferInput, createdById?: string) {
    const candidate = await db.candidate.findUnique({
      where: { id: input.candidateId },
      include: { vacancy: { include: { department: true, station: true, position: true } } },
    });
    if (!candidate) throw new Error('Candidate not found');

    const offerNumber = await this.generateOfferNumber();
    const secureToken = crypto.randomBytes(32).toString('hex');
    const startDate = new Date(input.startDate);
    const offerExpiryDate = new Date(input.offerExpiryDate);

    const letterContent =
      input.offerLetterContent ||
      this.generateDefaultOfferLetter({
        candidateName: candidate.fullName,
        jobTitle: candidate.vacancy.position?.title || candidate.vacancy.title,
        departmentName: candidate.vacancy.department.name,
        stationName: candidate.vacancy.station?.name,
        employmentType: input.employmentType || candidate.vacancy.employmentType,
        proposedSalary: input.proposedSalary,
        startDate: startDate.toLocaleDateString('en-KE', { dateStyle: 'medium' }),
        offerExpiryDate: offerExpiryDate.toLocaleDateString('en-KE', { dateStyle: 'medium' }),
      });

    const offer = await db.jobOffer.create({
      data: {
        offerNumber,
        candidateId: input.candidateId,
        vacancyId: input.vacancyId,
        positionId: input.positionId || candidate.vacancy.positionId,
        departmentId: input.departmentId || candidate.vacancy.departmentId,
        stationId: input.stationId || candidate.vacancy.stationId,
        employmentType: input.employmentType || candidate.vacancy.employmentType,
        proposedSalary: input.proposedSalary,
        allowancesJson: input.allowancesJson,
        startDate,
        offerExpiryDate,
        status: 'DRAFT',
        offerLetterContent: letterContent,
        secureToken,
        tokenExpiresAt: offerExpiryDate,
        createdById,
      },
      include: {
        candidate: { select: { id: true, fullName: true, email: true } },
        vacancy: { select: { id: true, title: true, vacancyNumber: true } },
      },
    });

    if (createdById) {
      await createAuditLog({
        userId: createdById,
        action: 'JOB_OFFER_CREATE',
        module: 'RECRUITMENT',
        entityType: 'RECRUITMENT',
        entityId: offer.id,
        newValue: { offerNumber, proposedSalary: input.proposedSalary },
      });
    }

    return offer;
  }

  static async approveOffer(id: string, approvedById: string) {
    const offer = await db.jobOffer.findUnique({
      where: { id },
      include: { candidate: true },
    });
    if (!offer) throw new Error('Job offer not found');

    const updated = await db.jobOffer.update({
      where: { id },
      data: {
        status: 'APPROVED',
        approvedById,
        approvedAt: new Date(),
      },
    });

    await createAuditLog({
      userId: approvedById,
      action: 'JOB_OFFER_APPROVE',
      module: 'RECRUITMENT',
      entityType: 'RECRUITMENT',
      entityId: id,
      newValue: { status: 'APPROVED' },
    });

    return updated;
  }

  static async sendOffer(id: string, senderId: string) {
    const offer = await db.jobOffer.findUnique({
      where: { id },
      include: { candidate: true },
    });
    if (!offer) throw new Error('Job offer not found');
    if (offer.status !== 'APPROVED') {
      throw new Error('Only approved job offers can be sent to candidates.');
    }

    const updated = await db.jobOffer.update({
      where: { id },
      data: {
        status: 'SENT',
        sentAt: new Date(),
      },
    });

    // Advance candidate stage to OFFER
    await db.candidate.update({
      where: { id: offer.candidateId },
      data: {
        currentStage: 'OFFER',
        stageHistories: {
          create: {
            fromStage: offer.candidate.currentStage,
            toStage: 'OFFER',
            reason: `Formal job offer ${offer.offerNumber} issued to candidate`,
            changedById: senderId,
          },
        },
      },
    });

    await createAuditLog({
      userId: senderId,
      action: 'JOB_OFFER_SEND',
      module: 'RECRUITMENT',
      entityType: 'RECRUITMENT',
      entityId: id,
      newValue: { status: 'SENT' },
    });

    return updated;
  }

  /**
   * Candidate retrieval of offer letter via secure token (public view)
   */
  static async getOfferBySecureToken(token: string) {
    const offer = await db.jobOffer.findUnique({
      where: { secureToken: token },
      include: {
        candidate: {
          select: {
            id: true,
            fullName: true,
            email: true,
            phone: true,
          },
        },
        vacancy: {
          select: {
            title: true,
            vacancyNumber: true,
            department: { select: { name: true } },
            station: { select: { name: true } },
          },
        },
      },
    });

    if (!offer) throw new Error('Invalid or expired offer link.');

    const isExpired = offer.offerExpiryDate < new Date();

    return {
      offerNumber: offer.offerNumber,
      candidateName: offer.candidate.fullName,
      candidateEmail: offer.candidate.email,
      jobTitle: offer.vacancy.title,
      departmentName: offer.vacancy.department.name,
      stationName: offer.vacancy.station?.name,
      employmentType: offer.employmentType,
      proposedSalary: offer.proposedSalary,
      startDate: offer.startDate,
      offerExpiryDate: offer.offerExpiryDate,
      offerLetterContent: offer.offerLetterContent,
      status: offer.status,
      candidateResponse: offer.candidateResponse,
      respondedAt: offer.respondedAt,
      isExpired,
    };
  }

  /**
   * Candidate acceptance / decline response via secure public token
   */
  static async respondToOffer(
    token: string,
    decision: 'ACCEPT' | 'DECLINE',
    declineReason?: string
  ) {
    const offer = await db.jobOffer.findUnique({
      where: { secureToken: token },
      include: { candidate: true },
    });

    if (!offer) throw new Error('Invalid offer link.');
    if (offer.candidateResponse) {
      throw new Error(`This offer has already been ${offer.candidateResponse.toLowerCase()}.`);
    }
    if (offer.offerExpiryDate < new Date()) {
      throw new Error('This job offer has expired.');
    }

    const newOfferStatus = decision === 'ACCEPT' ? 'ACCEPTED' : 'DECLINED';

    const updatedOffer = await db.jobOffer.update({
      where: { secureToken: token },
      data: {
        status: newOfferStatus,
        candidateResponse: decision === 'ACCEPT' ? 'ACCEPTED' : 'DECLINED',
        respondedAt: new Date(),
        declineReason: decision === 'DECLINE' ? declineReason : undefined,
      },
    });

    // Update candidate record
    await db.candidate.update({
      where: { id: offer.candidateId },
      data: {
        stageHistories: {
          create: {
            fromStage: offer.candidate.currentStage,
            toStage: decision === 'ACCEPT' ? 'OFFER' : 'REJECTED',
            reason:
              decision === 'ACCEPT'
                ? `Candidate accepted job offer ${offer.offerNumber}`
                : `Candidate declined job offer ${offer.offerNumber}: ${declineReason || 'No reason provided'}`,
          },
        },
        rejectionReason: decision === 'DECLINE' ? `Offer declined: ${declineReason || 'Candidate declined'}` : undefined,
      },
    });

    return updatedOffer;
  }

  static async getOffers(filters?: {
    vacancyId?: string;
    candidateId?: string;
    status?: string;
  }) {
    const where: any = {};
    if (filters?.vacancyId && filters.vacancyId !== 'ALL') where.vacancyId = filters.vacancyId;
    if (filters?.candidateId && filters.candidateId !== 'ALL') where.candidateId = filters.candidateId;
    if (filters?.status && filters.status !== 'ALL') where.status = filters.status;

    return db.jobOffer.findMany({
      where,
      include: {
        candidate: {
          select: {
            id: true,
            fullName: true,
            applicationNumber: true,
            email: true,
            phone: true,
            currentStage: true,
          },
        },
        vacancy: {
          select: {
            id: true,
            title: true,
            vacancyNumber: true,
            department: { select: { name: true } },
            station: { select: { name: true } },
          },
        },
        approvedBy: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }
}
