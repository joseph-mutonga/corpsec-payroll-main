import { NextRequest } from 'next/server';
import { resolveSessionEmployee } from '@/lib/portal/PortalAuth';
import { apiSuccess, apiError } from '@/lib/response';
import { PaymentMasking } from '@/lib/payments/PaymentMasking';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const authContext = await resolveSessionEmployee();
    if ('errorResponse' in authContext) {
      return authContext.errorResponse;
    }

    const { employee } = authContext;

    const profileData = {
      id: employee.id,
      employeeNumber: employee.employeeNumber,
      firstName: employee.firstName,
      middleName: employee.middleName,
      lastName: employee.lastName,
      fullName: employee.fullName,
      nationalIdMasked: PaymentMasking.maskNationalId(employee.nationalId),
      dateOfBirth: employee.dateOfBirth,
      gender: employee.gender,
      maritalStatus: employee.maritalStatus,
      nationality: employee.nationality,
      profilePhotoUrl: employee.profilePhotoUrl,

      // Contact Information
      primaryPhone: employee.primaryPhone,
      alternativePhone: employee.alternativePhone,
      email: employee.email,
      physicalAddress: employee.physicalAddress,
      county: employee.county,
      townCity: employee.townCity,
      postalAddress: employee.postalAddress,

      // Employment Details
      jobTitle: employee.jobTitle,
      employmentType: employee.employmentType,
      employmentStatus: employee.employmentStatus,
      employmentDate: employee.employmentDate,
      contractStartDate: employee.contractStartDate,
      contractEndDate: employee.contractEndDate,
      department: employee.department ? { id: employee.department.id, name: employee.department.name } : null,
      position: employee.position ? { id: employee.position.id, title: employee.position.title } : null,
      station: employee.station ? { id: employee.station.id, name: employee.station.name } : null,
      branch: employee.branch ? { id: employee.branch.id, name: employee.branch.name } : null,
      supervisor: employee.supervisor ? { id: employee.supervisor.id, fullName: employee.supervisor.fullName } : null,

      // Payment Details (Masked)
      preferredPaymentMethod: employee.preferredPaymentMethod,
      bankName: employee.bankName,
      bankAccountName: employee.bankAccountName,
      bankAccountNumberMasked: PaymentMasking.maskBankAccount(employee.bankAccountNumber),
      bankBranch: employee.bankBranch,
      bankBranchCode: employee.bankBranchCode,
      mpesaPhoneNumberMasked: PaymentMasking.maskPhoneNumber(employee.mpesaPhoneNumber),

      // Statutory Details
      kraPin: employee.kraPin,
      nssfNumber: employee.nssfNumber,
      shaNumber: employee.shaNumber,
      housingLevyNumber: employee.housingLevyNumber,
    };

    return apiSuccess(profileData);
  } catch (error: any) {
    console.error('Error fetching employee profile:', error);
    return apiError(error.message || 'Failed to load employee profile');
  }
}
