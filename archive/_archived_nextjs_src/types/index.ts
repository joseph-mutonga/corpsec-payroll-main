// Central TypeScript interfaces and types for CorpSec HR Payroll Management System
// Cleanly organized across Foundation, HR, Organization, and Attendance modules

export type UserRoleType =
  | 'super_admin'
  | 'hr_admin'
  | 'payroll_officer'
  | 'hr_manager'
  | 'finance'
  | 'employee';

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  meta?: {
    total?: number;
    page?: number;
    pageSize?: number;
    message?: string;
    [key: string]: any;
  } | string;
  error?: {
    message: string;
    code: string;
    details?: any;
  };
}

export interface UserSession {
  userId: string;
  email: string;
  firstName: string;
  lastName: string;
  roles: string[];
  permissions: string[];
  isActive: boolean;
  user?: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    roles: string[];
    permissions: string[];
  };
}

export interface RoleData {
  id: string;
  name: string;
  displayName: string;
  description: string | null;
  isSystem: boolean;
  permissions?: PermissionData[];
}

export interface PermissionData {
  id: string;
  name: string;
  module: string;
  description: string | null;
}

export interface UserData {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  isActive: boolean;
  isVerified: boolean;
  lastLoginAt: Date | string | null;
  createdAt: Date | string;
  roles: string[];
  permissions?: string[];
  userRoles?: any[];
}

export type UserWithRoles = UserData;

export interface CompanySettingData {
  id: string;
  companyName: string;
  registrationNumber: string | null;
  kraPin: string | null;
  phone: string | null;
  email: string | null;
  physicalAddress: string | null;
  postalAddress: string | null;
  website: string | null;
  logoUrl: string | null;
  defaultCurrency: string;
  country: string;
  timezone: string;
  payrollConfig: string | null;
  updatedAt: Date | string;
}

// =============================================================================
// PHASE 3: ORGANIZATIONAL STRUCTURE TYPES
// =============================================================================

export interface BranchData {
  id: string;
  code: string;
  name: string;
  location?: string | null;
  county?: string | null;
  townCity?: string | null;
  physicalAddress?: string | null;
  contactPerson?: string | null;
  phone?: string | null;
  email?: string | null;
  branchManagerId?: string | null;
  branchManager?: {
    id: string;
    employeeNumber: string;
    fullName: string;
    jobTitle: string;
  } | null;
  isActive: boolean;
  createdAt: Date | string;
  updatedAt?: Date | string;
  stations?: StationData[];
  departments?: DepartmentData[];
  _count?: {
    stations?: number;
    employees?: number;
    departments?: number;
  };
}

export interface DepartmentData {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  branchId?: string | null;
  departmentHeadId?: string | null;
  departmentHead?: {
    id: string;
    employeeNumber: string;
    fullName: string;
    jobTitle: string;
  } | null;
  isActive: boolean;
  createdAt: Date | string;
  updatedAt?: Date | string;
  branch?: {
    id: string;
    name: string;
    code: string;
  } | null;
  positions?: PositionData[];
  _count?: {
    employees?: number;
    positions?: number;
  };
}

export interface StationData {
  id: string;
  code: string;
  name: string;
  clientLocationName: string | null;
  physicalLocation?: string | null;
  county?: string | null;
  townCity?: string | null;
  address?: string | null;
  branchId: string | null;
  supervisorId?: string | null;
  supervisor?: {
    id: string;
    employeeNumber: string;
    fullName: string;
    jobTitle: string;
  } | null;
  requiredStaffing: number;
  currentStaffing?: number;
  staffingDifference?: number;
  isActive: boolean;
  createdAt: Date | string;
  updatedAt?: Date | string;
  branch?: {
    id: string;
    name: string;
    code: string;
  } | null;
  _count?: {
    employees?: number;
  };
}

export interface PositionData {
  id: string;
  code: string;
  title: string;
  description?: string | null;
  departmentId?: string | null;
  department?: {
    id: string;
    name: string;
    code: string;
  } | null;
  employmentCategory: string;
  isActive: boolean;
  createdAt: Date | string;
  updatedAt?: Date | string;
  _count?: {
    employees?: number;
  };
}

export interface EmployeeAssignmentData {
  id: string;
  employeeId: string;
  branchId: string;
  departmentId: string;
  stationId?: string | null;
  positionId?: string | null;
  jobTitle: string;
  supervisorId?: string | null;
  startDate: Date | string;
  endDate?: Date | string | null;
  status: string;
  reason?: string | null;
  createdById?: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;

  branch?: { id: string; code: string; name: string };
  department?: { id: string; code: string; name: string };
  station?: { id: string; code: string; name: string } | null;
  position?: { id: string; code: string; title: string } | null;
  supervisor?: { id: string; employeeNumber: string; fullName: string; jobTitle: string } | null;
  createdBy?: { id: string; email: string; firstName: string; lastName: string } | null;
}

export interface AuditLogData {
  id: string;
  userId: string | null;
  userEmail: string | null;
  action: string;
  module: string;
  entityType: string | null;
  entityId: string | null;
  previousValue: string | null;
  newValue: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: Date | string;
}

export interface NextOfKinData {
  id?: string;
  fullName: string;
  relationship: string;
  primaryPhone: string;
  alternativePhone?: string | null;
  email?: string | null;
  physicalAddress?: string | null;
  percentageShare?: number | null;
  isPrimary?: boolean;
}

export interface EmergencyContactData {
  id?: string;
  fullName: string;
  relationship: string;
  primaryPhone: string;
  alternativePhone?: string | null;
  physicalAddress?: string | null;
}

export interface EmployeeDocumentData {
  id: string;
  employeeId: string;
  documentType: string;
  fileName: string;
  filePath: string;
  fileSize: number;
  mimeType: string;
  description?: string | null;
  expiryDate?: Date | string | null;
  uploadedById?: string | null;
  uploadedBy?: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  } | null;
  createdAt: Date | string;
}

export interface EmployeeHistoryData {
  id: string;
  employeeId: string;
  changeType: string;
  description: string;
  previousValue?: string | null;
  newValue?: string | null;
  performedById?: string | null;
  performedBy?: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  } | null;
  createdAt: Date | string;
}

export interface EmployeeData {
  id: string;
  employeeNumber: string;
  firstName: string;
  middleName?: string | null;
  lastName: string;
  fullName: string;
  nationalId: string;
  dateOfBirth?: Date | string | null;
  gender: string;
  maritalStatus?: string | null;
  nationality: string;
  profilePhotoUrl?: string | null;

  primaryPhone: string;
  alternativePhone?: string | null;
  email?: string | null;
  physicalAddress?: string | null;
  county?: string | null;
  townCity?: string | null;
  postalAddress?: string | null;

  employmentDate: Date | string;
  contractStartDate?: Date | string | null;
  contractEndDate?: Date | string | null;
  employmentType: string;
  jobTitle: string;
  positionId?: string | null;
  departmentId?: string | null;
  branchId?: string | null;
  stationId?: string | null;
  supervisorId?: string | null;
  employmentStatus: string;

  isArchived: boolean;
  archivedAt?: Date | string | null;
  archivedReason?: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;

  preferredPaymentMethod?: string;
  bankName?: string | null;
  bankAccountName?: string | null;
  bankAccountNumber?: string | null;
  bankBranch?: string | null;
  bankBranchCode?: string | null;
  mpesaPhoneNumber?: string | null;

  kraPin?: string | null;
  nssfNumber?: string | null;
  shaNumber?: string | null;
  housingLevyNumber?: string | null;
  helbNumber?: string | null;

  position?: PositionData | null;
  department?: DepartmentData | null;
  branch?: BranchData | null;
  station?: StationData | null;
  supervisor?: {
    id: string;
    employeeNumber: string;
    fullName: string;
    jobTitle: string;
  } | null;

  assignments?: EmployeeAssignmentData[];
  shiftAssignments?: EmployeeShiftAssignmentData[];
  attendanceRecords?: AttendanceRecordData[];
  nextOfKin?: NextOfKinData[];
  emergencyContacts?: EmergencyContactData[];
  documents?: EmployeeDocumentData[];
  history?: EmployeeHistoryData[];
}

// =============================================================================
// PHASE 4: ATTENDANCE & TIME MANAGEMENT TYPES
// =============================================================================

export interface ShiftData {
  id: string;
  code: string;
  name: string;
  startTime: string; // HH:mm
  endTime: string;   // HH:mm
  shiftType: string; // DAY, NIGHT, MORNING, EVENING, CUSTOM
  isOvernight: boolean;
  gracePeriodMinutes: number;
  breakDurationMinutes: number;
  isBreakPaid: boolean;
  breakStartTime?: string | null;
  breakEndTime?: string | null;
  status: string;
  createdAt: Date | string;
  updatedAt?: Date | string;
  _count?: {
    employeeShiftAssignments?: number;
    attendanceRecords?: number;
  };
}

export interface WorkScheduleData {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  patternType: string;
  cycleDays: number;
  scheduleConfig?: string | null;
  isActive: boolean;
  createdAt: Date | string;
  updatedAt?: Date | string;
  _count?: {
    employeeShiftAssignments?: number;
  };
}

export interface EmployeeShiftAssignmentData {
  id: string;
  employeeId: string;
  shiftId?: string | null;
  workScheduleId?: string | null;
  stationId?: string | null;
  startDate: Date | string;
  endDate?: Date | string | null;
  status: string;
  notes?: string | null;
  createdAt: Date | string;
  employee?: {
    id: string;
    employeeNumber: string;
    fullName: string;
    jobTitle: string;
    branch?: { name: string; code: string };
    station?: { name: string; code: string };
    department?: { name: string; code: string };
  };
  shift?: ShiftData | null;
  workSchedule?: WorkScheduleData | null;
  station?: StationData | null;
}

export interface PublicHolidayData {
  id: string;
  name: string;
  date: Date | string;
  country: string;
  description?: string | null;
  isActive: boolean;
  createdAt: Date | string;
}

export interface AttendanceRecordData {
  id: string;
  employeeId: string;
  date: Date | string;
  scheduledShiftId?: string | null;
  scheduledStartTime?: string | null;
  scheduledEndTime?: string | null;
  actualClockIn?: Date | string | null;
  actualClockOut?: Date | string | null;
  breakDurationMinutes: number;
  workedMinutes: number;
  lateMinutes: number;
  earlyDepartureMinutes: number;
  overtimeMinutes: number;
  attendanceStatus: string; // PRESENT, ABSENT, LATE, EARLY_DEPARTURE, PRESENT_WITH_OVERTIME, OFF_DAY, REST_DAY, PUBLIC_HOLIDAY, ON_LEAVE, SICK_LEAVE, EXCUSED_ABSENCE, MISSING_CLOCK_OUT
  source: string; // PORTAL, HR_MANUAL, IMPORT, BIOMETRIC_DEVICE
  notes?: string | null;
  approvalStatus: string; // DRAFT, SUBMITTED, UNDER_REVIEW, APPROVED, REJECTED, LOCKED
  approvedById?: string | null;
  approvedAt?: Date | string | null;
  lockedById?: string | null;
  lockedAt?: Date | string | null;
  createdAt: Date | string;
  updatedAt: Date | string;

  employee?: {
    id: string;
    employeeNumber: string;
    fullName: string;
    jobTitle: string;
    branch?: { id: string; name: string; code: string };
    department?: { id: string; name: string; code: string };
    station?: { id: string; name: string; code: string };
  };
  scheduledShift?: ShiftData | null;
  approvedBy?: { id: string; firstName: string; lastName: string; email: string } | null;
  lockedBy?: { id: string; firstName: string; lastName: string } | null;
  events?: AttendanceEventData[];
  overtimeRecords?: OvertimeRecordData[];
  adjustments?: AttendanceAdjustmentData[];
}

export interface AttendanceEventData {
  id: string;
  attendanceRecordId?: string | null;
  employeeId: string;
  eventType: string; // CLOCK_IN, CLOCK_OUT, BREAK_START, BREAK_END
  timestamp: Date | string;
  source: string;
  deviceInfo?: string | null;
  ipAddress?: string | null;
  locationLat?: number | null;
  locationLng?: number | null;
  notes?: string | null;
  createdAt: Date | string;
}

export interface OvertimeRecordData {
  id: string;
  employeeId: string;
  attendanceRecordId?: string | null;
  date: Date | string;
  scheduledHours: number;
  actualHours: number;
  overtimeMinutes: number;
  overtimeHours: number;
  reason: string;
  requestedById?: string | null;
  approvedById?: string | null;
  approvedAt?: Date | string | null;
  approvalStatus: string; // PENDING, APPROVED, REJECTED, CANCELLED
  comments?: string | null;
  createdAt: Date | string;
  employee?: {
    id: string;
    employeeNumber: string;
    fullName: string;
    jobTitle: string;
    station?: { name: string };
  };
  requestedBy?: { firstName: string; lastName: string; email: string } | null;
  approvedBy?: { firstName: string; lastName: string; email: string } | null;
}

export interface AttendanceAdjustmentData {
  id: string;
  attendanceRecordId: string;
  employeeId: string;
  fieldChanged: string;
  originalValue?: string | null;
  newValue?: string | null;
  reason: string;
  correctedById?: string | null;
  approvedById?: string | null;
  status: string;
  createdAt: Date | string;
  employee?: {
    id: string;
    employeeNumber: string;
    fullName: string;
    jobTitle: string;
  };
  attendanceRecord?: {
    date: Date | string;
    approvalStatus: string;
    attendanceStatus: string;
  };
  correctedBy?: { firstName: string; lastName: string; email: string } | null;
  approvedBy?: { firstName: string; lastName: string; email: string } | null;
}

export interface AttendanceStatsData {
  today: {
    totalActiveEmployees: number;
    present: number;
    late: number;
    absent: number;
    onLeave: number;
    offDay: number;
    missingClockOut: number;
    recordedTodayCount: number;
  };
  period: {
    monthName: string;
    attendanceRate: number;
    totalRecords: number;
    totalPresent: number;
    totalLateArrivals: number;
    totalWorkedHours: number;
    totalOvertimeHours: number;
    pendingApprovals: number;
    pendingOvertime: number;
    lockedRecords: number;
  };
}

// =============================================================================
// PHASE 5: LEAVE MANAGEMENT INTERFACES
// =============================================================================

export interface LeaveTypeData {
  id: string;
  code: string;
  name: string;
  description: string | null;
  isPaid: boolean;
  defaultDays: number;
  maxDays: number | null;
  requiresApproval: boolean;
  requiresDocument: boolean;
  requiresMedicalCert: boolean;
  genderApplicability: 'ALL' | 'MALE' | 'FEMALE';
  color: string | null;
  status: 'ACTIVE' | 'INACTIVE';
  createdAt: Date | string;
  updatedAt: Date | string;
  policies?: LeavePolicyData[];
  _count?: {
    requests: number;
    entitlements: number;
  };
}

export interface LeavePolicyData {
  id: string;
  leaveTypeId: string;
  policyName: string;
  policyCode: string;
  entitledDays: number;
  accrualMethod: string;
  accrualFrequency: string;
  allowCarryForward: boolean;
  maxCarryForwardDays: number;
  carryForwardExpiryMonths: number;
  minServiceDays: number;
  prorationRule: string;
  excludeWeekends: boolean;
  excludeHolidays: boolean;
  allowAdvanceLeave: boolean;
  maxAdvanceDays: number;
  effectiveDate: Date | string;
  status: 'ACTIVE' | 'INACTIVE';
  createdAt: Date | string;
  leaveType?: LeaveTypeData;
}

export interface LeaveYearData {
  id: string;
  year: number;
  startDate: Date | string;
  endDate: Date | string;
  isCurrent: boolean;
  isClosed: boolean;
  notes: string | null;
}

export interface LeaveEntitlementData {
  id: string;
  employeeId: string;
  leaveTypeId: string;
  policyId: string | null;
  leaveYear: number;
  openingBalance: number;
  entitledDays: number;
  accruedDays: number;
  carriedForwardDays: number;
  usedDays: number;
  pendingDays: number;
  adjustmentDays: number;
  expiredDays: number;
  availableBalance: number;
  status: string;
  createdAt: Date | string;
  updatedAt: Date | string;
  employee?: {
    id: string;
    employeeNumber: string;
    fullName: string;
    gender: string;
    department?: { name: string; code: string } | null;
    branch?: { name: string; code: string } | null;
    station?: { name: string; code: string } | null;
    position?: { title: string; code: string } | null;
  };
  leaveType?: LeaveTypeData;
  policy?: LeavePolicyData | null;
  adjustments?: LeaveAdjustmentData[];
}

export interface LeaveRequestData {
  id: string;
  requestNumber: string;
  employeeId: string;
  leaveTypeId: string;
  leaveYear: number;
  startDate: Date | string;
  endDate: Date | string;
  durationDays: number;
  isHalfDay: boolean;
  halfDaySession: string | null;
  reason: string;
  contactPhone: string | null;
  contactAddress: string | null;
  emergencyContact: string | null;
  relieverEmployeeId: string | null;
  status: 'DRAFT' | 'SUBMITTED' | 'UNDER_REVIEW' | 'APPROVED' | 'REJECTED' | 'CANCELLED' | 'WITHDRAWN';
  submittedAt: Date | string;
  reviewedById: string | null;
  reviewedAt: Date | string | null;
  reviewerComments: string | null;
  rejectionReason: string | null;
  cancelledById: string | null;
  cancelledAt: Date | string | null;
  cancellationReason: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
  employee?: {
    id: string;
    employeeNumber: string;
    fullName: string;
    department?: { name: string; code: string } | null;
    branch?: { name: string; code: string } | null;
    station?: { name: string; code: string } | null;
    position?: { title: string; code: string } | null;
    supervisor?: { fullName: string; employeeNumber: string } | null;
  };
  leaveType?: LeaveTypeData;
  reliever?: { id: string; fullName: string; employeeNumber: string } | null;
  reviewedBy?: { id: string; firstName: string; lastName: string; email: string } | null;
  cancelledBy?: { id: string; firstName: string; lastName: string; email: string } | null;
  documents?: LeaveDocumentData[];
}

export interface LeaveDocumentData {
  id: string;
  leaveRequestId: string | null;
  employeeId: string;
  documentType: string;
  fileName: string;
  filePath: string;
  fileSize: number;
  mimeType: string;
  description: string | null;
  uploadedById: string | null;
  createdAt: Date | string;
  uploadedBy?: { id: string; firstName: string; lastName: string } | null;
}

export interface LeaveAdjustmentData {
  id: string;
  employeeId: string;
  leaveTypeId: string;
  entitlementId: string | null;
  leaveYear: number;
  adjustmentType: string;
  adjustmentDays: number;
  previousBalance: number;
  newBalance: number;
  reason: string;
  approvedById: string | null;
  createdAt: Date | string;
  employee?: { id: string; fullName: string; employeeNumber: string };
  leaveType?: { id: string; name: string; code: string };
  approvedBy?: { id: string; firstName: string; lastName: string };
}

export interface LeaveStatsData {
  onLeaveToday: number;
  pendingApprovals: number;
  upcomingLeaves: number;
  expiringCarryForward: number;
  totalEntitledDaysAllocated: number;
  totalLeaveDaysUtilized: number;
}

export type CompanySettingsData = CompanySettingData;

// =============================================================================
// PHASE 6: PAYROLL CONFIGURATION & SALARY STRUCTURE INTERFACES
// =============================================================================

export interface PayrollPeriodData {
  id: string;
  periodNumber: string;
  name: string;
  startDate: Date | string;
  endDate: Date | string;
  payrollMonth: number;
  payrollYear: number;
  payFrequency: string;
  status: 'DRAFT' | 'OPEN' | 'PROCESSING' | 'PENDING_APPROVAL' | 'APPROVED' | 'FINALIZED' | 'LOCKED' | 'CLOSED';
  cutoffDate?: Date | string | null;
  paymentDate?: Date | string | null;
  notes?: string | null;
  createdById?: string | null;
  lockedById?: string | null;
  lockedAt?: Date | string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
  createdBy?: { id: string; firstName: string; lastName: string; email: string } | null;
  lockedBy?: { id: string; firstName: string; lastName: string; email: string } | null;
}

export interface SalaryRecordData {
  id: string;
  employeeId: string;
  basicSalary: number;
  payFrequency: string;
  currency: string;
  effectiveFrom: Date | string;
  effectiveTo?: Date | string | null;
  status: 'PENDING_APPROVAL' | 'ACTIVE' | 'SUPERSEDED' | 'REJECTED' | 'INACTIVE';
  isOvertimeEligible: boolean;
  changeReason?: string | null;
  proposedById?: string | null;
  approvedById?: string | null;
  approvedAt?: Date | string | null;
  notes?: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
  employee?: {
    id: string;
    employeeNumber: string;
    fullName: string;
    jobTitle: string;
    department?: { name: string; code: string } | null;
    branch?: { name: string; code: string } | null;
    station?: { name: string; code: string } | null;
    position?: { title: string; code: string } | null;
  };
  proposedBy?: { id: string; firstName: string; lastName: string; email: string } | null;
  approvedBy?: { id: string; firstName: string; lastName: string; email: string } | null;
}

export interface AllowanceTypeData {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  calculationMethod: 'FIXED_AMOUNT' | 'PERCENTAGE_OF_BASIC' | 'PERCENTAGE_OF_GROSS' | 'MANUAL';
  defaultAmount: number;
  percentageValue?: number | null;
  isTaxable: boolean;
  isPensionable: boolean;
  isRecurring: boolean;
  effectiveDate: Date | string;
  status: 'ACTIVE' | 'INACTIVE';
  createdAt: Date | string;
  updatedAt: Date | string;
  _count?: {
    employeeAllowances: number;
  };
}

export interface EmployeeAllowanceData {
  id: string;
  employeeId: string;
  allowanceTypeId: string;
  amount: number;
  calculationMethod: string;
  percentageValue?: number | null;
  effectiveFrom: Date | string;
  effectiveTo?: Date | string | null;
  isRecurring: boolean;
  status: 'ACTIVE' | 'INACTIVE' | 'SUPERSEDED';
  notes?: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
  employee?: {
    id: string;
    employeeNumber: string;
    fullName: string;
    jobTitle: string;
    department?: { name: string };
    branch?: { name: string };
  };
  allowanceType?: AllowanceTypeData;
}

export interface DeductionTypeData {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  calculationMethod: 'FIXED_AMOUNT' | 'PERCENTAGE_OF_BASIC' | 'PERCENTAGE_OF_GROSS' | 'BALANCE_BASED';
  isStatutory: boolean;
  isRecurring: boolean;
  effectiveDate: Date | string;
  status: 'ACTIVE' | 'INACTIVE';
  createdAt: Date | string;
  updatedAt: Date | string;
  _count?: {
    employeeDeductions: number;
  };
}

export interface EmployeeDeductionData {
  id: string;
  employeeId: string;
  deductionTypeId: string;
  amount: number;
  calculationMethod: string;
  percentageValue?: number | null;
  totalTargetAmount?: number | null;
  currentBalance?: number | null;
  effectiveFrom: Date | string;
  effectiveTo?: Date | string | null;
  isRecurring: boolean;
  status: 'ACTIVE' | 'INACTIVE' | 'SUPERSEDED' | 'CLEARED';
  notes?: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
  employee?: {
    id: string;
    employeeNumber: string;
    fullName: string;
    jobTitle: string;
    department?: { name: string };
    branch?: { name: string };
  };
  deductionType?: DeductionTypeData;
}

export interface StatutoryRuleData {
  id: string;
  regimeType: string;
  name: string;
  description?: string | null;
  calculationType: 'BANDED_PROGRESSIVE' | 'FIXED_PERCENTAGE' | 'FIXED_AMOUNT' | 'CAPPED_PERCENTAGE';
  employeeRate?: number | null;
  employerRate?: number | null;
  minThreshold?: number | null;
  maxThreshold?: number | null;
  capAmount?: number | null;
  effectiveFrom: Date | string;
  effectiveTo?: Date | string | null;
  status: 'ACTIVE' | 'INACTIVE' | 'SUPERSEDED';
  rulesConfig?: string | null;
  taxBands?: TaxBandData[];
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface TaxBandData {
  id: string;
  statutoryRuleId: string;
  bandOrder: number;
  bandName: string;
  lowerThreshold: number;
  upperThreshold?: number | null;
  ratePercentage: number;
  taxReliefAnnual: number;
  taxReliefMonthly: number;
  effectiveFrom: Date | string;
  effectiveTo?: Date | string | null;
  status: 'ACTIVE' | 'INACTIVE' | 'SUPERSEDED';
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface OvertimeRateConfigData {
  id: string;
  code: string;
  name: string;
  overtimeType: 'NORMAL' | 'REST_DAY' | 'PUBLIC_HOLIDAY' | 'NIGHT';
  rateMultiplier: number;
  hourlyDivisor: number;
  requiresApproval: boolean;
  effectiveFrom: Date | string;
  effectiveTo?: Date | string | null;
  status: 'ACTIVE' | 'INACTIVE';
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface BonusTypeData {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  defaultCalculationMethod: string;
  defaultAmount: number;
  isTaxable: boolean;
  isRecurring: boolean;
  status: 'ACTIVE' | 'INACTIVE';
}

export interface CommissionTypeData {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  calculationMethod: string;
  status: 'ACTIVE' | 'INACTIVE';
}

export interface OtherEarningData {
  id: string;
  employeeId: string;
  payrollPeriodId?: string | null;
  title: string;
  earningType: string;
  amount: number;
  isTaxable: boolean;
  effectiveDate: Date | string;
  approvalStatus: 'PENDING' | 'APPROVED' | 'REJECTED';
  approvedById?: string | null;
  approvedAt?: Date | string | null;
  notes?: string | null;
  employee?: { fullName: string; employeeNumber: string };
  payrollPeriod?: { name: string; periodNumber: string };
}

export interface OtherDeductionData {
  id: string;
  employeeId: string;
  payrollPeriodId?: string | null;
  title: string;
  deductionType: string;
  amount: number;
  effectiveDate: Date | string;
  approvalStatus: 'PENDING' | 'APPROVED' | 'REJECTED';
  approvedById?: string | null;
  approvedAt?: Date | string | null;
  notes?: string | null;
  employee?: { fullName: string; employeeNumber: string };
  payrollPeriod?: { name: string; periodNumber: string };
}

export interface CompanyPayrollSettingData {
  id: string;
  payFrequency: string;
  defaultPayDay: number;
  cutoffDay: number;
  defaultCurrency: string;
  roundingMethod: string;
  prorationBaseDays: number;
  overtimeHourlyDivisor: number;
  allowNegativeNetPay: boolean;
  requireTwoTierApproval: boolean;
  payrollNumberPrefix: string;
  payslipNumberPrefix: string;
  paymentBatchPrefix: string;
  effectiveDate: Date | string;
}

export interface PayrollConfigStatsData {
  activePayrollPeriod: PayrollPeriodData | null;
  totalEmployeesWithSalary: number;
  totalEmployeesMissingSalary: number;
  pendingSalaryProposals: number;
  activeAllowanceTypesCount: number;
  activeDeductionTypesCount: number;
  activeStatutoryRulesCount: number;
  totalMonthlyBasePayrollKES: number;
}

// =============================================================================
// PHASE 7: PAYROLL CALCULATION & RUN INTERFACES
// =============================================================================

export type PayrollRunStatus =
  | 'DRAFT'
  | 'CALCULATING'
  | 'CALCULATED'
  | 'UNDER_REVIEW'
  | 'PENDING_APPROVAL'
  | 'APPROVED'
  | 'FINALIZED'
  | 'LOCKED'
  | 'CANCELLED';

export type PayrollRunType = 'REGULAR' | 'SUPPLEMENTARY' | 'ADJUSTMENT';

export interface PayrollRunData {
  id: string;
  runNumber: string;
  payrollPeriodId: string;
  runType: PayrollRunType;
  employeeCount: number;
  totalBasicPay: number;
  totalAllowances: number;
  totalOvertimePay: number;
  totalBonusPay: number;
  totalCommissionPay: number;
  totalOtherEarnings: number;
  grossPayroll: number;
  totalPayeTax: number;
  totalNssfEmployee: number;
  totalShaEmployee: number;
  totalHousingLevyEmployee: number;
  totalStatutoryDeductions: number;
  totalOtherDeductions: number;
  totalDeductions: number;
  totalNetPayroll: number;
  totalNssfEmployer: number;
  totalShaEmployer: number;
  totalHousingLevyEmployer: number;
  totalEmployerContributions: number;
  status: PayrollRunStatus;
  calculationVersion: number;
  ruleConfigSnapshot?: string | null;
  isReconciled: boolean;
  notes?: string | null;
  rejectionReason?: string | null;
  createdById?: string | null;
  calculatedById?: string | null;
  calculatedAt?: Date | string | null;
  reviewedById?: string | null;
  reviewedAt?: Date | string | null;
  approvedById?: string | null;
  approvedAt?: Date | string | null;
  finalizedById?: string | null;
  finalizedAt?: Date | string | null;
  lockedById?: string | null;
  lockedAt?: Date | string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
  payrollPeriod?: PayrollPeriodData;
  createdBy?: { id: string; name: string; email: string };
  calculatedBy?: { id: string; name: string; email: string };
  reviewedBy?: { id: string; name: string; email: string };
  approvedBy?: { id: string; name: string; email: string };
  finalizedBy?: { id: string; name: string; email: string };
  lockedBy?: { id: string; name: string; email: string };
  employeeRecords?: PayrollEmployeeRecordData[];
  exceptions?: PayrollRunExceptionData[];
  _count?: {
    employeeRecords?: number;
    exceptions?: number;
  };
}

export interface PayrollEmployeeRecordData {
  id: string;
  payrollRunId: string;
  employeeId: string;
  employmentStatus: string;
  jobTitle: string;
  departmentName?: string | null;
  branchName?: string | null;
  stationName?: string | null;
  basicSalary: number;
  proratedBasicPay: number;
  unpaidLeaveDeduction: number;
  absenceDeduction: number;
  totalAllowances: number;
  overtimeHours: number;
  totalOvertimePay: number;
  totalBonusPay: number;
  totalCommissionPay: number;
  totalOtherEarnings: number;
  grossPay: number;
  taxableGross: number;
  payeTax: number;
  personalRelief: number;
  nssfTier1Employee: number;
  nssfTier2Employee: number;
  shaEmployee: number;
  housingLevyEmployee: number;
  totalStatutoryDeductions: number;
  totalOtherDeductions: number;
  totalDeductions: number;
  netPay: number;
  nssfTier1Employer: number;
  nssfTier2Employer: number;
  shaEmployer: number;
  housingLevyEmployer: number;
  totalEmployerContributions: number;
  paymentMethod?: string | null;
  bankAccountNumber?: string | null;
  bankName?: string | null;
  mpesaPhoneNumber?: string | null;
  kraPin?: string | null;
  nssfNumber?: string | null;
  shaNumber?: string | null;
  calculationTrace?: string;
  status: string;
  paymentStatus?: 'PENDING' | 'PROCESSING' | 'PAID' | 'FAILED' | string;
  paidAt?: Date | string | null;
  paymentReference?: string | null;
  paymentNotes?: string | null;
  payslipGeneratedAt?: Date | string | null;
  payslipSentAt?: Date | string | null;
  payslipViewedAt?: Date | string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
  employee?: {
    id: string;
    employeeNumber: string;
    fullName: string;
    jobTitle: string;
    nationalId?: string | null;
    employmentType?: string | null;
    department?: { id: string; name: string; code: string } | null;
    branch?: { id: string; name: string; code: string } | null;
    station?: { id: string; name: string; code: string } | null;
  };
}

export interface PayrollRunExceptionData {
  id: string;
  payrollRunId: string;
  employeeId?: string | null;
  employeeRecordId?: string | null;
  exceptionType: string;
  severity: 'WARNING' | 'ERROR' | 'CRITICAL';
  description: string;
  isResolved: boolean;
  resolvedById?: string | null;
  resolvedAt?: Date | string | null;
  resolutionNotes?: string | null;
  createdAt: Date | string;
  employee?: {
    id: string;
    employeeNumber: string;
    fullName: string;
  } | null;
  resolvedBy?: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  } | null;
}

// =============================================================================
// PHASE 8: PAYSLIPS, PAYROLL REPORTS & STATUTORY OUTPUTS INTERFACES
// =============================================================================

export type PayrollPaymentStatus = 'PENDING' | 'PROCESSING' | 'PAID' | 'FAILED';

export interface PayslipItem {
  name: string;
  code?: string;
  amount: number;
  type: 'EARNING' | 'STATUTORY_DEDUCTION' | 'OTHER_DEDUCTION' | 'RELIEF';
  isTaxable?: boolean;
  isPensionable?: boolean;
  currentBalance?: number;
}

export interface FormattedPayslipData {
  recordId: string;
  runId: string;
  runNumber: string;
  periodName: string;
  periodMonth: number;
  periodYear: number;
  payDate: string;
  company: {
    name: string;
    tagline: string;
    kraPin: string;
    address: string;
    email: string;
    phone: string;
  };
  employee: {
    id: string;
    employeeNumber: string;
    fullName: string;
    nationalId: string;
    jobTitle: string;
    employmentType: string;
    department: string;
    branch: string;
    station: string;
    kraPin: string;
    nssfNumber: string;
    shaNumber: string;
    paymentMethod: string;
    bankName?: string;
    bankAccount?: string;
    mpesaPhone?: string;
  };
  salaryStructure: {
    basicSalary: number;
    proratedBasicPay: number;
    unpaidLeaveDeduction: number;
    absenceDeduction: number;
  };
  earnings: {
    basicPay: number;
    allowances: PayslipItem[];
    overtime: { hours: number; amount: number };
    bonuses: number;
    commissions: number;
    otherEarnings: number;
    grossPay: number;
    taxableGross: number;
  };
  deductions: {
    payeTax: number;
    personalRelief: number;
    nssfTier1: number;
    nssfTier2: number;
    totalNssf: number;
    sha: number;
    housingLevy: number;
    totalStatutory: number;
    otherDeductions: PayslipItem[];
    totalOtherDeductions: number;
    totalDeductions: number;
  };
  summary: {
    grossPay: number;
    totalDeductions: number;
    netPay: number;
  };
  employerContributions: {
    nssfTier1: number;
    nssfTier2: number;
    totalNssf: number;
    sha: number;
    housingLevy: number;
    totalContributions: number;
  };
  paymentStatus: PayrollPaymentStatus;
  paidAt?: string | null;
  paymentReference?: string | null;
  notes?: string;
}

export interface PayrollSummaryReportRow {
  employeeId: string;
  employeeNumber: string;
  fullName: string;
  department: string;
  station: string;
  basicSalary: number;
  allowances: number;
  overtime: number;
  bonuses: number;
  commissions: number;
  grossPay: number;
  paye: number;
  nssf: number;
  sha: number;
  housingLevy: number;
  otherDeductions: number;
  totalDeductions: number;
  netPay: number;
  employerCost: number;
  paymentStatus: string;
}

export interface StatutoryReportItem {
  employeeNumber: string;
  fullName: string;
  kraPin: string;
  nssfNumber: string;
  shaNumber: string;
  department: string;
  grossPay: number;
  taxableIncome: number;
  payeTax: number;
  personalRelief: number;
  pensionableEarnings: number;
  nssfTier1Employee: number;
  nssfTier2Employee: number;
  nssfTotalEmployee: number;
  nssfTier1Employer: number;
  nssfTier2Employer: number;
  nssfTotalEmployer: number;
  nssfGrandTotal: number;
  shaEmployee: number;
  housingLevyEmployee: number;
  housingLevyEmployer: number;
  housingLevyTotal: number;
}

export interface EmployerCostReportData {
  runId: string;
  runNumber: string;
  periodName: string;
  employeeCount: number;
  totalBasicSalaries: number;
  totalAllowances: number;
  totalOvertime: number;
  totalBonuses: number;
  totalCommissions: number;
  totalOtherEarnings: number;
  totalGrossSalaries: number;
  totalEmployerNssf: number;
  totalEmployerHousingLevy: number;
  totalEmployerSha: number;
  totalEmployerContributions: number;
  totalTrueEmployerCost: number;
  departmentBreakdown: Array<{
    department: string;
    headcount: number;
    grossPay: number;
    employerContributions: number;
    totalCost: number;
    costSharePercentage: number;
  }>;
  branchBreakdown: Array<{
    branch: string;
    headcount: number;
    grossPay: number;
    employerContributions: number;
    totalCost: number;
    costSharePercentage: number;
  }>;
}

// =============================================================================
// PHASE 9: PAYROLL PAYMENTS, DISBURSEMENTS & RECONCILIATION INTERFACES
// =============================================================================

export type PaymentBatchStatus =
  | 'DRAFT'
  | 'READY'
  | 'APPROVED'
  | 'PROCESSING'
  | 'COMPLETED'
  | 'PARTIALLY_FAILED'
  | 'FAILED'
  | 'CANCELLED';

export type PaymentTransactionStatus =
  | 'PENDING'
  | 'PROCESSING'
  | 'SUCCESS'
  | 'FAILED'
  | 'REVERSED';

export type PaymentReconciliationStatus =
  | 'NOT_RECONCILED'
  | 'IN_PROGRESS'
  | 'RECONCILED'
  | 'EXCEPTIONS_FOUND';

export interface PaymentBatchData {
  id: string;
  batchNumber: string;
  name: string;
  payrollPeriodId: string;
  payrollRunId: string;
  paymentMethod: string;
  totalEmployees: number;
  totalAmount: number;
  successfulCount: number;
  successfulAmount: number;
  failedCount: number;
  failedAmount: number;
  status: PaymentBatchStatus;
  createdById?: string | null;
  approvedById?: string | null;
  approvedAt?: Date | string | null;
  processedById?: string | null;
  processedAt?: Date | string | null;
  notes?: string | null;
  rejectionReason?: string | null;
  isReconciled: boolean;
  createdAt: Date | string;
  updatedAt: Date | string;
  payrollPeriod?: {
    id: string;
    periodNumber: string;
    name: string;
    payrollMonth: number;
    payrollYear: number;
  };
  payrollRun?: {
    id: string;
    runNumber: string;
    status: string;
    totalNetPay: number;
  };
  createdBy?: { id: string; firstName: string; lastName: string; email: string } | null;
  approvedBy?: { id: string; firstName: string; lastName: string; email: string } | null;
  processedBy?: { id: string; firstName: string; lastName: string; email: string } | null;
  transactions?: PaymentTransactionData[];
}

export interface PaymentTransactionData {
  id: string;
  transactionNumber: string;
  paymentBatchId: string;
  employeeId: string;
  payrollRecordId: string;
  paymentMethod: string;
  accountNumber?: string | null;
  maskedAccount?: string;
  bankName?: string | null;
  phoneNumber?: string | null;
  maskedPhone?: string;
  amount: number;
  status: PaymentTransactionStatus;
  provider: string;
  providerReference?: string | null;
  internalReference: string;
  idempotencyKey: string;
  failureCode?: string | null;
  failureMessage?: string | null;
  retryCount: number;
  lastRetriedAt?: Date | string | null;
  initiatedAt?: Date | string | null;
  completedAt?: Date | string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
  employee?: {
    id: string;
    employeeNumber: string;
    fullName: string;
    department?: { name: string } | null;
    station?: { name: string } | null;
    nationalId?: string;
  };
  paymentBatch?: {
    id: string;
    batchNumber: string;
    name: string;
    status: string;
    payrollPeriod?: { name: string };
  };
}

export interface PaymentReceiptData {
  transactionNumber: string;
  providerReference: string;
  internalReference: string;
  status: PaymentTransactionStatus;
  amount: number;
  paymentMethod: string;
  paymentDate: string;
  paidAt: string;
  destinationMasked: string;
  bankName?: string;
  company: {
    name: string;
    tagline: string;
    kraPin: string;
    address: string;
    email: string;
    phone: string;
  };
  employee: {
    employeeNumber: string;
    fullName: string;
    nationalId: string;
    jobTitle: string;
    department: string;
    station: string;
  };
  payrollPeriod: {
    name: string;
    periodNumber: string;
    runNumber: string;
  };
}

export interface PaymentDiscrepancyItem {
  employeeId: string;
  employeeNumber: string;
  fullName: string;
  department: string;
  station: string;
  expectedNetPay: number;
  actualPaidAmount: number;
  difference: number;
  paymentMethod: string;
  paymentStatus: string;
  providerReference?: string | null;
  discrepancyType:
    | 'EXACT_MATCH'
    | 'MISSING_PAYMENT'
    | 'UNDERPAYMENT'
    | 'OVERPAYMENT'
    | 'FAILED_PAYMENT'
    | 'DUPLICATE_ATTEMPT';
  notes: string;
}

export interface PaymentReconciliationData {
  id: string;
  reconciliationNumber: string;
  payrollPeriodId: string;
  payrollRunId: string;
  paymentBatchId?: string | null;
  status: PaymentReconciliationStatus;
  expectedAmount: number;
  actualPaidAmount: number;
  discrepancyAmount: number;
  totalExpectedEmployees: number;
  totalPaidEmployees: number;
  exceptionsCount: number;
  reconciliationDetails?: PaymentDiscrepancyItem[];
  performedById?: string | null;
  performedAt: Date | string;
  notes?: string | null;
  createdAt: Date | string;
  payrollPeriod?: { name: string; periodNumber: string };
  payrollRun?: { runNumber: string };
  paymentBatch?: { batchNumber: string; name: string };
  performedBy?: { firstName: string; lastName: string; email: string } | null;
}

export interface DisbursementDashboardStats {
  payrollPeriodId: string;
  periodName: string;
  runNumber: string;
  totalEmployees: number;
  totalNetPayroll: number;
  pendingCount: number;
  pendingAmount: number;
  processingCount: number;
  processingAmount: number;
  successfulCount: number;
  successfulAmount: number;
  failedCount: number;
  failedAmount: number;
  completionPercentage: number;
  batchesCount: number;
  reconciliationStatus: PaymentReconciliationStatus;
}

// =============================================================================
// PHASE 10: EMPLOYEE SELF-SERVICE PORTAL & HR REQUESTS INTERFACES
// =============================================================================

export type HRRequestType =
  | 'PROFILE_UPDATE'
  | 'BANK_DETAILS_CHANGE'
  | 'MPESA_CHANGE'
  | 'ATTENDANCE_CORRECTION'
  | 'LEAVE_REQUEST'
  | 'PAYSLIP_ISSUE'
  | 'PAYROLL_QUERY'
  | 'EMPLOYMENT_LETTER'
  | 'GENERAL_HR_QUERY';

export type HRRequestStatus =
  | 'SUBMITTED'
  | 'UNDER_REVIEW'
  | 'APPROVED'
  | 'REJECTED'
  | 'RESOLVED'
  | 'CANCELLED';

export type HRRequestPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';

export interface HRRequestData {
  id: string;
  requestNumber: string;
  employeeId: string;
  requestType: HRRequestType;
  subject: string;
  description: string;
  priority: HRRequestPriority;
  status: HRRequestStatus;
  proposedData?: string | null;
  previousData?: string | null;
  employeeVisibleResponse?: string | null;
  internalHrNotes?: string | null;
  assignedToId?: string | null;
  reviewedById?: string | null;
  reviewedAt?: Date | string | null;
  resolvedAt?: Date | string | null;
  rejectionReason?: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
  employee?: {
    id: string;
    employeeNumber: string;
    fullName: string;
    jobTitle: string;
    department?: { name: string } | null;
    station?: { name: string } | null;
    primaryPhone: string;
    email?: string | null;
  };
  assignedTo?: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  } | null;
  reviewedBy?: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  } | null;
  documents?: {
    id: string;
    fileName: string;
    fileSize: number;
    mimeType: string;
    createdAt: Date | string;
  }[];
}

export interface EmployeeDashboardStats {
  employee: {
    id: string;
    employeeNumber: string;
    fullName: string;
    jobTitle: string;
    department: string;
    station: string;
    employmentStatus: string;
    employmentType: string;
    avatarUrl?: string | null;
  };
  currentNetPay: number;
  latestPayslip: {
    id: string;
    periodName: string;
    periodNumber: string;
    netPay: number;
    grossPay: number;
    totalDeductions: number;
    paymentStatus: string;
    payDate?: string | null;
  } | null;
  leaveSummary: {
    annualAvailable: number;
    sickAvailable: number;
    pendingApplications: number;
  };
  attendanceSummary: {
    month: string;
    daysPresent: number;
    daysAbsent: number;
    daysLate: number;
    overtimeHours: number;
  };
  pendingRequestsCount: number;
  lastPayment: {
    transactionNumber: string;
    amount: number;
    paymentMethod: string;
    status: string;
    paidAt?: string | null;
  } | null;
}




