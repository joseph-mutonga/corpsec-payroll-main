import { db } from '@/lib/db';
import { AuditService } from '@/lib/audit';
import crypto from 'crypto';
import { SkillService } from './SkillService';

export class CertificateService {
  static async generateCertificateNumber(): Promise<string> {
    const year = new Date().getFullYear();
    let count = (await db.trainingCertificate.count()) + 1;
    let certNumber = `CERT-${year}-${String(count).padStart(6, '0')}`;
    while (await db.trainingCertificate.findUnique({ where: { certificateNumber: certNumber } })) {
      count++;
      certNumber = `CERT-${year}-${String(count).padStart(6, '0')}`;
    }
    return certNumber;
  }

  static generateVerificationToken(): string {
    return crypto.randomBytes(16).toString('hex');
  }

  static async issueCertificate(data: {
    enrollmentId: string;
    issuedById?: string;
    documentUrl?: string;
    customExpiryDate?: Date;
  }) {
    const enrollment = await db.trainingEnrollment.findUnique({
      where: { id: data.enrollmentId },
      include: {
        course: true,
        session: true,
        employee: true,
        assessments: true,
        attendances: true,
      },
    });
    if (!enrollment) throw new Error('Training enrollment record not found.');

    // 1. Completion Requirement Verification
    // If course requires assessment, ensure a passing score exists
    if (enrollment.course.assessmentRequired) {
      const hasPassed = enrollment.assessments.some((a) => a.result === 'PASS') || enrollment.finalResult === 'PASS';
      if (!hasPassed) {
        throw new Error(
          `Cannot issue certificate: Employee has not passed the required course assessment (Pass Mark: ${enrollment.course.passMark}%).`
        );
      }
    }

    // Check if certificate already issued for this enrollment
    const existingCert = await db.trainingCertificate.findFirst({
      where: { enrollmentId: data.enrollmentId, status: { not: 'REVOKED' } },
    });
    if (existingCert) {
      return existingCert;
    }

    const issueDate = new Date();
    let expiryDate: Date | null = null;

    if (data.customExpiryDate) {
      expiryDate = new Date(data.customExpiryDate);
    } else if (enrollment.course.validityMonths) {
      expiryDate = new Date(issueDate);
      expiryDate.setMonth(expiryDate.getMonth() + enrollment.course.validityMonths);
    }

    const certificateNumber = await this.generateCertificateNumber();
    let verificationToken = this.generateVerificationToken();
    while (await db.trainingCertificate.findUnique({ where: { verificationToken } })) {
      verificationToken = this.generateVerificationToken();
    }

    const certificate = await db.trainingCertificate.create({
      data: {
        certificateNumber,
        enrollmentId: data.enrollmentId,
        employeeId: enrollment.employeeId,
        courseId: enrollment.courseId,
        programId: enrollment.session.programId,
        issueDate,
        expiryDate,
        issuedById: data.issuedById,
        status: 'ACTIVE',
        documentUrl: data.documentUrl,
        verificationToken,
      },
      include: {
        course: true,
        employee: { select: { id: true, fullName: true, employeeNumber: true, department: true } },
      },
    });

    // Mark enrollment as COMPLETED
    await db.trainingEnrollment.update({
      where: { id: data.enrollmentId },
      data: {
        status: 'COMPLETED',
        completionDate: issueDate,
      },
    });

    // If linked to a training need, mark as COMPLETED
    if (enrollment.trainingNeedId) {
      await db.trainingNeed.update({
        where: { id: enrollment.trainingNeedId },
        data: { status: 'COMPLETED' },
      });
    }

    // Trigger Skill Development update
    if (enrollment.course.skillArea) {
      await SkillService.recordSkill({
        employeeId: enrollment.employeeId,
        skillName: enrollment.course.skillArea,
        level: (enrollment.course.level as any) || 'INTERMEDIATE',
        source: 'TRAINING_COMPLETION',
        courseId: enrollment.courseId,
        certificateId: certificate.id,
        expiryDate: expiryDate || undefined,
      });
    }

    await AuditService.log({
      userId: data.issuedById,
      action: 'ISSUE_TRAINING_CERTIFICATE',
      module: 'TRAINING',
      entityId: certificate.id,
      newValue: {
        certificateNumber: certificate.certificateNumber,
        course: enrollment.course.title,
        employee: enrollment.employee.fullName,
        expiryDate: certificate.expiryDate,
      },
    });

    return certificate;
  }

  static async verifyCertificate(tokenOrNumber: string) {
    const term = tokenOrNumber.trim();

    const cert = await db.trainingCertificate.findFirst({
      where: {
        OR: [{ verificationToken: term }, { certificateNumber: term }],
      },
      include: {
        course: { select: { code: true, title: true, skillArea: true, level: true, provider: true } },
        employee: { select: { fullName: true } },
      },
    });

    if (!cert) {
      return {
        isValid: false,
        message: 'Certificate not found. The certificate number or verification token is invalid.',
      };
    }

    const isExpired = cert.expiryDate ? new Date() > new Date(cert.expiryDate) : false;
    const isRevoked = cert.status === 'REVOKED';

    let verificationStatus: 'VALID' | 'EXPIRED' | 'REVOKED' = 'VALID';
    if (isRevoked) verificationStatus = 'REVOKED';
    else if (isExpired) verificationStatus = 'EXPIRED';

    // SANITIZATION GUARD: Strictly expose only public verification info.
    // Redact nationalId, phone, email, salary, and internal HR evaluations.
    return {
      isValid: verificationStatus === 'VALID',
      status: verificationStatus,
      certificateNumber: cert.certificateNumber,
      courseCode: cert.course.code,
      courseTitle: cert.course.title,
      skillArea: cert.course.skillArea,
      level: cert.course.level,
      provider: cert.course.provider,
      recipientName: cert.employee.fullName,
      issueDate: cert.issueDate,
      expiryDate: cert.expiryDate,
      revocationReason: isRevoked ? cert.revokedReason || 'Revoked by Issuing Authority' : undefined,
    };
  }

  static async revokeCertificate(id: string, data: { reason: string; revokedById?: string }) {
    const cert = await db.trainingCertificate.findUnique({
      where: { id },
      include: { employee: true, course: true },
    });
    if (!cert) throw new Error('Certificate not found.');

    const updated = await db.trainingCertificate.update({
      where: { id },
      data: {
        status: 'REVOKED',
        revokedAt: new Date(),
        revokedReason: data.reason,
        revokedById: data.revokedById,
      },
    });

    await AuditService.log({
      userId: data.revokedById,
      action: 'REVOKE_TRAINING_CERTIFICATE',
      module: 'TRAINING',
      entityId: id,
      newValue: {
        certificateNumber: cert.certificateNumber,
        reason: data.reason,
        employee: cert.employee.fullName,
      },
    });

    return updated;
  }

  static async listCertificates(filters: {
    employeeId?: string;
    courseId?: string;
    status?: string;
    search?: string;
  }) {
    const where: any = {};
    if (filters.employeeId && filters.employeeId !== 'ALL') where.employeeId = filters.employeeId;
    if (filters.courseId && filters.courseId !== 'ALL') where.courseId = filters.courseId;
    if (filters.status && filters.status !== 'ALL') where.status = filters.status;

    if (filters.search) {
      const q = filters.search.trim();
      where.OR = [
        { certificateNumber: { contains: q } },
        { course: { title: { contains: q } } },
        { employee: { fullName: { contains: q } } },
        { employee: { employeeNumber: { contains: q } } },
      ];
    }

    return db.trainingCertificate.findMany({
      where,
      orderBy: { issueDate: 'desc' },
      include: {
        course: { select: { id: true, code: true, title: true, skillArea: true } },
        employee: {
          select: {
            id: true,
            employeeNumber: true,
            fullName: true,
            department: { select: { id: true, name: true } },
          },
        },
        program: { select: { id: true, programNumber: true, name: true } },
      },
    });
  }
}
