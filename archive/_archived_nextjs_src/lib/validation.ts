import { z } from 'zod';
import { normalizeKenyanPhone } from './employee-utils';

// Authentication Schemas
export const loginSchema = z.object({
  email: z.string().trim().email('Please enter a valid corporate email address.'),
  password: z.string().min(1, 'Password is required.'),
});

export const passwordResetRequestSchema = z.object({
  email: z.string().trim().email('Please enter a valid corporate email address.'),
});

export const passwordResetConfirmSchema = z.object({
  token: z.string().min(1, 'Reset token is required.'),
  newPassword: z
    .string()
    .min(8, 'Password must be at least 8 characters long.')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter.')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter.')
    .regex(/[0-9]/, 'Password must contain at least one number.')
    .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special symbol.'),
});

// User Management Schemas
export const createUserSchema = z.object({
  email: z.string().trim().toLowerCase().email('Please enter a valid email address.'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters.')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter.')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter.')
    .regex(/[0-9]/, 'Password must contain at least one digit.'),
  firstName: z.string().trim().min(1, 'First name is required.').max(50),
  lastName: z.string().trim().min(1, 'Last name is required.').max(50),
  phone: z.string().trim().optional().or(z.literal('')),
  roles: z.array(z.string()).min(1, 'At least one role must be assigned.'),
  isActive: z.boolean().default(true),
});

export const updateUserSchema = z.object({
  firstName: z.string().trim().min(1, 'First name is required.').max(50).optional(),
  lastName: z.string().trim().min(1, 'Last name is required.').max(50).optional(),
  phone: z.string().trim().optional().or(z.literal('')),
  isActive: z.boolean().optional(),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters.')
    .optional()
    .or(z.literal('')),
  roles: z.array(z.string()).optional(),
});

export const assignRolesSchema = z.object({
  userId: z.string().min(1, 'User ID is required.'),
  roleIds: z.array(z.string()).min(1, 'Select at least one role.'),
});

// Company Settings Schema
export const companySettingsSchema = z.object({
  companyName: z.string().trim().min(2, 'Company name must be at least 2 characters.').max(100),
  registrationNumber: z.string().trim().max(50).optional().nullable(),
  kraPin: z
    .string()
    .trim()
    .regex(/^[A-Z][0-9]{9}[A-Z]$/, 'KRA PIN must be in standard Kenya format (e.g. P051234567Z)')
    .optional()
    .nullable()
    .or(z.literal('')),
  phone: z.string().trim().max(30).optional().nullable(),
  email: z.string().trim().email('Invalid company email address.').optional().nullable().or(z.literal('')),
  physicalAddress: z.string().trim().max(255).optional().nullable(),
  postalAddress: z.string().trim().max(255).optional().nullable(),
  website: z.string().trim().url('Invalid website URL.').optional().nullable().or(z.literal('')),
  defaultCurrency: z.string().trim().min(2).max(10).default('KES'),
  country: z.string().trim().min(2).max(50).default('Kenya'),
  timezone: z.string().trim().default('Africa/Nairobi'),
});

// =============================================================================
// PHASE 3: ORGANIZATIONAL UNITS SCHEMAS
// =============================================================================

export const branchSchema = z.object({
  code: z
    .string()
    .trim()
    .min(2, 'Branch code must be at least 2 characters.')
    .max(20)
    .toUpperCase(),
  name: z.string().trim().min(2, 'Branch name must be at least 2 characters.').max(100),
  location: z.string().trim().max(255).optional().nullable(),
  county: z.string().trim().max(50).optional().nullable().or(z.literal('')),
  townCity: z.string().trim().max(50).optional().nullable().or(z.literal('')),
  physicalAddress: z.string().trim().max(255).optional().nullable().or(z.literal('')),
  contactPerson: z.string().trim().max(100).optional().nullable().or(z.literal('')),
  phone: z.string().trim().max(30).optional().nullable().or(z.literal('')),
  email: z.string().trim().email('Invalid email address.').optional().nullable().or(z.literal('')),
  branchManagerId: z.string().optional().nullable().or(z.literal('')),
  isActive: z.boolean().default(true),
});

export const departmentSchema = z.object({
  code: z
    .string()
    .trim()
    .min(2, 'Department code must be at least 2 characters.')
    .max(20)
    .toUpperCase(),
  name: z.string().trim().min(2, 'Department name must be at least 2 characters.').max(100),
  description: z.string().trim().max(255).optional().nullable().or(z.literal('')),
  branchId: z.string().optional().nullable().or(z.literal('')),
  departmentHeadId: z.string().optional().nullable().or(z.literal('')),
  isActive: z.boolean().default(true),
});

export const stationSchema = z.object({
  code: z
    .string()
    .trim()
    .min(2, 'Station code must be at least 2 characters.')
    .max(20)
    .toUpperCase(),
  name: z.string().trim().min(2, 'Station name must be at least 2 characters.').max(100),
  clientLocationName: z.string().trim().max(150).optional().nullable().or(z.literal('')),
  physicalLocation: z.string().trim().max(255).optional().nullable().or(z.literal('')),
  county: z.string().trim().max(50).optional().nullable().or(z.literal('')),
  townCity: z.string().trim().max(50).optional().nullable().or(z.literal('')),
  address: z.string().trim().max(255).optional().nullable().or(z.literal('')),
  branchId: z.string().min(1, 'Assigned branch is required.'),
  supervisorId: z.string().optional().nullable().or(z.literal('')),
  requiredStaffing: z.coerce.number().min(0, 'Required staffing cannot be negative.').default(0),
  isActive: z.boolean().default(true),
});

export const positionSchema = z.object({
  code: z
    .string()
    .trim()
    .min(2, 'Position code must be at least 2 characters.')
    .max(25)
    .toUpperCase(),
  title: z.string().trim().min(2, 'Position title must be at least 2 characters.').max(100),
  description: z.string().trim().max(255).optional().nullable().or(z.literal('')),
  departmentId: z.string().min(1, 'Assigned department is required.'),
  employmentCategory: z.enum([
    'SECURITY_GUARD',
    'PATROL_SUPERVISOR',
    'OFFICE_STAFF',
    'MANAGEMENT',
    'OPERATIONS',
  ]).default('SECURITY_GUARD'),
  isActive: z.boolean().default(true),
});

export const employeeTransferSchema = z.object({
  branchId: z.string().min(1, 'Target branch is required.'),
  departmentId: z.string().min(1, 'Target department is required.'),
  stationId: z.string().optional().nullable().or(z.literal('')),
  positionId: z.string().optional().nullable().or(z.literal('')),
  jobTitle: z.string().trim().min(2, 'Job title is required.').max(100).optional(),
  supervisorId: z.string().optional().nullable().or(z.literal('')),
  effectiveDate: z.string().min(1, 'Effective transfer start date is required.'),
  reason: z.string().trim().min(3, 'Transfer justification reason is required.'),
});

// Next of Kin and Emergency Contact
export const nextOfKinSchema = z.object({
  fullName: z.string().trim().min(2, 'Next of kin full name is required.'),
  relationship: z.string().trim().min(1, 'Relationship is required.'),
  primaryPhone: z.string().trim().min(6, 'Valid primary phone is required.'),
  alternativePhone: z.string().trim().optional().nullable().or(z.literal('')),
  email: z.string().trim().email('Invalid email.').optional().nullable().or(z.literal('')),
  physicalAddress: z.string().trim().optional().nullable().or(z.literal('')),
  percentageShare: z.number().min(0).max(100).optional().default(100),
  isPrimary: z.boolean().default(true),
});

export const emergencyContactSchema = z.object({
  fullName: z.string().trim().min(2, 'Emergency contact name is required.'),
  relationship: z.string().trim().min(1, 'Relationship is required.'),
  primaryPhone: z.string().trim().min(6, 'Valid primary phone is required.'),
  alternativePhone: z.string().trim().optional().nullable().or(z.literal('')),
  physicalAddress: z.string().trim().optional().nullable().or(z.literal('')),
});

export const createEmployeeSchema = z.object({
  employeeNumber: z.string().trim().optional(),
  firstName: z.string().trim().min(2, 'First name must be at least 2 characters.').max(50),
  middleName: z.string().trim().max(50).optional().nullable().or(z.literal('')),
  lastName: z.string().trim().min(2, 'Last name must be at least 2 characters.').max(50),
  nationalId: z.string().trim().min(5, 'National ID/Passport number is required.').max(20),
  dateOfBirth: z.string().optional().nullable().or(z.literal('')),
  gender: z.enum(['MALE', 'FEMALE', 'OTHER']),
  maritalStatus: z.enum(['SINGLE', 'MARRIED', 'DIVORCED', 'WIDOWED']).optional().nullable().or(z.literal('')),
  nationality: z.string().trim().default('Kenyan'),
  profilePhotoUrl: z.string().optional().nullable().or(z.literal('')),

  // Contact Info
  primaryPhone: z
    .string()
    .trim()
    .min(6, 'Primary phone is required.')
    .transform((val) => normalizeKenyanPhone(val) || val),
  alternativePhone: z
    .string()
    .trim()
    .optional()
    .nullable()
    .or(z.literal(''))
    .transform((val) => (val ? normalizeKenyanPhone(val) || val : null)),
  email: z.string().trim().email('Invalid email address.').optional().nullable().or(z.literal('')),
  physicalAddress: z.string().trim().optional().nullable().or(z.literal('')),
  county: z.string().trim().optional().nullable().or(z.literal('')),
  townCity: z.string().trim().optional().nullable().or(z.literal('')),
  postalAddress: z.string().trim().optional().nullable().or(z.literal('')),

  // Employment Info
  employmentDate: z.string().min(1, 'Employment start date is required.'),
  contractStartDate: z.string().optional().nullable().or(z.literal('')),
  contractEndDate: z.string().optional().nullable().or(z.literal('')),
  employmentType: z.enum([
    'PERMANENT',
    'CONTRACT',
    'TEMPORARY',
    'CASUAL',
    'PART_TIME',
    'INTERNSHIP',
  ]).default('PERMANENT'),
  jobTitle: z.string().trim().min(2, 'Job title is required.').max(100),
  positionId: z.string().optional().nullable().or(z.literal('')),
  departmentId: z.string().optional().nullable().or(z.literal('')),
  branchId: z.string().optional().nullable().or(z.literal('')),
  stationId: z.string().optional().nullable().or(z.literal('')),
  supervisorId: z.string().optional().nullable().or(z.literal('')),
  employmentStatus: z.enum([
    'ACTIVE',
    'ON_LEAVE',
    'SUSPENDED',
    'TERMINATED',
    'RESIGNED',
    'RETIRED',
    'INACTIVE',
  ]).default('ACTIVE'),

  // Payment Details
  preferredPaymentMethod: z.enum(['BANK', 'MPESA']).default('BANK'),
  bankName: z.string().trim().optional().nullable().or(z.literal('')),
  bankAccountName: z.string().trim().optional().nullable().or(z.literal('')),
  bankAccountNumber: z.string().trim().optional().nullable().or(z.literal('')),
  bankBranch: z.string().trim().optional().nullable().or(z.literal('')),
  bankBranchCode: z.string().trim().optional().nullable().or(z.literal('')),
  mpesaPhoneNumber: z
    .string()
    .trim()
    .optional()
    .nullable()
    .or(z.literal(''))
    .transform((val) => (val ? normalizeKenyanPhone(val) || val : null)),

  // Statutory Details
  kraPin: z
    .string()
    .trim()
    .toUpperCase()
    .optional()
    .nullable()
    .or(z.literal('')),
  nssfNumber: z.string().trim().optional().nullable().or(z.literal('')),
  shaNumber: z.string().trim().optional().nullable().or(z.literal('')),
  housingLevyNumber: z.string().trim().optional().nullable().or(z.literal('')),
  helbNumber: z.string().trim().optional().nullable().or(z.literal('')),

  // Nested structures
  nextOfKin: z.array(nextOfKinSchema).optional(),
  emergencyContacts: z.array(emergencyContactSchema).optional(),
});

export const updateEmployeeSchema = createEmployeeSchema.partial();

export const changeEmployeeStatusSchema = z.object({
  status: z.enum([
    'ACTIVE',
    'ON_LEAVE',
    'SUSPENDED',
    'TERMINATED',
    'RESIGNED',
    'RETIRED',
    'INACTIVE',
  ]),
  reason: z.string().trim().min(3, 'Reason for status change is required.'),
});

export const archiveEmployeeSchema = z.object({
  reason: z.string().trim().min(3, 'Reason for archiving is required.'),
});

// =============================================================================
// PHASE 4: ATTENDANCE & TIME MANAGEMENT SCHEMAS
// =============================================================================

export const timeStringRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;

export const shiftSchema = z.object({
  code: z
    .string()
    .trim()
    .min(2, 'Shift code must be at least 2 characters.')
    .max(25)
    .toUpperCase(),
  name: z.string().trim().min(2, 'Shift name is required.').max(100),
  startTime: z
    .string()
    .trim()
    .regex(timeStringRegex, 'Start time must be in HH:mm format (e.g. 06:00, 18:00)'),
  endTime: z
    .string()
    .trim()
    .regex(timeStringRegex, 'End time must be in HH:mm format (e.g. 18:00, 06:00)'),
  shiftType: z.enum(['DAY', 'NIGHT', 'MORNING', 'EVENING', 'CUSTOM']).default('DAY'),
  isOvernight: z.boolean().default(false),
  gracePeriodMinutes: z.coerce.number().min(0).max(120).default(15),
  breakDurationMinutes: z.coerce.number().min(0).max(360).default(60),
  isBreakPaid: z.boolean().default(false),
  breakStartTime: z.string().regex(timeStringRegex, 'Break start time must be HH:mm').optional().nullable().or(z.literal('')),
  breakEndTime: z.string().regex(timeStringRegex, 'Break end time must be HH:mm').optional().nullable().or(z.literal('')),
  status: z.enum(['ACTIVE', 'INACTIVE']).default('ACTIVE'),
});

export const workScheduleSchema = z.object({
  code: z
    .string()
    .trim()
    .min(2, 'Schedule code must be at least 2 characters.')
    .max(25)
    .toUpperCase(),
  name: z.string().trim().min(2, 'Schedule name is required.').max(100),
  description: z.string().trim().max(255).optional().nullable().or(z.literal('')),
  patternType: z.enum(['STANDARD_WEEKLY', 'ROTATION_6_1', 'ROTATION_7_7', 'CUSTOM_ROTATION']).default('STANDARD_WEEKLY'),
  cycleDays: z.coerce.number().min(1).max(60).default(7),
  scheduleConfig: z.string().optional().nullable().or(z.literal('')),
  isActive: z.boolean().default(true),
});

export const employeeShiftAssignmentSchema = z.object({
  employeeId: z.string().min(1, 'Employee is required.'),
  shiftId: z.string().optional().nullable().or(z.literal('')),
  workScheduleId: z.string().optional().nullable().or(z.literal('')),
  stationId: z.string().optional().nullable().or(z.literal('')),
  startDate: z.string().min(1, 'Assignment start date is required.'),
  endDate: z.string().optional().nullable().or(z.literal('')),
  status: z.enum(['ACTIVE', 'ENDED', 'TRANSFERRED']).default('ACTIVE'),
  notes: z.string().trim().max(255).optional().nullable().or(z.literal('')),
});

export const publicHolidaySchema = z.object({
  name: z.string().trim().min(2, 'Holiday name is required.').max(100),
  date: z.string().min(1, 'Holiday date (YYYY-MM-DD) is required.'),
  country: z.string().trim().default('Kenya'),
  description: z.string().trim().max(255).optional().nullable().or(z.literal('')),
  isActive: z.boolean().default(true),
});

export const clockEventSchema = z.object({
  employeeId: z.string().optional(), // Inferred from user if not provided
  eventType: z.enum(['CLOCK_IN', 'CLOCK_OUT', 'BREAK_START', 'BREAK_END']),
  timestamp: z.string().optional(),
  source: z.enum(['PORTAL', 'HR_MANUAL', 'IMPORT', 'BIOMETRIC_DEVICE']).default('PORTAL'),
  deviceInfo: z.string().trim().optional().nullable().or(z.literal('')),
  notes: z.string().trim().max(255).optional().nullable().or(z.literal('')),
  locationLat: z.coerce.number().optional().nullable(),
  locationLng: z.coerce.number().optional().nullable(),
});

export const attendanceRecordCreateSchema = z.object({
  employeeId: z.string().min(1, 'Employee is required.'),
  date: z.string().min(1, 'Work date is required (YYYY-MM-DD).'),
  scheduledShiftId: z.string().optional().nullable().or(z.literal('')),
  scheduledStartTime: z.string().regex(timeStringRegex, 'HH:mm format').optional().nullable().or(z.literal('')),
  scheduledEndTime: z.string().regex(timeStringRegex, 'HH:mm format').optional().nullable().or(z.literal('')),
  actualClockIn: z.string().optional().nullable().or(z.literal('')),
  actualClockOut: z.string().optional().nullable().or(z.literal('')),
  breakDurationMinutes: z.coerce.number().min(0).max(360).default(60),
  attendanceStatus: z.enum([
    'PRESENT',
    'ABSENT',
    'LATE',
    'EARLY_DEPARTURE',
    'PRESENT_WITH_OVERTIME',
    'OFF_DAY',
    'REST_DAY',
    'PUBLIC_HOLIDAY',
    'ON_LEAVE',
    'SICK_LEAVE',
    'EXCUSED_ABSENCE',
    'MISSING_CLOCK_OUT',
  ]).default('PRESENT'),
  source: z.enum(['PORTAL', 'HR_MANUAL', 'IMPORT', 'BIOMETRIC_DEVICE']).default('HR_MANUAL'),
  notes: z.string().trim().max(255).optional().nullable().or(z.literal('')),
  approvalStatus: z.enum(['DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'LOCKED']).default('SUBMITTED'),
});

export const attendanceCorrectionSchema = z.object({
  attendanceRecordId: z.string().min(1, 'Attendance record ID is required.'),
  fieldChanged: z.enum(['CLOCK_IN', 'CLOCK_OUT', 'STATUS', 'WORKED_MINUTES', 'OVERTIME']),
  newValue: z.string().min(1, 'New value is required.'),
  reason: z.string().trim().min(5, 'Detailed reason for attendance correction is required.'),
});

export const overtimeRecordSchema = z.object({
  employeeId: z.string().min(1, 'Employee is required.'),
  attendanceRecordId: z.string().optional().nullable().or(z.literal('')),
  date: z.string().min(1, 'Date is required (YYYY-MM-DD).'),
  scheduledHours: z.coerce.number().min(0).default(0),
  actualHours: z.coerce.number().min(0),
  overtimeHours: z.coerce.number().min(0.25, 'Minimum overtime claim is 15 minutes (0.25h).'),
  reason: z.string().trim().min(3, 'Reason for overtime is required.'),
  comments: z.string().trim().max(255).optional().nullable().or(z.literal('')),
});

export const attendanceApprovalSchema = z.object({
  recordIds: z.array(z.string()).min(1, 'At least one record must be selected for approval.'),
  action: z.enum(['APPROVE', 'REJECT', 'UNDER_REVIEW']),
  notes: z.string().trim().max(255).optional().nullable().or(z.literal('')),
});

export const attendanceLockSchema = z.object({
  year: z.coerce.number().min(2020).max(2050),
  month: z.coerce.number().min(1).max(12),
  stationId: z.string().optional().nullable().or(z.literal('')),
  branchId: z.string().optional().nullable().or(z.literal('')),
  reason: z.string().trim().min(3, 'Lock reason or period name is required.'),
});

// =============================================================================
// PHASE 5: LEAVE MANAGEMENT SCHEMAS
// =============================================================================

export const leaveTypeSchema = z.object({
  code: z
    .string()
    .trim()
    .min(2, 'Leave type code must be at least 2 characters.')
    .max(25)
    .toUpperCase(),
  name: z.string().trim().min(2, 'Leave type name is required.').max(100),
  description: z.string().trim().max(255).optional().nullable().or(z.literal('')),
  isPaid: z.boolean().default(true),
  defaultDays: z.coerce.number().min(0).max(365).default(21),
  maxDays: z.coerce.number().min(0).max(365).optional().nullable(),
  requiresApproval: z.boolean().default(true),
  requiresDocument: z.boolean().default(false),
  requiresMedicalCert: z.boolean().default(false),
  genderApplicability: z.enum(['ALL', 'MALE', 'FEMALE']).default('ALL'),
  color: z.string().trim().default('#2563eb'),
  status: z.enum(['ACTIVE', 'INACTIVE']).default('ACTIVE'),
});

export const leavePolicySchema = z.object({
  leaveTypeId: z.string().min(1, 'Associated leave type is required.'),
  policyName: z.string().trim().min(2, 'Policy name is required.').max(100),
  policyCode: z
    .string()
    .trim()
    .min(2, 'Policy code must be at least 2 characters.')
    .max(30)
    .toUpperCase(),
  entitledDays: z.coerce.number().min(0).max(365).default(21),
  accrualMethod: z.enum(['ANNUAL_ALLOCATION', 'MONTHLY_ACCRUAL', 'CUSTOM']).default('ANNUAL_ALLOCATION'),
  accrualFrequency: z.enum(['MONTHLY', 'YEARLY', 'QUARTERLY']).default('YEARLY'),
  allowCarryForward: z.boolean().default(true),
  maxCarryForwardDays: z.coerce.number().min(0).max(60).default(5),
  carryForwardExpiryMonths: z.coerce.number().min(0).max(12).default(3),
  minServiceDays: z.coerce.number().min(0).max(365).default(90),
  prorationRule: z.enum(['NONE', 'PRORATED_BY_MONTH', 'PRORATED_BY_DAY']).default('PRORATED_BY_MONTH'),
  excludeWeekends: z.boolean().default(true),
  excludeHolidays: z.boolean().default(true),
  allowAdvanceLeave: z.boolean().default(false),
  maxAdvanceDays: z.coerce.number().min(0).max(30).default(0),
  effectiveDate: z.string().optional(),
  status: z.enum(['ACTIVE', 'INACTIVE']).default('ACTIVE'),
});

export const leaveRequestCreateSchema = z.object({
  employeeId: z.string().min(1, 'Employee is required.'),
  leaveTypeId: z.string().min(1, 'Leave type is required.'),
  leaveYear: z.coerce.number().min(2020).max(2050).default(new Date().getFullYear()),
  startDate: z.string().min(1, 'Leave start date is required.'),
  endDate: z.string().min(1, 'Leave end date is required.'),
  durationDays: z.coerce.number().min(0.5, 'Minimum leave duration is 0.5 days.').optional(),
  isHalfDay: z.boolean().default(false),
  halfDaySession: z.enum(['MORNING', 'AFTERNOON']).optional().nullable().or(z.literal('')),
  reason: z.string().trim().min(3, 'Leave reason is required.').max(500),
  contactPhone: z.string().trim().max(30).optional().nullable().or(z.literal('')),
  contactAddress: z.string().trim().max(255).optional().nullable().or(z.literal('')),
  emergencyContact: z.string().trim().max(255).optional().nullable().or(z.literal('')),
  relieverEmployeeId: z.string().optional().nullable().or(z.literal('')),
});

export const leaveApprovalActionSchema = z.object({
  action: z.enum(['APPROVE', 'REJECT']),
  comments: z.string().trim().max(500).optional().nullable().or(z.literal('')),
});

export const leaveCancelActionSchema = z.object({
  reason: z.string().trim().min(3, 'Reason for cancellation is required.').max(500),
});

export const leaveAdjustmentCreateSchema = z.object({
  employeeId: z.string().min(1, 'Employee is required.'),
  leaveTypeId: z.string().min(1, 'Leave type is required.'),
  leaveYear: z.coerce.number().min(2020).max(2050).default(new Date().getFullYear()),
  adjustmentType: z.enum(['ADDITION', 'DEDUCTION', 'CARRY_FORWARD', 'CARRY_FORWARD_EXPIRY', 'CORRECTION']),
  adjustmentDays: z.coerce.number().refine((val) => val !== 0, 'Adjustment days cannot be zero.'),
  reason: z.string().trim().min(5, 'Detailed reason for balance adjustment is required.').max(255),
});

export const leaveEntitlementInitSchema = z.object({
  leaveYear: z.coerce.number().min(2020).max(2050).default(new Date().getFullYear()),
  leaveTypeId: z.string().optional().nullable().or(z.literal('')),
  employeeIds: z.array(z.string()).optional(),
});

// =============================================================================
// PHASE 6: PAYROLL CONFIGURATION & SALARY STRUCTURE SCHEMAS
// =============================================================================

export const payrollPeriodSchema = z.object({
  periodNumber: z
    .string()
    .trim()
    .min(3, 'Period code must be at least 3 characters.')
    .max(30)
    .toUpperCase(),
  name: z.string().trim().min(3, 'Period name is required.').max(100),
  startDate: z.string().min(1, 'Start date is required.'),
  endDate: z.string().min(1, 'End date is required.'),
  payrollMonth: z.coerce.number().min(1).max(12),
  payrollYear: z.coerce.number().min(2020).max(2050),
  payFrequency: z.enum(['MONTHLY', 'WEEKLY', 'BI_WEEKLY', 'DAILY']).default('MONTHLY'),
  status: z.enum(['DRAFT', 'OPEN', 'PROCESSING', 'PENDING_APPROVAL', 'APPROVED', 'FINALIZED', 'LOCKED', 'CLOSED']).default('OPEN'),
  cutoffDate: z.string().optional().nullable().or(z.literal('')),
  paymentDate: z.string().optional().nullable().or(z.literal('')),
  notes: z.string().trim().max(255).optional().nullable().or(z.literal('')),
});

export const salaryRecordCreateSchema = z.object({
  employeeId: z.string().min(1, 'Employee is required.'),
  basicSalary: z.coerce.number().min(1, 'Basic salary must be greater than 0.'),
  payFrequency: z.enum(['MONTHLY', 'WEEKLY', 'BI_WEEKLY', 'DAILY']).default('MONTHLY'),
  currency: z.string().trim().default('KES'),
  effectiveFrom: z.string().min(1, 'Effective date is required.'),
  effectiveTo: z.string().optional().nullable().or(z.literal('')),
  isOvertimeEligible: z.boolean().default(true),
  changeReason: z.string().trim().min(3, 'Reason for salary assignment is required.').max(255),
  status: z.enum(['PENDING_APPROVAL', 'ACTIVE', 'SUPERSEDED', 'REJECTED', 'INACTIVE']).default('ACTIVE'),
  notes: z.string().trim().max(255).optional().nullable().or(z.literal('')),
});

export const salaryRevisionProposeSchema = z.object({
  employeeId: z.string().min(1, 'Employee is required.'),
  proposedSalary: z.coerce.number().min(1, 'Proposed salary must be greater than 0.'),
  effectiveFrom: z.string().min(1, 'Effective date for proposed salary is required.'),
  payFrequency: z.enum(['MONTHLY', 'WEEKLY', 'BI_WEEKLY', 'DAILY']).default('MONTHLY'),
  isOvertimeEligible: z.boolean().default(true),
  changeReason: z.string().trim().min(5, 'Detailed reason for salary revision is required.').max(255),
  notes: z.string().trim().max(255).optional().nullable().or(z.literal('')),
});

export const salaryApprovalSchema = z.object({
  action: z.enum(['APPROVE', 'REJECT']),
  notes: z.string().trim().max(255).optional().nullable().or(z.literal('')),
});

export const allowanceTypeSchema = z.object({
  code: z
    .string()
    .trim()
    .min(2, 'Allowance code must be at least 2 characters.')
    .max(25)
    .toUpperCase(),
  name: z.string().trim().min(2, 'Allowance name is required.').max(100),
  description: z.string().trim().max(255).optional().nullable().or(z.literal('')),
  calculationMethod: z.enum(['FIXED_AMOUNT', 'PERCENTAGE_OF_BASIC', 'PERCENTAGE_OF_GROSS', 'MANUAL']).default('FIXED_AMOUNT'),
  defaultAmount: z.coerce.number().min(0).default(0),
  percentageValue: z.coerce.number().min(0).max(100).optional().nullable(),
  isTaxable: z.boolean().default(true),
  isPensionable: z.boolean().default(false),
  isRecurring: z.boolean().default(true),
  effectiveDate: z.string().optional(),
  status: z.enum(['ACTIVE', 'INACTIVE']).default('ACTIVE'),
});

export const employeeAllowanceSchema = z.object({
  employeeId: z.string().min(1, 'Employee is required.'),
  allowanceTypeId: z.string().min(1, 'Allowance type is required.'),
  amount: z.coerce.number().min(0).default(0),
  calculationMethod: z.enum(['FIXED_AMOUNT', 'PERCENTAGE_OF_BASIC', 'PERCENTAGE_OF_GROSS', 'MANUAL']).default('FIXED_AMOUNT'),
  percentageValue: z.coerce.number().min(0).max(100).optional().nullable(),
  effectiveFrom: z.string().min(1, 'Effective date is required.'),
  effectiveTo: z.string().optional().nullable().or(z.literal('')),
  isRecurring: z.boolean().default(true),
  status: z.enum(['ACTIVE', 'INACTIVE', 'SUPERSEDED']).default('ACTIVE'),
  notes: z.string().trim().max(255).optional().nullable().or(z.literal('')),
});

export const deductionTypeSchema = z.object({
  code: z
    .string()
    .trim()
    .min(2, 'Deduction code must be at least 2 characters.')
    .max(25)
    .toUpperCase(),
  name: z.string().trim().min(2, 'Deduction name is required.').max(100),
  description: z.string().trim().max(255).optional().nullable().or(z.literal('')),
  calculationMethod: z.enum(['FIXED_AMOUNT', 'PERCENTAGE_OF_BASIC', 'PERCENTAGE_OF_GROSS', 'BALANCE_BASED']).default('FIXED_AMOUNT'),
  isStatutory: z.boolean().default(false),
  isRecurring: z.boolean().default(true),
  effectiveDate: z.string().optional(),
  status: z.enum(['ACTIVE', 'INACTIVE']).default('ACTIVE'),
});

export const employeeDeductionSchema = z.object({
  employeeId: z.string().min(1, 'Employee is required.'),
  deductionTypeId: z.string().min(1, 'Deduction type is required.'),
  amount: z.coerce.number().min(0).default(0),
  calculationMethod: z.enum(['FIXED_AMOUNT', 'PERCENTAGE_OF_BASIC', 'PERCENTAGE_OF_GROSS', 'BALANCE_BASED']).default('FIXED_AMOUNT'),
  percentageValue: z.coerce.number().min(0).max(100).optional().nullable(),
  totalTargetAmount: z.coerce.number().min(0).optional().nullable(),
  currentBalance: z.coerce.number().min(0).optional().nullable(),
  effectiveFrom: z.string().min(1, 'Effective date is required.'),
  effectiveTo: z.string().optional().nullable().or(z.literal('')),
  isRecurring: z.boolean().default(true),
  status: z.enum(['ACTIVE', 'INACTIVE', 'SUPERSEDED', 'CLEARED']).default('ACTIVE'),
  notes: z.string().trim().max(255).optional().nullable().or(z.literal('')),
});

export const statutoryRuleSchema = z.object({
  regimeType: z.string().trim().min(2).toUpperCase(),
  name: z.string().trim().min(2).max(100),
  description: z.string().trim().max(255).optional().nullable().or(z.literal('')),
  calculationType: z.enum(['BANDED_PROGRESSIVE', 'FIXED_PERCENTAGE', 'FIXED_AMOUNT', 'CAPPED_PERCENTAGE']).default('BANDED_PROGRESSIVE'),
  employeeRate: z.coerce.number().min(0).max(100).optional().nullable(),
  employerRate: z.coerce.number().min(0).max(100).optional().nullable(),
  minThreshold: z.coerce.number().min(0).optional().nullable().default(0),
  maxThreshold: z.coerce.number().min(0).optional().nullable(),
  capAmount: z.coerce.number().min(0).optional().nullable(),
  effectiveFrom: z.string().optional(),
  effectiveTo: z.string().optional().nullable().or(z.literal('')),
  status: z.enum(['ACTIVE', 'INACTIVE', 'SUPERSEDED']).default('ACTIVE'),
  rulesConfig: z.string().optional().nullable().or(z.literal('')),
});

export const taxBandSchema = z.object({
  statutoryRuleId: z.string().min(1, 'Statutory Rule ID is required.'),
  bandOrder: z.coerce.number().min(1).max(20),
  bandName: z.string().trim().min(2).max(100),
  lowerThreshold: z.coerce.number().min(0),
  upperThreshold: z.coerce.number().min(0).optional().nullable(),
  ratePercentage: z.coerce.number().min(0).max(100),
  taxReliefAnnual: z.coerce.number().min(0).default(28800),
  taxReliefMonthly: z.coerce.number().min(0).default(2400),
  effectiveFrom: z.string().optional(),
  effectiveTo: z.string().optional().nullable().or(z.literal('')),
  status: z.enum(['ACTIVE', 'INACTIVE', 'SUPERSEDED']).default('ACTIVE'),
});

export const overtimeRateConfigSchema = z.object({
  code: z
    .string()
    .trim()
    .min(2)
    .max(25)
    .toUpperCase(),
  name: z.string().trim().min(2).max(100),
  overtimeType: z.enum(['NORMAL', 'REST_DAY', 'PUBLIC_HOLIDAY', 'NIGHT']),
  rateMultiplier: z.coerce.number().min(1.0).max(5.0).default(1.5),
  hourlyDivisor: z.coerce.number().min(50).max(365).default(225),
  requiresApproval: z.boolean().default(true),
  effectiveFrom: z.string().optional(),
  effectiveTo: z.string().optional().nullable().or(z.literal('')),
  status: z.enum(['ACTIVE', 'INACTIVE']).default('ACTIVE'),
});

export const bonusTypeSchema = z.object({
  code: z.string().trim().min(2).max(25).toUpperCase(),
  name: z.string().trim().min(2).max(100),
  description: z.string().trim().max(255).optional().nullable().or(z.literal('')),
  defaultCalculationMethod: z.enum(['FIXED_AMOUNT', 'PERCENTAGE_OF_BASIC']).default('FIXED_AMOUNT'),
  defaultAmount: z.coerce.number().min(0).default(0),
  isTaxable: z.boolean().default(true),
  isRecurring: z.boolean().default(false),
  status: z.enum(['ACTIVE', 'INACTIVE']).default('ACTIVE'),
});

export const commissionTypeSchema = z.object({
  code: z.string().trim().min(2).max(25).toUpperCase(),
  name: z.string().trim().min(2).max(100),
  description: z.string().trim().max(255).optional().nullable().or(z.literal('')),
  calculationMethod: z.string().trim().default('PERCENTAGE'),
  status: z.enum(['ACTIVE', 'INACTIVE']).default('ACTIVE'),
});

export const otherEarningSchema = z.object({
  employeeId: z.string().min(1, 'Employee is required.'),
  payrollPeriodId: z.string().optional().nullable().or(z.literal('')),
  title: z.string().trim().min(2, 'Title is required.').max(100),
  earningType: z.enum(['BACK_PAY', 'ARREARS', 'REIMBURSEMENT', 'SPECIAL_ALLOWANCE', 'BONUS_ONE_OFF', 'COMMISSION_ONE_OFF']),
  amount: z.coerce.number().min(1, 'Amount must be greater than 0.'),
  isTaxable: z.boolean().default(true),
  effectiveDate: z.string().optional(),
  notes: z.string().trim().max(255).optional().nullable().or(z.literal('')),
});

export const otherDeductionSchema = z.object({
  employeeId: z.string().min(1, 'Employee is required.'),
  payrollPeriodId: z.string().optional().nullable().or(z.literal('')),
  title: z.string().trim().min(2, 'Title is required.').max(100),
  deductionType: z.enum(['SALARY_ADVANCE_RECOVERY', 'WELFARE', 'SACCO', 'UNIFORM_RECOVERY', 'AUTHORIZED_FINE', 'COURT_DEDUCTION']),
  amount: z.coerce.number().min(1, 'Amount must be greater than 0.'),
  effectiveDate: z.string().optional(),
  notes: z.string().trim().max(255).optional().nullable().or(z.literal('')),
});

export const companyPayrollSettingSchema = z.object({
  payFrequency: z.enum(['MONTHLY', 'WEEKLY', 'BI_WEEKLY', 'DAILY']).default('MONTHLY'),
  defaultPayDay: z.coerce.number().min(1).max(31).default(28),
  cutoffDay: z.coerce.number().min(1).max(31).default(24),
  defaultCurrency: z.string().trim().default('KES'),
  roundingMethod: z.enum(['ROUND_NEAREST_1', 'ROUND_UP', 'ROUND_DOWN', 'NO_ROUNDING']).default('ROUND_NEAREST_1'),
  prorationBaseDays: z.coerce.number().min(15).max(31).default(30),
  overtimeHourlyDivisor: z.coerce.number().min(100).max(365).default(225),
  allowNegativeNetPay: z.boolean().default(false),
  requireTwoTierApproval: z.boolean().default(true),
  payrollNumberPrefix: z.string().trim().default('PAY-'),
  payslipNumberPrefix: z.string().trim().default('PS-'),
  paymentBatchPrefix: z.string().trim().default('PB-'),
});


