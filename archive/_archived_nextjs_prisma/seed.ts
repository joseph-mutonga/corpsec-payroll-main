import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting CorpSec HR Payroll database seeding (Phases 1, 2, 3 & 4)...');

  // 1. Roles Seed
  const rolesData = [
    {
      name: 'super_admin',
      displayName: 'Super Administrator',
      description: 'Unrestricted system-wide control and audit log authority',
      isSystem: true,
    },
    {
      name: 'hr_admin',
      displayName: 'HR Administrator',
      description: 'Manages employee records, organization structure, shifts, attendance, rosters, and compliance',
      isSystem: true,
    },
    {
      name: 'payroll_officer',
      displayName: 'Payroll Officer',
      description: 'Manages salary parameters, statutory rules, and verified attendance for payroll preparation',
      isSystem: true,
    },
    {
      name: 'hr_manager',
      displayName: 'HR Manager',
      description: 'Approves personnel actions, leave requests, attendance approvals, and department structures',
      isSystem: true,
    },
    {
      name: 'finance',
      displayName: 'Finance Auditor',
      description: 'Audits salary structures, attendance hours, and financial records',
      isSystem: true,
    },
    {
      name: 'employee',
      displayName: 'Standard Employee',
      description: 'Self-service portal access for clock-in/out, leave requests, and schedule viewing',
      isSystem: true,
    },
  ];

  const rolesMap: Record<string, string> = {};

  for (const role of rolesData) {
    const r = await prisma.role.upsert({
      where: { name: role.name },
      update: { displayName: role.displayName, description: role.description },
      create: role,
    });
    rolesMap[role.name] = r.id;
  }
  console.log(`✅ Roles seeded (${Object.keys(rolesMap).length} roles)`);

  // 2. Permissions Seed (Phases 1, 2, 3 & 4)
  const permissionsData = [
    // Users & Roles
    { name: 'users.view', module: 'USERS', description: 'View system users and their assigned roles' },
    { name: 'users.create', module: 'USERS', description: 'Create and invite new internal users' },
    { name: 'users.edit', module: 'USERS', description: 'Update user profiles and reset credentials' },
    { name: 'users.delete', module: 'USERS', description: 'Deactivate or suspend user accounts' },
    { name: 'roles.view', module: 'USERS', description: 'View system roles and permission matrices' },
    { name: 'roles.edit', module: 'USERS', description: 'Modify custom role permission assignments' },

    // Company Settings & Audit
    { name: 'settings.view', module: 'SETTINGS', description: 'View company settings and localization params' },
    { name: 'settings.edit', module: 'SETTINGS', description: 'Update company profile, currency, and tax regime' },
    { name: 'audit.view', module: 'AUDIT', description: 'Inspect immutable system security and audit logs' },

    // Phase 3 Organization Structure Permissions
    { name: 'organization.view', module: 'ORGANIZATION', description: 'View organizational chart and hierarchy tree' },
    { name: 'organization.manage', module: 'ORGANIZATION', description: 'Manage corporate hierarchy alignments' },
    { name: 'branches.view', module: 'ORGANIZATION', description: 'View operating branches list and branch profiles' },
    { name: 'branches.create', module: 'ORGANIZATION', description: 'Create new regional operating branches' },
    { name: 'branches.edit', module: 'ORGANIZATION', description: 'Update branch information and assign branch managers' },
    { name: 'branches.archive', module: 'ORGANIZATION', description: 'Deactivate or archive operating branches' },
    { name: 'branches.manage', module: 'ORGANIZATION', description: 'Full branch administration rights' },
    { name: 'departments.view', module: 'ORGANIZATION', description: 'View departments list and profiles' },
    { name: 'departments.create', module: 'ORGANIZATION', description: 'Create corporate departments' },
    { name: 'departments.edit', module: 'ORGANIZATION', description: 'Update department mandates and appoint department heads' },
    { name: 'departments.archive', module: 'ORGANIZATION', description: 'Deactivate or archive corporate departments' },
    { name: 'departments.manage', module: 'ORGANIZATION', description: 'Full department administration rights' },
    { name: 'stations.view', module: 'ORGANIZATION', description: 'View guarding stations and client deployment locations' },
    { name: 'stations.create', module: 'ORGANIZATION', description: 'Create new security guarding stations and posts' },
    { name: 'stations.edit', module: 'ORGANIZATION', description: 'Update station details, supervisors, and required staffing quotas' },
    { name: 'stations.archive', module: 'ORGANIZATION', description: 'Deactivate or archive guarding stations' },
    { name: 'stations.manage', module: 'ORGANIZATION', description: 'Full station administration rights' },
    { name: 'positions.view', module: 'ORGANIZATION', description: 'View job positions and roles catalog' },
    { name: 'positions.create', module: 'ORGANIZATION', description: 'Create new job positions in departments' },
    { name: 'positions.edit', module: 'ORGANIZATION', description: 'Update job position titles and categories' },
    { name: 'positions.archive', module: 'ORGANIZATION', description: 'Deactivate or archive job positions' },
    { name: 'assignment.view', module: 'ORGANIZATION', description: 'View employee assignment and deployment history' },
    { name: 'assignment.create', module: 'ORGANIZATION', description: 'Assign employees to branches and stations' },
    { name: 'assignment.edit', module: 'ORGANIZATION', description: 'Update active employee assignments' },
    { name: 'assignment.transfer', module: 'ORGANIZATION', description: 'Execute atomic employee transfers across stations and branches' },

    // Phase 2 Employee Management Permissions
    { name: 'employee.view', module: 'HR', description: 'View employee profiles, rosters, and directories' },
    { name: 'employee.create', module: 'HR', description: 'Onboard and create new employee records' },
    { name: 'employee.edit', module: 'HR', description: 'Update employee personal and employment details' },
    { name: 'employee.archive', module: 'HR', description: 'Deactivate and archive employee records' },
    { name: 'employee.restore', module: 'HR', description: 'Restore archived employee records' },
    { name: 'employee.view_sensitive', module: 'HR', description: 'View unmasked bank details, M-Pesa, and statutory numbers' },
    { name: 'employee.edit_sensitive', module: 'HR', description: 'Modify employee payment details and statutory identifiers' },
    { name: 'employee.documents.view', module: 'HR', description: 'View and download employee uploaded documents' },
    { name: 'employee.documents.upload', module: 'HR', description: 'Upload employee compliance and HR documents' },
    { name: 'employee.documents.delete', module: 'HR', description: 'Delete employee documents' },
    { name: 'employee.export', module: 'HR', description: 'Export employee directory to CSV/Excel formats' },

    // =========================================================================
    // PHASE 4: ATTENDANCE & TIME MANAGEMENT PERMISSIONS
    // =========================================================================
    { name: 'attendance.view', module: 'ATTENDANCE', description: 'View attendance records, logs, and summaries' },
    { name: 'attendance.daily.view', module: 'ATTENDANCE', description: 'View daily attendance board' },
    { name: 'attendance.create', module: 'ATTENDANCE', description: 'Log clock-in/out and manual attendance entries' },
    { name: 'attendance.edit', module: 'ATTENDANCE', description: 'Update draft attendance records' },
    { name: 'attendance.delete', module: 'ATTENDANCE', description: 'Delete unapproved attendance entries' },
    { name: 'attendance.correct', module: 'ATTENDANCE', description: 'Perform auditable attendance corrections' },
    { name: 'attendance.approve', module: 'ATTENDANCE', description: 'Approve reviewed attendance records for payroll readiness' },
    { name: 'attendance.lock', module: 'ATTENDANCE', description: 'Lock completed attendance period against modifications' },
    { name: 'attendance.import', module: 'ATTENDANCE', description: 'Import attendance records from CSV/devices' },
    { name: 'attendance.reports.view', module: 'ATTENDANCE', description: 'View attendance summary and printable reports' },
    { name: 'attendance.settings.manage', module: 'ATTENDANCE', description: 'Configure attendance rules, grace periods, and thresholds' },
    { name: 'manager.attendance.view', module: 'ATTENDANCE', description: 'View and manage station/department attendance roster' },

    { name: 'shift.view', module: 'SHIFTS', description: 'View shifts catalog, start/end hours, and grace periods' },
    { name: 'shift.create', module: 'SHIFTS', description: 'Create new shift definitions' },
    { name: 'shift.edit', module: 'SHIFTS', description: 'Update shift hours, grace periods, and break rules' },
    { name: 'shift.archive', module: 'SHIFTS', description: 'Deactivate or archive shift definitions' },

    { name: 'schedule.view', module: 'SCHEDULES', description: 'View work schedules, rotations, and rosters' },
    { name: 'schedule.create', module: 'SCHEDULES', description: 'Create work schedules and assign employee shifts' },
    { name: 'schedule.edit', module: 'SCHEDULES', description: 'Update work schedule patterns and shift rosters' },

    { name: 'overtime.view', module: 'OVERTIME', description: 'View overtime logs and requests' },
    { name: 'overtime.create', module: 'OVERTIME', description: 'Log or request overtime hours' },
    { name: 'overtime.approve', module: 'OVERTIME', description: 'Approve overtime records for verified hours' },
    { name: 'overtime.reject', module: 'OVERTIME', description: 'Reject or cancel overtime requests' },

    { name: 'holiday.view', module: 'HOLIDAYS', description: 'View gazetted public holidays' },
    { name: 'holiday.create', module: 'HOLIDAYS', description: 'Add national and public holidays' },
    { name: 'holiday.edit', module: 'HOLIDAYS', description: 'Update public holidays' },
    { name: 'holiday.delete', module: 'HOLIDAYS', description: 'Remove public holidays' },

    // =========================================================================
    // PHASE 5: LEAVE MANAGEMENT PERMISSIONS
    // =========================================================================
    { name: 'leave.view', module: 'LEAVE', description: 'View leave requests, balances, and calendars' },
    { name: 'leave.create', module: 'LEAVE', description: 'Submit leave applications' },
    { name: 'leave.edit', module: 'LEAVE', description: 'Update draft or pending leave requests' },
    { name: 'leave.cancel', module: 'LEAVE', description: 'Cancel approved or submitted leave requests' },
    { name: 'leave.approve', module: 'LEAVE', description: 'Approve leave requests and sync with attendance' },
    { name: 'leave.reject', module: 'LEAVE', description: 'Reject leave requests with mandatory justification' },
    { name: 'leave.adjust_balance', module: 'LEAVE', description: 'Perform manual employee leave balance adjustments' },
    { name: 'leave.manage_types', module: 'LEAVE', description: 'Configure leave types and maximum entitlements' },
    { name: 'leave.manage_policies', module: 'LEAVE', description: 'Configure accrual rules, carry-forward, and proration policies' },
    { name: 'leave.view_sensitive', module: 'LEAVE', description: 'View medical reasons and sensitive leave documents' },
    { name: 'leave.documents.view', module: 'LEAVE', description: 'View and download supporting medical and leave attachments' },
    { name: 'leave.documents.upload', module: 'LEAVE', description: 'Upload supporting documents for leave requests' },
    { name: 'leave.documents.delete', module: 'LEAVE', description: 'Remove leave supporting attachments' },

    // =========================================================================
    // PHASE 6: PAYROLL CONFIGURATION & SALARY STRUCTURE PERMISSIONS
    // =========================================================================
    { name: 'payroll_config.view', module: 'PAYROLL', description: 'View payroll configuration and rules' },
    { name: 'payroll_config.manage', module: 'PAYROLL', description: 'Manage payroll company settings and formulas' },
    { name: 'salary.view', module: 'PAYROLL', description: 'View employee salary structures' },
    { name: 'salary.create', module: 'PAYROLL', description: 'Propose new employee salary structure' },
    { name: 'salary.edit', module: 'PAYROLL', description: 'Submit salary change and review proposal' },
    { name: 'salary.approve', module: 'PAYROLL', description: 'Approve employee salary adjustments' },
    { name: 'salary.history.view', module: 'PAYROLL', description: 'View employee historical salary timeline' },
    { name: 'allowance.view', module: 'PAYROLL', description: 'View allowance types catalog and assignments' },
    { name: 'allowance.create', module: 'PAYROLL', description: 'Create allowance types' },
    { name: 'allowance.edit', module: 'PAYROLL', description: 'Update allowance types' },
    { name: 'allowance.archive', module: 'PAYROLL', description: 'Archive allowance types' },
    { name: 'employee_allowance.assign', module: 'PAYROLL', description: 'Assign allowances to employees' },
    { name: 'deduction.view', module: 'PAYROLL', description: 'View deduction types catalog and assignments' },
    { name: 'deduction.create', module: 'PAYROLL', description: 'Create deduction types' },
    { name: 'deduction.edit', module: 'PAYROLL', description: 'Update deduction types' },
    { name: 'deduction.archive', module: 'PAYROLL', description: 'Archive deduction types' },
    { name: 'employee_deduction.assign', module: 'PAYROLL', description: 'Assign deductions to employees' },
    { name: 'statutory.view', module: 'PAYROLL', description: 'View statutory rules and PAYE tax bands' },
    { name: 'statutory.manage', module: 'PAYROLL', description: 'Configure statutory contribution rates and tax bands' },
    { name: 'payroll_period.view', module: 'PAYROLL', description: 'View payroll periods and cutoff dates' },
    { name: 'payroll_period.create', module: 'PAYROLL', description: 'Create new payroll periods' },
    { name: 'payroll_period.edit', module: 'PAYROLL', description: 'Update payroll periods' },
    { name: 'payroll_period.lock', module: 'PAYROLL', description: 'Lock or close payroll periods' },
    { name: 'overtime_rate.view', module: 'PAYROLL', description: 'View overtime rate multipliers and divisors' },
    { name: 'overtime_rate.manage', module: 'PAYROLL', description: 'Configure overtime multipliers and divisors' },

    // =========================================================================
    // PHASE 7: PAYROLL CALCULATION ENGINE & RUN PERMISSIONS
    // =========================================================================
    { name: 'payroll.view', module: 'PAYROLL', description: 'View payroll runs, previews, summaries, and calculations' },
    { name: 'payroll.create', module: 'PAYROLL', description: 'Initialize and create new payroll calculation runs' },
    { name: 'payroll.calculate', module: 'PAYROLL', description: 'Execute payroll calculation engine and compute earnings/deductions' },
    { name: 'payroll.recalculate', module: 'PAYROLL', description: 'Recalculate unfinalized payroll runs after source data changes' },
    { name: 'payroll.review', module: 'PAYROLL', description: 'Mark calculated payroll run as reviewed' },
    { name: 'payroll.submit', module: 'PAYROLL', description: 'Submit calculated payroll run for executive management approval' },
    { name: 'payroll.approve', module: 'PAYROLL', description: 'Formally approve payroll run for disbursement' },
    { name: 'payroll.finalize', module: 'PAYROLL', description: 'Finalize payroll run, update loan balances, and seal calculations' },
    { name: 'payroll.lock', module: 'PAYROLL', description: 'Lock finalized payroll runs against all modifications' },
    { name: 'payroll.cancel', module: 'PAYROLL', description: 'Cancel unfinalized draft payroll runs' },
    { name: 'payroll_exception.view', module: 'PAYROLL', description: 'View payroll calculation exceptions and blocker audits' },
    { name: 'payroll_exception.resolve', module: 'PAYROLL', description: 'Resolve or override payroll calculation exceptions' },
    { name: 'payroll.employee.view', module: 'PAYROLL', description: 'View individual employee payroll breakdown records' },
    { name: 'payroll.employee.sensitive_view', module: 'PAYROLL', description: 'View full calculation trace and line-item statutory details' },

    // =========================================================================
    // PHASE 8: PAYSLIPS, PAYROLL REPORTS & STATUTORY OUTPUTS PERMISSIONS
    // =========================================================================
    { name: 'payslip.view', module: 'PAYROLL', description: 'View employee payslips' },
    { name: 'payslip.generate', module: 'PAYROLL', description: 'Generate employee payslips' },
    { name: 'payslip.download', module: 'PAYROLL', description: 'Download individual payslip PDF documents' },
    { name: 'payslip.bulk', module: 'PAYROLL', description: 'Bulk generate and export multiple payslips' },
    { name: 'payslip.email', module: 'PAYROLL', description: 'Dispatch payslips via email' },
    { name: 'payroll_report.view', module: 'REPORTS', description: 'View master payroll reports' },
    { name: 'payroll_report.export', module: 'REPORTS', description: 'Export payroll reports to Excel and PDF' },
    { name: 'payroll_register.view', module: 'PAYROLL', description: 'View complete payroll register' },
    { name: 'payroll_summary.view', module: 'PAYROLL', description: 'View aggregate payroll summary' },
    { name: 'statutory_report.view', module: 'PAYROLL', description: 'View KRA PAYE, NSSF, SHA, and Housing Levy returns' },
    { name: 'employer_cost.view', module: 'PAYROLL', description: 'View employer total payroll labor cost analysis' },
    { name: 'payroll_payment.update_status', module: 'PAYROLL', description: 'Update employee and batch payroll payment statuses' },

    // =========================================================================
    // PHASE 9: PAYROLL PAYMENTS, DISBURSEMENTS & RECONCILIATION PERMISSIONS
    // =========================================================================
    { name: 'payroll_payment.view', module: 'PAYROLL', description: 'View payroll payment disbursements and batches' },
    { name: 'payroll_payment.create_batch', module: 'PAYROLL', description: 'Create new payroll disbursement batches' },
    { name: 'payroll_payment.review', module: 'PAYROLL', description: 'Review pre-approval payment batch details and validations' },
    { name: 'payroll_payment.approve', module: 'PAYROLL', description: 'Authorize and approve payroll disbursement batches' },
    { name: 'payroll_payment.process', module: 'PAYROLL', description: 'Execute payout disbursement processing through payment providers' },
    { name: 'payroll_payment.retry', module: 'PAYROLL', description: 'Retry failed payment transactions' },
    { name: 'payroll_payment.cancel', module: 'PAYROLL', description: 'Cancel unapproved payroll disbursement batches' },
    { name: 'payroll_payment.reconcile', module: 'PAYROLL', description: 'Perform ledger reconciliation between expected and actual payroll disbursements' },
    { name: 'payroll_payment.export', module: 'PAYROLL', description: 'Export payment batches and transaction records' },
    { name: 'payroll_payment.receipt_view', module: 'PAYROLL', description: 'View and print payment transaction receipts' },

    // =========================================================================
    // PHASE 10: EMPLOYEE SELF-SERVICE PORTAL & HR REQUESTS PERMISSIONS
    // =========================================================================
    { name: 'portal.view', module: 'PORTAL', description: 'Access personal employee self-service portal dashboard' },
    { name: 'portal.profile.view', module: 'PORTAL', description: 'View own employee profile, job details, and masked payment information' },
    { name: 'portal.profile.update_request', module: 'PORTAL', description: 'Request updates to personal contact and banking details' },
    { name: 'portal.payslip.view', module: 'PORTAL', description: 'View and download own historical payslips' },
    { name: 'portal.payment.view', module: 'PORTAL', description: 'View own historical salary payment transactions and receipts' },
    { name: 'portal.leave.view', module: 'PORTAL', description: 'View own leave balances, entitlements, and application history' },
    { name: 'portal.leave.create', module: 'PORTAL', description: 'Apply for leave days through the employee self-service portal' },
    { name: 'portal.attendance.view', module: 'PORTAL', description: 'View own attendance history and monthly summary' },
    { name: 'portal.attendance.correction', module: 'PORTAL', description: 'Submit attendance correction requests' },
    { name: 'portal.requests.view', module: 'PORTAL', description: 'View own submitted HR requests and status timeline' },
    { name: 'portal.requests.create', module: 'PORTAL', description: 'Submit HR service desk requests and employment letter orders' },
    { name: 'portal.documents.view', module: 'PORTAL', description: 'View and download own employment compliance documents' },
    { name: 'portal.notifications.view', module: 'PORTAL', description: 'View and acknowledge personal portal notifications' },
    { name: 'hr_request.view', module: 'HR', description: 'View employee HR requests and service desk tickets' },
    { name: 'hr_request.manage', module: 'HR', description: 'Review, assign, respond to, resolve, and reject employee HR requests' },

    // =========================================================================
    // PHASE 11: ADVANCED HR MANAGEMENT & LIFECYCLE PERMISSIONS
    // =========================================================================
    { name: 'hr.onboarding.view', module: 'HR', description: 'View employee onboarding cases and stage progress' },
    { name: 'hr.onboarding.create', module: 'HR', description: 'Initiate new employee onboarding workflows' },
    { name: 'hr.onboarding.manage', module: 'HR', description: 'Update onboarding tasks, stages, and complete onboarding' },
    { name: 'hr.offboarding.view', module: 'HR', description: 'View employee exit cases, clearance tasks, and settlements' },
    { name: 'hr.offboarding.create', module: 'HR', description: 'Initiate employee exit offboarding workflows' },
    { name: 'hr.offboarding.manage', module: 'HR', description: 'Update clearance tasks, calculate final settlement, and mark exited' },
    { name: 'hr.contracts.view', module: 'HR', description: 'View employee employment contracts and expiry alerts' },
    { name: 'hr.contracts.manage', module: 'HR', description: 'Renew, extend, or terminate employee employment contracts' },
    { name: 'hr.probation.view', module: 'HR', description: 'View employees on probation and remaining days' },
    { name: 'hr.probation.manage', module: 'HR', description: 'Record probation outcomes (confirm, extend, fail)' },
    { name: 'hr.analytics.view', module: 'HR', description: 'View HR workforce analytics, turnover metrics, and labor cost graphs' },
    { name: 'hr.movement.manage', module: 'HR', description: 'Transfer employee station, department, position, supervisor, or status' },
    { name: 'hr.bulk.manage', module: 'HR', description: 'Perform bulk employee transfers, status updates, and imports' },

    // Phase 13 Recruitment & ATS Permissions
    { name: 'recruitment.view', module: 'RECRUITMENT', description: 'View recruitment dashboard, vacancies, candidates, and pipeline' },
    { name: 'recruitment.vacancies.manage', module: 'RECRUITMENT', description: 'Create, edit, publish, pause, duplicate, and close job vacancies' },
    { name: 'recruitment.candidates.manage', module: 'RECRUITMENT', description: 'Move candidate stages, record screening, notes, and communications' },
    { name: 'recruitment.interviews.manage', module: 'RECRUITMENT', description: 'Schedule interviews, manage panels, and submit scorecards' },
    { name: 'recruitment.assessments.manage', module: 'RECRUITMENT', description: 'Record and grade candidate assessments and skills tests' },
    { name: 'recruitment.offers.create', module: 'RECRUITMENT', description: 'Draft and generate formal job offers' },
    { name: 'recruitment.offers.approve', module: 'RECRUITMENT', description: 'Authorize and approve sensitive job offers and salary terms' },
    { name: 'recruitment.hire', module: 'RECRUITMENT', description: 'Convert accepted candidates into employees and initiate onboarding' },
    { name: 'recruitment.reports.view', module: 'RECRUITMENT', description: 'View recruitment funnel, vacancy performance, and time-to-hire reports' },

    // Phase 14 Performance Management, Appraisals & KPIs Permissions
    { name: 'performance.view', module: 'PERFORMANCE', description: 'View performance command center, cycles, KPIs, and reviews' },
    { name: 'performance.cycles.manage', module: 'PERFORMANCE', description: 'Create, open, update, calibrate, complete, and archive performance cycles' },
    { name: 'performance.goals.manage', module: 'PERFORMANCE', description: 'Create, approve, and track employee SMART goals' },
    { name: 'performance.kpis.manage', module: 'PERFORMANCE', description: 'Create and configure KPI templates and assign targets' },
    { name: 'performance.kpis.measure', module: 'PERFORMANCE', description: 'Record, update, and verify KPI achievement measurements' },
    { name: 'performance.competencies.manage', module: 'PERFORMANCE', description: 'Manage core and leadership competency catalogs' },
    { name: 'performance.reviews.manage', module: 'PERFORMANCE', description: 'Manage performance reviews, self-assessments, and appraisals' },
    { name: 'performance.reviews.evaluate', module: 'PERFORMANCE', description: 'Conduct and submit manager performance reviews' },
    { name: 'performance.calibrate', module: 'PERFORMANCE', description: 'Calibrate performance scores and ratings as authorized HR' },
    { name: 'performance.concerns.manage', module: 'PERFORMANCE', description: 'Review and resolve employee performance disputes and concerns' },
    { name: 'performance.development.manage', module: 'PERFORMANCE', description: 'Create and monitor Performance Improvement Plans (PIPs) and development plans' },
    { name: 'performance.training.manage', module: 'PERFORMANCE', description: 'Manage training needs and competency development records' },
    { name: 'performance.reports.view', module: 'PERFORMANCE', description: 'Access workforce performance analytics, departmental metrics, and export reports' },
    { name: 'portal.performance.view', module: 'PORTAL', description: 'Access employee self-service performance appraisal, self-assessment, and career development' },

    { name: 'reports.view', module: 'REPORTS', description: 'View HR, attendance, payroll, and compliance reports' },
    { name: 'reports.export', module: 'REPORTS', description: 'Export reports to CSV/PDF formats' },
  ];

  const permissionIds: Record<string, string> = {};

  for (const p of permissionsData) {
    const perm = await prisma.permission.upsert({
      where: { name: p.name },
      update: { module: p.module, description: p.description },
      create: p,
    });
    permissionIds[p.name] = perm.id;
  }
  console.log(`✅ Permissions seeded (${Object.keys(permissionIds).length} permissions)`);

  // 3. Role-Permission Mappings
  const rolePermissionAssignments: Record<string, string[]> = {
    super_admin: Object.keys(permissionIds), // All permissions
    hr_admin: [
      'users.view', 'organization.view', 'organization.manage',
      'branches.view', 'branches.create', 'branches.edit', 'branches.archive', 'branches.manage',
      'departments.view', 'departments.create', 'departments.edit', 'departments.archive', 'departments.manage',
      'stations.view', 'stations.create', 'stations.edit', 'stations.archive', 'stations.manage',
      'positions.view', 'positions.create', 'positions.edit', 'positions.archive',
      'assignment.view', 'assignment.create', 'assignment.edit', 'assignment.transfer',
      'settings.view', 'audit.view',
      'employee.view', 'employee.create', 'employee.edit', 'employee.archive', 'employee.restore',
      'employee.view_sensitive', 'employee.edit_sensitive', 'employee.documents.view',
      'employee.documents.upload', 'employee.documents.delete', 'employee.export',
      'attendance.view', 'attendance.daily.view', 'attendance.create', 'attendance.edit', 'attendance.delete', 'attendance.correct', 'attendance.approve', 'attendance.lock', 'attendance.import', 'attendance.reports.view', 'attendance.settings.manage', 'manager.attendance.view',
      'shift.view', 'shift.create', 'shift.edit', 'shift.archive',
      'schedule.view', 'schedule.create', 'schedule.edit',
      'overtime.view', 'overtime.create', 'overtime.approve', 'overtime.reject',
      'holiday.view', 'holiday.create', 'holiday.edit', 'holiday.delete',
      'leave.view', 'leave.create', 'leave.edit', 'leave.cancel', 'leave.approve', 'leave.reject', 'leave.adjust_balance', 'leave.manage_types', 'leave.manage_policies', 'leave.view_sensitive', 'leave.documents.view', 'leave.documents.upload', 'leave.documents.delete',
      'payroll_config.view', 'salary.view', 'salary.create', 'salary.edit', 'salary.history.view',
      'allowance.view', 'allowance.create', 'allowance.edit', 'allowance.archive', 'employee_allowance.assign',
      'deduction.view', 'deduction.create', 'deduction.edit', 'deduction.archive', 'employee_deduction.assign',
      'statutory.view', 'payroll_period.view', 'payroll_period.create', 'payroll_period.edit', 'overtime_rate.view',
      'payroll.view', 'payroll.create', 'payroll.calculate', 'payroll.recalculate', 'payroll.review', 'payroll.submit',
      'payroll_exception.view', 'payroll_exception.resolve', 'payroll.employee.view', 'payroll.employee.sensitive_view',
      'payslip.view', 'payslip.generate', 'payslip.download', 'payslip.bulk', 'payslip.email',
      'payroll_report.view', 'payroll_report.export', 'payroll_register.view', 'payroll_summary.view',
      'statutory_report.view', 'employer_cost.view', 'payroll_payment.update_status',
      'payroll_payment.view', 'payroll_payment.create_batch', 'payroll_payment.review', 'payroll_payment.approve', 'payroll_payment.reconcile', 'payroll_payment.export', 'payroll_payment.receipt_view',
      'portal.view', 'portal.profile.view', 'portal.profile.update_request', 'portal.payslip.view', 'portal.payment.view', 'portal.leave.view', 'portal.leave.create', 'portal.attendance.view', 'portal.attendance.correction', 'portal.requests.view', 'portal.requests.create', 'portal.documents.view', 'portal.notifications.view',
      'hr_request.view', 'hr_request.manage',
      'hr.onboarding.view', 'hr.onboarding.create', 'hr.onboarding.manage',
      'hr.offboarding.view', 'hr.offboarding.create', 'hr.offboarding.manage',
      'hr.contracts.view', 'hr.contracts.manage',
      'hr.probation.view', 'hr.probation.manage',
      'hr.analytics.view', 'hr.movement.manage', 'hr.bulk.manage',
      'recruitment.view', 'recruitment.vacancies.manage', 'recruitment.candidates.manage', 'recruitment.interviews.manage', 'recruitment.assessments.manage', 'recruitment.offers.create', 'recruitment.offers.approve', 'recruitment.hire', 'recruitment.reports.view',
      'performance.view', 'performance.cycles.manage', 'performance.goals.manage', 'performance.kpis.manage', 'performance.kpis.measure', 'performance.competencies.manage', 'performance.reviews.manage', 'performance.reviews.evaluate', 'performance.calibrate', 'performance.concerns.manage', 'performance.development.manage', 'performance.training.manage', 'performance.reports.view', 'portal.performance.view',
      'reports.view', 'reports.export',
    ],
    payroll_officer: [
      'users.view', 'organization.view', 'branches.view', 'departments.view', 'stations.view', 'positions.view', 'assignment.view',
      'employee.view', 'employee.view_sensitive', 'employee.export',
      'attendance.view', 'attendance.lock', 'shift.view', 'schedule.view', 'overtime.view', 'holiday.view',
      'leave.view', 'leave.documents.view',
      'payroll_config.view', 'payroll_config.manage',
      'salary.view', 'salary.create', 'salary.edit', 'salary.history.view',
      'allowance.view', 'allowance.create', 'allowance.edit', 'employee_allowance.assign',
      'deduction.view', 'deduction.create', 'deduction.edit', 'employee_deduction.assign',
      'statutory.view', 'statutory.manage',
      'payroll_period.view', 'payroll_period.create', 'payroll_period.edit', 'payroll_period.lock',
      'overtime_rate.view', 'overtime_rate.manage',
      'payroll.view', 'payroll.create', 'payroll.calculate', 'payroll.recalculate', 'payroll.review', 'payroll.submit', 'payroll.cancel',
      'payroll_exception.view', 'payroll_exception.resolve', 'payroll.employee.view', 'payroll.employee.sensitive_view',
      'payslip.view', 'payslip.generate', 'payslip.download', 'payslip.bulk', 'payslip.email',
      'payroll_report.view', 'payroll_report.export', 'payroll_register.view', 'payroll_summary.view',
      'statutory_report.view', 'employer_cost.view', 'payroll_payment.update_status',
      'payroll_payment.view', 'payroll_payment.create_batch', 'payroll_payment.review', 'payroll_payment.process', 'payroll_payment.retry', 'payroll_payment.cancel', 'payroll_payment.reconcile', 'payroll_payment.export', 'payroll_payment.receipt_view',
      'portal.view', 'portal.profile.view', 'portal.payslip.view', 'portal.payment.view', 'portal.leave.view', 'portal.leave.create', 'portal.attendance.view', 'portal.requests.view', 'portal.documents.view', 'portal.notifications.view',
      'hr_request.view', 'hr_request.manage',
      'hr.analytics.view',
      'reports.view', 'reports.export',
    ],
    hr_manager: [
      'users.view', 'organization.view', 'branches.view', 'departments.view', 'stations.view', 'positions.view',
      'assignment.view', 'assignment.transfer',
      'employee.view', 'employee.edit', 'employee.view_sensitive', 'employee.documents.view', 'employee.export',
      'attendance.view', 'attendance.daily.view', 'attendance.correct', 'attendance.approve', 'attendance.lock', 'attendance.import', 'attendance.reports.view', 'attendance.settings.manage', 'manager.attendance.view',
      'shift.view', 'schedule.view', 'overtime.view', 'overtime.approve', 'holiday.view',
      'leave.view', 'leave.create', 'leave.approve', 'leave.reject', 'leave.cancel', 'leave.adjust_balance', 'leave.documents.view', 'leave.documents.upload',
      'payroll_config.view', 'salary.view', 'salary.approve', 'salary.history.view',
      'allowance.view', 'deduction.view', 'statutory.view', 'payroll_period.view', 'overtime_rate.view',
      'payroll.view', 'payroll.approve', 'payroll.finalize', 'payroll.lock', 'payroll_exception.view', 'payroll.employee.view', 'payroll.employee.sensitive_view',
      'payslip.view', 'payslip.download', 'payroll_report.view', 'payroll_report.export',
      'payroll_register.view', 'payroll_summary.view', 'statutory_report.view', 'employer_cost.view',
      'payroll_payment.view', 'payroll_payment.review', 'payroll_payment.approve', 'payroll_payment.reconcile', 'payroll_payment.export', 'payroll_payment.receipt_view',
      'portal.view', 'portal.profile.view', 'portal.profile.update_request', 'portal.payslip.view', 'portal.payment.view', 'portal.leave.view', 'portal.leave.create', 'portal.attendance.view', 'portal.attendance.correction', 'portal.requests.view', 'portal.requests.create', 'portal.documents.view', 'portal.notifications.view',
      'hr_request.view', 'hr_request.manage',
      'hr.onboarding.view', 'hr.onboarding.create', 'hr.onboarding.manage',
      'hr.offboarding.view', 'hr.offboarding.create', 'hr.offboarding.manage',
      'hr.contracts.view', 'hr.contracts.manage',
      'hr.probation.view', 'hr.probation.manage',
      'hr.analytics.view', 'hr.movement.manage', 'hr.bulk.manage',
      'recruitment.view', 'recruitment.vacancies.manage', 'recruitment.candidates.manage', 'recruitment.interviews.manage', 'recruitment.assessments.manage', 'recruitment.offers.create', 'recruitment.offers.approve', 'recruitment.hire', 'recruitment.reports.view',
      'performance.view', 'performance.cycles.manage', 'performance.goals.manage', 'performance.kpis.manage', 'performance.kpis.measure', 'performance.competencies.manage', 'performance.reviews.manage', 'performance.reviews.evaluate', 'performance.calibrate', 'performance.concerns.manage', 'performance.development.manage', 'performance.training.manage', 'performance.reports.view', 'portal.performance.view',
      'reports.view', 'reports.export',
    ],
    finance: [
      'organization.view', 'branches.view', 'departments.view', 'stations.view', 'positions.view', 'assignment.view',
      'employee.view', 'employee.view_sensitive', 'employee.export',
      'attendance.view', 'shift.view', 'overtime.view', 'holiday.view',
      'leave.view',
      'payroll_config.view', 'salary.view', 'salary.history.view',
      'allowance.view', 'deduction.view', 'statutory.view', 'payroll_period.view', 'overtime_rate.view',
      'payroll.view', 'payroll.approve', 'payroll.finalize', 'payroll.lock', 'payroll_exception.view', 'payroll.employee.view', 'payroll.employee.sensitive_view',
      'payslip.view', 'payslip.download', 'payroll_report.view', 'payroll_report.export',
      'payroll_register.view', 'payroll_summary.view', 'statutory_report.view', 'employer_cost.view', 'payroll_payment.update_status',
      'payroll_payment.view', 'payroll_payment.review', 'payroll_payment.approve', 'payroll_payment.process', 'payroll_payment.retry', 'payroll_payment.cancel', 'payroll_payment.reconcile', 'payroll_payment.export', 'payroll_payment.receipt_view',
      'portal.view', 'portal.profile.view', 'portal.payslip.view', 'portal.payment.view', 'portal.leave.view', 'portal.documents.view', 'portal.notifications.view',
      'reports.view', 'reports.export', 'audit.view',
    ],
    employee: [
      'portal.view', 'portal.profile.view', 'portal.profile.update_request',
      'portal.payslip.view', 'portal.payment.view',
      'portal.leave.view', 'portal.leave.create',
      'portal.attendance.view', 'portal.attendance.correction',
      'portal.requests.view', 'portal.requests.create',
      'portal.documents.view', 'portal.notifications.view',
      'portal.performance.view',
      'attendance.view', 'attendance.create', 'shift.view', 'schedule.view', 'overtime.create', 'holiday.view',
      'leave.view', 'leave.create', 'leave.cancel', 'leave.documents.view', 'leave.documents.upload',
      'payslip.view', 'payslip.download', 'payroll_payment.receipt_view',
    ],
  };

  for (const [roleName, perms] of Object.entries(rolePermissionAssignments)) {
    const roleId = rolesMap[roleName];
    if (!roleId) continue;

    for (const permName of perms) {
      const permissionId = permissionIds[permName];
      if (permissionId) {
        await prisma.rolePermission.upsert({
          where: {
            roleId_permissionId: { roleId, permissionId },
          },
          update: {},
          create: { roleId, permissionId },
        });
      }
    }
  }
  console.log('✅ Role-Permission mappings assigned');

  // 4. Default Kenyan Company Settings
  await prisma.companySetting.upsert({
    where: { id: 'corpsec_settings_default' },
    update: {},
    create: {
      id: 'corpsec_settings_default',
      companyName: 'CorpSec Investigations & Guarding Services',
      registrationNumber: 'CPR/2018/89421',
      kraPin: 'P051234567Z',
      phone: '+254 700 000 000',
      email: 'info@corpsec.co.ke',
      physicalAddress: 'CorpSec Plaza, 4th Floor, Upper Hill Road, Nairobi',
      postalAddress: 'P.O. Box 45678 - 00100, Nairobi, Kenya',
      website: 'https://www.corpsec.co.ke',
      defaultCurrency: 'KES',
      country: 'Kenya',
      timezone: 'Africa/Nairobi',
      payrollConfig: JSON.stringify({
        statutoryEnabled: true,
        payPeriodType: 'MONTHLY',
        statutoryRegime: 'KENYA_PAYE_NSSF_SHA_HOUSING_LEVY_CONFIGURABLE',
        status: 'PENDING_PHASE_6_CONFIGURATION',
      }),
    },
  });

  // 5. Organizational Units (Phase 3 Branches, Departments, Stations)
  const branchesData = [
    {
      code: 'HQ-NRB',
      name: 'Nairobi Head Office',
      location: 'Upper Hill Road, Nairobi',
      county: 'Nairobi',
      townCity: 'Nairobi',
      physicalAddress: 'CorpSec Plaza, 4th Floor, Upper Hill Road',
      contactPerson: 'Operations Director',
      phone: '+254 711 100 200',
      email: 'nairobi.hq@corpsec.co.ke',
      isActive: true,
    },
    {
      code: 'BR-MSA',
      name: 'Mombasa Coast Regional Branch',
      location: 'Links Road, Nyali, Mombasa',
      county: 'Mombasa',
      townCity: 'Mombasa',
      physicalAddress: 'Nyali Executive Centre, Ground Floor, Links Road',
      contactPerson: 'Coast Regional Commander',
      phone: '+254 711 100 300',
      email: 'mombasa@corpsec.co.ke',
      isActive: true,
    },
    {
      code: 'BR-KSU',
      name: 'Western Regional Branch (Kisumu)',
      location: 'Mega City Mall Complex, Kisumu',
      county: 'Kisumu',
      townCity: 'Kisumu',
      physicalAddress: 'Mega City Mall Commercial Block, 2nd Floor, Kisumu-Nairobi Highway',
      contactPerson: 'Western Regional Supervisor',
      phone: '+254 711 100 400',
      email: 'kisumu@corpsec.co.ke',
      isActive: true,
    },
  ];

  const branchRecords: Record<string, string> = {};
  for (const b of branchesData) {
    const branch = await prisma.branch.upsert({
      where: { code: b.code },
      update: b,
      create: b,
    });
    branchRecords[b.code] = branch.id;
  }

  const departmentsData = [
    {
      code: 'SEC-OPS',
      name: 'Security Guarding & Operations',
      description: 'Manned guarding deployment, field supervision, and control room coordination',
      branchId: branchRecords['HQ-NRB'],
      isActive: true,
    },
    {
      code: 'HR-ADM',
      name: 'Human Resources & Administration',
      description: 'Personnel recruitment, guard vetting, compliance, and staff welfare',
      branchId: branchRecords['HQ-NRB'],
      isActive: true,
    },
    {
      code: 'FIN-ACC',
      name: 'Finance, Accounts & Payroll',
      description: 'Financial management, statutory remittances, and payroll disbursements',
      branchId: branchRecords['HQ-NRB'],
      isActive: true,
    },
    {
      code: 'LOG-EQP',
      name: 'Logistics, Uniforms & Equipment',
      description: 'Inventory management for guard uniforms, radio communication, and inspection gear',
      branchId: branchRecords['HQ-NRB'],
      isActive: true,
    },
  ];

  const departmentRecords: Record<string, string> = {};
  for (const d of departmentsData) {
    const dept = await prisma.department.upsert({
      where: { code: d.code },
      update: d,
      create: d,
    });
    departmentRecords[d.code] = dept.id;
  }

  // 6. Job Positions (Phase 3)
  const positionsData = [
    {
      code: 'POS-SEC-GD',
      title: 'Security Guard',
      description: 'Static and perimeter security guarding, access control, and visitor logging',
      departmentId: departmentRecords['SEC-OPS'],
      employmentCategory: 'SECURITY_GUARD',
    },
    {
      code: 'POS-SEC-ARM',
      title: 'Armed Guard Specialist',
      description: 'High-security armed escort, cash-in-transit support, and emergency response',
      departmentId: departmentRecords['SEC-OPS'],
      employmentCategory: 'SECURITY_GUARD',
    },
    {
      code: 'POS-SEC-SUP',
      title: 'Patrol Supervisor',
      description: 'Field inspection of guard stations, muster roll checks, and operational reports',
      departmentId: departmentRecords['SEC-OPS'],
      employmentCategory: 'PATROL_SUPERVISOR',
    },
    {
      code: 'POS-SEC-CMD',
      title: 'Senior Patrol Commander',
      description: 'Zonal security operations commanding, client liaison, and incident management',
      departmentId: departmentRecords['SEC-OPS'],
      employmentCategory: 'OPERATIONS',
    },
    {
      code: 'POS-SEC-CCTV',
      title: 'CCTV & Control Room Guard',
      description: 'Surveillance feed monitoring, alarm reception, and radio communication dispatch',
      departmentId: departmentRecords['SEC-OPS'],
      employmentCategory: 'SECURITY_GUARD',
    },
    {
      code: 'POS-HR-OFF',
      title: 'HR Compliance Officer',
      description: 'Guard vetting, statutory compliance verification, and personnel record management',
      departmentId: departmentRecords['HR-ADM'],
      employmentCategory: 'OFFICE_STAFF',
    },
    {
      code: 'POS-FIN-ACC',
      title: 'Finance & Payroll Accountant',
      description: 'Payroll calculations, statutory deductions, bank reconciliation, and disbursements',
      departmentId: departmentRecords['FIN-ACC'],
      employmentCategory: 'OFFICE_STAFF',
    },
    {
      code: 'POS-LOG-OFF',
      title: 'Logistics & Uniforms Officer',
      description: 'Uniform distribution, equipment tracking, and guard equipment maintenance',
      departmentId: departmentRecords['LOG-EQP'],
      employmentCategory: 'OPERATIONS',
    },
  ];

  const positionRecords: Record<string, string> = {};
  for (const pos of positionsData) {
    const p = await prisma.position.upsert({
      where: { code: pos.code },
      update: pos,
      create: pos,
    });
    positionRecords[pos.code] = p.id;
  }
  console.log(`✅ Job Positions seeded (${Object.keys(positionRecords).length} positions)`);

  // 7. Stations (Phase 3 Guarding Stations with Required Staffing Quotas)
  const stationsData = [
    {
      code: 'STN-CBD01',
      name: 'Nairobi Central Guarding Station',
      clientLocationName: 'Commercial Banking & Corporate Towers Zone',
      physicalLocation: 'City Centre Hub, Mama Ngina / Wabera St, Nairobi',
      county: 'Nairobi',
      townCity: 'Nairobi',
      address: 'P.O. Box 45678 - 00100, Nairobi',
      branchId: branchRecords['HQ-NRB'],
      requiredStaffing: 20, // 20 guards required
      isActive: true,
    },
    {
      code: 'STN-IND02',
      name: 'Industrial Area Rapid Response Post',
      clientLocationName: 'Manufacturing Plants & Warehousing Outpost',
      physicalLocation: 'Enterprise Road, Industrial Area, Nairobi',
      county: 'Nairobi',
      townCity: 'Nairobi',
      address: 'Enterprise Road Zone 4',
      branchId: branchRecords['HQ-NRB'],
      requiredStaffing: 12, // 12 guards required
      isActive: true,
    },
    {
      code: 'STN-PRT01',
      name: 'Kilindini Port Security Outpost',
      clientLocationName: 'Maritime Logistics & Container Terminal',
      physicalLocation: 'Mbaraki Wharf, Mombasa',
      county: 'Mombasa',
      townCity: 'Mombasa',
      address: 'Kilindini Harbour Gate 3',
      branchId: branchRecords['BR-MSA'],
      requiredStaffing: 15, // 15 guards required
      isActive: true,
    },
  ];

  const stationRecords: Record<string, string> = {};
  for (const s of stationsData) {
    const stn = await prisma.station.upsert({
      where: { code: s.code },
      update: s,
      create: s,
    });
    stationRecords[s.code] = stn.id;
  }

  // 8. Safe Development Seed Users
  const passwordSalt = 12;
  const adminPasswordHash = await bcrypt.hash('Admin@CorpSec2026!', passwordSalt);
  const hrAdminPasswordHash = await bcrypt.hash('HrAdmin@CorpSec2026!', passwordSalt);
  const payrollPasswordHash = await bcrypt.hash('Payroll@CorpSec2026!', passwordSalt);
  const hrManagerPasswordHash = await bcrypt.hash('HrManager@CorpSec2026!', passwordSalt);
  const financePasswordHash = await bcrypt.hash('Finance@CorpSec2026!', passwordSalt);
  const employeePasswordHash = await bcrypt.hash('Employee@CorpSec2026!', passwordSalt);

  const seedUsers = [
    {
      email: 'admin@corpsec.co.ke',
      passwordHash: adminPasswordHash,
      firstName: 'System',
      lastName: 'Administrator',
      phone: '+254722000001',
      role: 'super_admin',
    },
    {
      email: 'hr.admin@corpsec.co.ke',
      passwordHash: hrAdminPasswordHash,
      firstName: 'Grace',
      lastName: 'Wanjiku',
      phone: '+254722000002',
      role: 'hr_admin',
    },
    {
      email: 'payroll@corpsec.co.ke',
      passwordHash: payrollPasswordHash,
      firstName: 'David',
      lastName: 'Ochieng',
      phone: '+254722000003',
      role: 'payroll_officer',
    },
    {
      email: 'hr.manager@corpsec.co.ke',
      passwordHash: hrManagerPasswordHash,
      firstName: 'Faith',
      lastName: 'Mwangi',
      phone: '+254722000004',
      role: 'hr_manager',
    },
    {
      email: 'finance@corpsec.co.ke',
      passwordHash: financePasswordHash,
      firstName: 'Peter',
      lastName: 'Kiprono',
      phone: '+254722000005',
      role: 'finance',
    },
    // Phase 10: Dedicated Employee Self-Service Test Accounts
    {
      email: 'jackson.kamau@corpsec.co.ke',
      passwordHash: employeePasswordHash,
      firstName: 'Jackson',
      lastName: 'Kamau',
      phone: '+254712345678',
      role: 'employee',
    },
    {
      email: 'emmanuel.wanyonyi@corpsec.co.ke',
      passwordHash: employeePasswordHash,
      firstName: 'Emmanuel',
      lastName: 'Wanyonyi',
      phone: '+254713998877',
      role: 'employee',
    },
    {
      email: 'lilian.otieno@corpsec.co.ke',
      passwordHash: employeePasswordHash,
      firstName: 'Lilian',
      lastName: 'Otieno',
      phone: '+254725667788',
      role: 'employee',
    },
  ];

  let adminUserId = '';
  for (const u of seedUsers) {
    const user = await prisma.user.upsert({
      where: { email: u.email },
      update: {
        firstName: u.firstName,
        lastName: u.lastName,
        phone: u.phone,
        passwordHash: u.passwordHash,
        isActive: true,
        isVerified: true,
      },
      create: {
        email: u.email,
        passwordHash: u.passwordHash,
        firstName: u.firstName,
        lastName: u.lastName,
        phone: u.phone,
        isActive: true,
        isVerified: true,
      },
    });

    if (u.role === 'super_admin') adminUserId = user.id;

    const roleId = rolesMap[u.role];
    if (roleId) {
      await prisma.userRole.upsert({
        where: {
          userId_roleId: { userId: user.id, roleId },
        },
        update: {},
        create: {
          userId: user.id,
          roleId,
          assignedBy: 'system_bootstrap',
        },
      });
    }
  }

  // 9. Seed Sample Kenyan Employees & Assignments (Phase 3 Relational Model)
  console.log('👤 Seeding sample employee master records and assignments...');

  const sampleEmployees = [
    {
      employeeNumber: 'CORP-000001',
      firstName: 'Jackson',
      middleName: 'Kariuki',
      lastName: 'Kamau',
      fullName: 'Jackson Kariuki Kamau',
      nationalId: '28491024',
      dateOfBirth: new Date('1988-04-12'),
      gender: 'MALE',
      maritalStatus: 'MARRIED',
      nationality: 'Kenyan',
      primaryPhone: '+254712345678',
      alternativePhone: '+254722112233',
      email: 'jackson.kamau@corpsec.co.ke',
      physicalAddress: 'House 42, Buruburu Phase 2, Nairobi',
      county: 'Nairobi',
      townCity: 'Nairobi',
      postalAddress: 'P.O. Box 1204 - 00100 Nairobi',
      employmentDate: new Date('2021-02-01'),
      contractStartDate: new Date('2021-02-01'),
      employmentType: 'PERMANENT',
      jobTitle: 'Senior Patrol Commander',
      positionId: positionRecords['POS-SEC-CMD'],
      departmentId: departmentRecords['SEC-OPS'],
      branchId: branchRecords['HQ-NRB'],
      stationId: stationRecords['STN-CBD01'],
      employmentStatus: 'ACTIVE',
      preferredPaymentMethod: 'BANK',
      bankName: 'KCB Bank Kenya',
      bankAccountName: 'Jackson Kariuki Kamau',
      bankAccountNumber: '1104892841',
      bankBranch: 'Upper Hill Branch',
      bankBranchCode: '01124',
      mpesaPhoneNumber: '+254712345678',
      kraPin: 'A009182746Z',
      nssfNumber: '10928374',
      shaNumber: 'SHA-8492019',
      housingLevyNumber: 'HL-28491024',
      nextOfKin: [
        {
          fullName: 'Mary Wambui Kamau',
          relationship: 'SPOUSE',
          primaryPhone: '+254720998877',
          physicalAddress: 'House 42, Buruburu Phase 2, Nairobi',
          percentageShare: 100,
          isPrimary: true,
        },
      ],
      emergencyContacts: [
        {
          fullName: 'Mary Wambui Kamau',
          relationship: 'SPOUSE',
          primaryPhone: '+254720998877',
          physicalAddress: 'Buruburu Phase 2',
        },
      ],
    },
    {
      employeeNumber: 'CORP-000002',
      firstName: 'Emmanuel',
      middleName: 'Barasa',
      lastName: 'Wanyonyi',
      fullName: 'Emmanuel Barasa Wanyonyi',
      nationalId: '31284910',
      dateOfBirth: new Date('1994-09-18'),
      gender: 'MALE',
      maritalStatus: 'SINGLE',
      nationality: 'Kenyan',
      primaryPhone: '+254790123456',
      email: 'emmanuel.wanyonyi@corpsec.co.ke',
      physicalAddress: 'Pipeline Estate, Outering Road, Nairobi',
      county: 'Nairobi',
      townCity: 'Nairobi',
      employmentDate: new Date('2022-06-15'),
      contractStartDate: new Date('2022-06-15'),
      employmentType: 'CONTRACT',
      jobTitle: 'Armed Guard Specialist',
      positionId: positionRecords['POS-SEC-ARM'],
      departmentId: departmentRecords['SEC-OPS'],
      branchId: branchRecords['HQ-NRB'],
      stationId: stationRecords['STN-IND02'],
      employmentStatus: 'ACTIVE',
      preferredPaymentMethod: 'MPESA',
      mpesaPhoneNumber: '+254790123456',
      bankName: 'Co-operative Bank',
      bankAccountName: 'Emmanuel Barasa',
      bankAccountNumber: '011293849102',
      bankBranch: 'Industrial Area Branch',
      kraPin: 'A010293847X',
      nssfNumber: '11920394',
      shaNumber: 'SHA-9182736',
      nextOfKin: [
        {
          fullName: 'Sylvia Nasimiyu Wanyonyi',
          relationship: 'SIBLING',
          primaryPhone: '+254799887766',
          isPrimary: true,
        },
      ],
      emergencyContacts: [
        {
          fullName: 'Sylvia Nasimiyu',
          relationship: 'SIBLING',
          primaryPhone: '+254799887766',
        },
      ],
    },
    {
      employeeNumber: 'CORP-000003',
      firstName: 'Amina',
      middleName: 'Hassan',
      lastName: 'Mwatela',
      fullName: 'Amina Hassan Mwatela',
      nationalId: '29837461',
      dateOfBirth: new Date('1991-11-23'),
      gender: 'FEMALE',
      maritalStatus: 'MARRIED',
      nationality: 'Kenyan',
      primaryPhone: '+254733445566',
      email: 'amina.mwatela@corpsec.co.ke',
      physicalAddress: 'Bamburi, Kisauni, Mombasa',
      county: 'Mombasa',
      townCity: 'Mombasa',
      employmentDate: new Date('2020-03-10'),
      employmentType: 'PERMANENT',
      jobTitle: 'Security Guard',
      positionId: positionRecords['POS-SEC-GD'],
      departmentId: departmentRecords['SEC-OPS'],
      branchId: branchRecords['BR-MSA'],
      stationId: stationRecords['STN-PRT01'],
      employmentStatus: 'ACTIVE',
      preferredPaymentMethod: 'BANK',
      bankName: 'Equity Bank Kenya',
      bankAccountName: 'Amina Hassan Mwatela',
      bankAccountNumber: '0480293847192',
      bankBranch: 'Moi Avenue Mombasa Branch',
      kraPin: 'A008273645M',
      nssfNumber: '09827364',
      shaNumber: 'SHA-7263548',
      nextOfKin: [
        {
          fullName: 'Omar Salim Juma',
          relationship: 'SPOUSE',
          primaryPhone: '+254735112233',
          isPrimary: true,
        },
      ],
      emergencyContacts: [
        {
          fullName: 'Omar Salim Juma',
          relationship: 'SPOUSE',
          primaryPhone: '+254735112233',
        },
      ],
    },
    {
      employeeNumber: 'CORP-000004',
      firstName: 'Brian',
      middleName: 'Kiprotich',
      lastName: 'Cheruiyot',
      fullName: 'Brian Kiprotich Cheruiyot',
      nationalId: '32918273',
      dateOfBirth: new Date('1996-01-05'),
      gender: 'MALE',
      maritalStatus: 'SINGLE',
      nationality: 'Kenyan',
      primaryPhone: '+254718990011',
      email: 'brian.cheruiyot@corpsec.co.ke',
      physicalAddress: 'Langata Road, Nairobi',
      county: 'Nairobi',
      townCity: 'Nairobi',
      employmentDate: new Date('2023-01-15'),
      employmentType: 'PERMANENT',
      jobTitle: 'HR Compliance Officer',
      positionId: positionRecords['POS-HR-OFF'],
      departmentId: departmentRecords['HR-ADM'],
      branchId: branchRecords['HQ-NRB'],
      employmentStatus: 'ACTIVE',
      preferredPaymentMethod: 'BANK',
      bankName: 'Standard Chartered Bank',
      bankAccountName: 'Brian Kiprotich Cheruiyot',
      bankAccountNumber: '01002938471',
      bankBranch: 'Chiromo Branch',
      kraPin: 'A011223344K',
      nssfNumber: '12938475',
      shaNumber: 'SHA-3344556',
      nextOfKin: [
        {
          fullName: 'Ezekiel Cheruiyot',
          relationship: 'PARENT',
          primaryPhone: '+254722889900',
          isPrimary: true,
        },
      ],
      emergencyContacts: [
        {
          fullName: 'Ezekiel Cheruiyot',
          relationship: 'PARENT',
          primaryPhone: '+254722889900',
        },
      ],
    },
    {
      employeeNumber: 'CORP-000005',
      firstName: 'Lilian',
      middleName: 'Akoth',
      lastName: 'Otieno',
      fullName: 'Lilian Akoth Otieno',
      nationalId: '27481920',
      dateOfBirth: new Date('1987-07-30'),
      gender: 'FEMALE',
      maritalStatus: 'MARRIED',
      nationality: 'Kenyan',
      primaryPhone: '+254725667788',
      email: 'lilian.otieno@corpsec.co.ke',
      physicalAddress: 'Milimani Estate, Kisumu',
      county: 'Kisumu',
      townCity: 'Kisumu',
      employmentDate: new Date('2019-08-20'),
      employmentType: 'PERMANENT',
      jobTitle: 'Patrol Supervisor',
      positionId: positionRecords['POS-SEC-SUP'],
      departmentId: departmentRecords['SEC-OPS'],
      branchId: branchRecords['BR-KSU'],
      employmentStatus: 'ON_LEAVE',
      preferredPaymentMethod: 'BANK',
      bankName: 'ABSA Bank Kenya',
      bankAccountName: 'Lilian Akoth Otieno',
      bankAccountNumber: '0308293847',
      bankBranch: 'Kisumu Main Branch',
      kraPin: 'A007182934P',
      nssfNumber: '08765432',
      shaNumber: 'SHA-4455667',
      nextOfKin: [
        {
          fullName: 'George Otieno Omondi',
          relationship: 'SPOUSE',
          primaryPhone: '+254721334455',
          isPrimary: true,
        },
      ],
      emergencyContacts: [
        {
          fullName: 'George Otieno Omondi',
          relationship: 'SPOUSE',
          primaryPhone: '+254721334455',
        },
      ],
    },
    {
      employeeNumber: 'CORP-000006',
      firstName: 'Kevin',
      middleName: 'Mutua',
      lastName: 'Ndambuki',
      fullName: 'Kevin Mutua Ndambuki',
      nationalId: '30192837',
      dateOfBirth: new Date('1992-12-14'),
      gender: 'MALE',
      maritalStatus: 'SINGLE',
      nationality: 'Kenyan',
      primaryPhone: '+254714556677',
      email: 'kevin.ndambuki@corpsec.co.ke',
      physicalAddress: 'Embakasi Village, Nairobi',
      county: 'Nairobi',
      townCity: 'Nairobi',
      employmentDate: new Date('2021-11-01'),
      employmentType: 'CONTRACT',
      jobTitle: 'CCTV & Control Room Guard',
      positionId: positionRecords['POS-SEC-CCTV'],
      departmentId: departmentRecords['SEC-OPS'],
      branchId: branchRecords['HQ-NRB'],
      stationId: stationRecords['STN-CBD01'],
      employmentStatus: 'SUSPENDED',
      preferredPaymentMethod: 'MPESA',
      mpesaPhoneNumber: '+254714556677',
      kraPin: 'A009988776W',
      nssfNumber: '10293847',
      shaNumber: 'SHA-5566778',
      nextOfKin: [
        {
          fullName: 'Esther Ndambuki',
          relationship: 'PARENT',
          primaryPhone: '+254710223344',
          isPrimary: true,
        },
      ],
      emergencyContacts: [
        {
          fullName: 'Esther Ndambuki',
          relationship: 'PARENT',
          primaryPhone: '+254710223344',
        },
      ],
    },
  ];

  const createdEmployeeMap: Record<string, string> = {};

  for (const empData of sampleEmployees) {
    const { nextOfKin, emergencyContacts, ...coreData } = empData;

    let linkedUserId: string | null = null;
    if (coreData.email) {
      const user = await prisma.user.findUnique({ where: { email: coreData.email } });
      if (user) linkedUserId = user.id;
    }

    const emp = await prisma.employee.upsert({
      where: { employeeNumber: coreData.employeeNumber },
      update: {
        ...coreData,
        userId: linkedUserId,
      },
      create: {
        ...coreData,
        userId: linkedUserId,
      },
    });

    createdEmployeeMap[emp.employeeNumber] = emp.id;

    if (nextOfKin && nextOfKin.length > 0) {
      await prisma.nextOfKin.deleteMany({ where: { employeeId: emp.id } });
      for (const nok of nextOfKin) {
        await prisma.nextOfKin.create({
          data: {
            employeeId: emp.id,
            ...nok,
          },
        });
      }
    }

    if (emergencyContacts && emergencyContacts.length > 0) {
      await prisma.emergencyContact.deleteMany({ where: { employeeId: emp.id } });
      for (const ec of emergencyContacts) {
        await prisma.emergencyContact.create({
          data: {
            employeeId: emp.id,
            ...ec,
          },
        });
      }
    }

    // Initial Active Employee Assignment Record (Phase 3)
    const existingAssignment = await prisma.employeeAssignment.findFirst({
      where: { employeeId: emp.id, status: 'ACTIVE' },
    });

    if (!existingAssignment && emp.branchId && emp.departmentId) {
      await prisma.employeeAssignment.create({
        data: {
          employeeId: emp.id,
          branchId: emp.branchId,
          departmentId: emp.departmentId,
          stationId: emp.stationId || null,
          positionId: emp.positionId || null,
          jobTitle: emp.jobTitle,
          startDate: emp.employmentDate,
          status: 'ACTIVE',
          reason: 'Initial organizational assignment on onboarding',
          createdById: adminUserId || null,
        },
      });
    }

    // Initial Career Timeline History Record
    const existingHist = await prisma.employeeHistory.findFirst({
      where: { employeeId: emp.id, changeType: 'INITIAL_ONBOARDING' },
    });
    if (!existingHist) {
      await prisma.employeeHistory.create({
        data: {
          employeeId: emp.id,
          changeType: 'INITIAL_ONBOARDING',
          description: `Employee ${emp.fullName} (${emp.employeeNumber}) onboarded as ${emp.jobTitle}.`,
          newValue: JSON.stringify({
            employeeNumber: emp.employeeNumber,
            jobTitle: emp.jobTitle,
            status: emp.employmentStatus,
            department: emp.departmentId,
            branch: emp.branchId,
          }),
          performedById: adminUserId || null,
        },
      });
    }
  }

  // Set Department Heads & Station Supervisors from seeded employees
  const jacksonId = createdEmployeeMap['CORP-000001']; // Senior Patrol Commander
  const lilianId = createdEmployeeMap['CORP-000005']; // Western Supervisor
  const brianId = createdEmployeeMap['CORP-000004']; // HR Officer

  if (jacksonId) {
    // Jackson supervises Nairobi CBD Station
    await prisma.station.update({
      where: { code: 'STN-CBD01' },
      data: { supervisorId: jacksonId },
    });
    // Jackson is Operations Department Head
    await prisma.department.update({
      where: { code: 'SEC-OPS' },
      data: { departmentHeadId: jacksonId },
    });
    // Jackson is Branch Manager for Nairobi HQ
    await prisma.branch.update({
      where: { code: 'HQ-NRB' },
      data: { branchManagerId: jacksonId },
    });
  }

  if (brianId) {
    // Brian is HR Department Head
    await prisma.department.update({
      where: { code: 'HR-ADM' },
      data: { departmentHeadId: brianId },
    });
  }

  if (lilianId) {
    // Lilian manages Western Kisumu Branch
    await prisma.branch.update({
      where: { code: 'BR-KSU' },
      data: { branchManagerId: lilianId },
    });
  }

  // ===========================================================================
  // 10. PHASE 4: ATTENDANCE, SHIFTS, SCHEDULES, HOLIDAYS & SAMPLE LOGS
  // ===========================================================================
  console.log('⏰ Seeding Phase 4 Shifts, Work Schedules, Kenyan Holidays, and Attendance...');

  // 10.1 Shifts
  const shiftsData = [
    {
      code: 'SHF-DAY-12',
      name: 'Standard Day Guard Shift (12h)',
      startTime: '06:00',
      endTime: '18:00',
      shiftType: 'DAY',
      isOvernight: false,
      gracePeriodMinutes: 15,
      breakDurationMinutes: 60,
      isBreakPaid: false,
      status: 'ACTIVE',
    },
    {
      code: 'SHF-NGT-12',
      name: 'Standard Night Guard Shift (12h Overnight)',
      startTime: '18:00',
      endTime: '06:00',
      shiftType: 'NIGHT',
      isOvernight: true,
      gracePeriodMinutes: 15,
      breakDurationMinutes: 60,
      isBreakPaid: false,
      status: 'ACTIVE',
    },
    {
      code: 'SHF-OFF-08',
      name: 'HQ Office Day Shift (8h)',
      startTime: '08:00',
      endTime: '17:00',
      shiftType: 'MORNING',
      isOvernight: false,
      gracePeriodMinutes: 15,
      breakDurationMinutes: 60,
      isBreakPaid: false,
      status: 'ACTIVE',
    },
    {
      code: 'SHF-EVN-08',
      name: 'Evening Mobile Patrol Shift (8h)',
      startTime: '14:00',
      endTime: '22:00',
      shiftType: 'EVENING',
      isOvernight: false,
      gracePeriodMinutes: 15,
      breakDurationMinutes: 30,
      isBreakPaid: false,
      status: 'ACTIVE',
    },
  ];

  const shiftRecords: Record<string, string> = {};
  for (const s of shiftsData) {
    const shift = await prisma.shift.upsert({
      where: { code: s.code },
      update: s,
      create: s,
    });
    shiftRecords[s.code] = shift.id;
  }
  console.log(`✅ Shifts seeded (${Object.keys(shiftRecords).length} shifts)`);

  // 10.2 Work Schedules
  const schedulesData = [
    {
      code: 'SCH-MON-FRI',
      name: 'Monday–Friday Office Standard',
      description: 'Standard 5-day office work schedule with weekend rest days',
      patternType: 'STANDARD_WEEKLY',
      cycleDays: 7,
      scheduleConfig: JSON.stringify({
        mon: 'SHF-OFF-08',
        tue: 'SHF-OFF-08',
        wed: 'SHF-OFF-08',
        thu: 'SHF-OFF-08',
        fri: 'SHF-OFF-08',
        sat: 'OFF',
        sun: 'OFF',
      }),
      isActive: true,
    },
    {
      code: 'SCH-ROT-6-1',
      name: 'Security Guard 6 Days On / 1 Day Off Rotation',
      description: 'Standard Kenyan security guard 6-day work week with 1 revolving rest day',
      patternType: 'ROTATION_6_1',
      cycleDays: 7,
      scheduleConfig: JSON.stringify({
        day1: 'SHF-DAY-12',
        day2: 'SHF-DAY-12',
        day3: 'SHF-DAY-12',
        day4: 'SHF-DAY-12',
        day5: 'SHF-DAY-12',
        day6: 'SHF-DAY-12',
        day7: 'OFF',
      }),
      isActive: true,
    },
    {
      code: 'SCH-ROT-7-7',
      name: 'Security Patrol 7 Days On / 7 Days Off Rotation',
      description: 'Continuous 7-day 12h rotation followed by 7 consecutive rest days',
      patternType: 'ROTATION_7_7',
      cycleDays: 14,
      scheduleConfig: JSON.stringify({
        week1: 'SHF-NGT-12',
        week2: 'OFF',
      }),
      isActive: true,
    },
  ];

  const scheduleRecords: Record<string, string> = {};
  for (const sch of schedulesData) {
    const s = await prisma.workSchedule.upsert({
      where: { code: sch.code },
      update: sch,
      create: sch,
    });
    scheduleRecords[sch.code] = s.id;
  }
  console.log(`✅ Work Schedules seeded (${Object.keys(scheduleRecords).length} schedules)`);

  // 10.3 Kenya Public Holidays (2026 Gazetted)
  const holidaysData = [
    { name: "New Year's Day", date: new Date('2026-01-01T00:00:00Z'), country: 'Kenya', description: 'National public holiday' },
    { name: 'Good Friday', date: new Date('2026-04-03T00:00:00Z'), country: 'Kenya', description: 'Christian holiday' },
    { name: 'Easter Monday', date: new Date('2026-04-06T00:00:00Z'), country: 'Kenya', description: 'Christian holiday' },
    { name: 'Labour Day', date: new Date('2026-05-01T00:00:00Z'), country: 'Kenya', description: 'International Workers Day' },
    { name: 'Madaraka Day', date: new Date('2026-06-01T00:00:00Z'), country: 'Kenya', description: 'Self-governance day celebration' },
    { name: 'Utamaduni / Huduma Day', date: new Date('2026-10-10T00:00:00Z'), country: 'Kenya', description: 'National service and culture day' },
    { name: 'Mashujaa Day', date: new Date('2026-10-20T00:00:00Z'), country: 'Kenya', description: 'Heroes Day celebration' },
    { name: 'Jamhuri Day', date: new Date('2026-12-12T00:00:00Z'), country: 'Kenya', description: 'Republic Day national celebration' },
    { name: 'Christmas Day', date: new Date('2026-12-25T00:00:00Z'), country: 'Kenya', description: 'Christmas celebration' },
    { name: 'Boxing Day / Utamaduni', date: new Date('2026-12-26T00:00:00Z'), country: 'Kenya', description: 'Boxing day holiday' },
  ];

  for (const h of holidaysData) {
    const existing = await prisma.publicHoliday.findFirst({
      where: { name: h.name, country: h.country },
    });
    if (!existing) {
      await prisma.publicHoliday.create({ data: h });
    }
  }
  console.log(`✅ Kenya Public Holidays seeded (${holidaysData.length} holidays)`);

  // 10.4 Employee Shift Assignments
  const emmanuelId = createdEmployeeMap['CORP-000002'];
  const aminaId = createdEmployeeMap['CORP-000003'];

  if (jacksonId) {
    const existing = await prisma.employeeShiftAssignment.findFirst({ where: { employeeId: jacksonId, status: 'ACTIVE' } });
    if (!existing) {
      await prisma.employeeShiftAssignment.create({
        data: {
          employeeId: jacksonId,
          shiftId: shiftRecords['SHF-DAY-12'],
          workScheduleId: scheduleRecords['SCH-ROT-6-1'],
          stationId: stationRecords['STN-CBD01'],
          status: 'ACTIVE',
          notes: 'Senior patrol commander assigned to CBD main station day roster',
          createdById: adminUserId || null,
        },
      });
    }
  }

  if (emmanuelId) {
    const existing = await prisma.employeeShiftAssignment.findFirst({ where: { employeeId: emmanuelId, status: 'ACTIVE' } });
    if (!existing) {
      await prisma.employeeShiftAssignment.create({
        data: {
          employeeId: emmanuelId,
          shiftId: shiftRecords['SHF-NGT-12'],
          workScheduleId: scheduleRecords['SCH-ROT-7-7'],
          stationId: stationRecords['STN-IND02'],
          status: 'ACTIVE',
          notes: 'Armed specialist overnight rapid response shift',
          createdById: adminUserId || null,
        },
      });
    }
  }

  if (aminaId) {
    const existing = await prisma.employeeShiftAssignment.findFirst({ where: { employeeId: aminaId, status: 'ACTIVE' } });
    if (!existing) {
      await prisma.employeeShiftAssignment.create({
        data: {
          employeeId: aminaId,
          shiftId: shiftRecords['SHF-DAY-12'],
          workScheduleId: scheduleRecords['SCH-ROT-6-1'],
          stationId: stationRecords['STN-PRT01'],
          status: 'ACTIVE',
          notes: 'Port security guard day shift assignment',
          createdById: adminUserId || null,
        },
      });
    }
  }

  if (brianId) {
    const existing = await prisma.employeeShiftAssignment.findFirst({ where: { employeeId: brianId, status: 'ACTIVE' } });
    if (!existing) {
      await prisma.employeeShiftAssignment.create({
        data: {
          employeeId: brianId,
          shiftId: shiftRecords['SHF-OFF-08'],
          workScheduleId: scheduleRecords['SCH-MON-FRI'],
          status: 'ACTIVE',
          notes: 'HR compliance officer office hours schedule',
          createdById: adminUserId || null,
        },
      });
    }
  }

  // 10.5 Sample Attendance Records with Overnight, On-Time, Late, Overtime & Approvals
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (jacksonId) {
    // Jackson: Yesterday Day Shift (06:00 -> 18:00), Clocked in 06:10 (On time within 15min grace), clocked out 18:00 -> APPROVED
    const clockIn = new Date(yesterday);
    clockIn.setHours(6, 10, 0, 0);
    const clockOut = new Date(yesterday);
    clockOut.setHours(18, 0, 0, 0);

    await prisma.attendanceRecord.upsert({
      where: {
        employeeId_date: {
          employeeId: jacksonId,
          date: yesterday,
        },
      },
      update: {},
      create: {
        employeeId: jacksonId,
        date: yesterday,
        scheduledShiftId: shiftRecords['SHF-DAY-12'],
        scheduledStartTime: '06:00',
        scheduledEndTime: '18:00',
        actualClockIn: clockIn,
        actualClockOut: clockOut,
        breakDurationMinutes: 60,
        workedMinutes: 650, // (11h 50m) - 1h break = 10h 50m = 650m
        lateMinutes: 0,
        earlyDepartureMinutes: 0,
        overtimeMinutes: 0,
        attendanceStatus: 'PRESENT',
        source: 'PORTAL',
        approvalStatus: 'APPROVED',
        approvedById: adminUserId || null,
        approvedAt: new Date(),
        notes: 'Full shift completed on time',
      },
    });

    // Jackson: Today Day Shift (06:00 -> 18:00), Clocked in 06:00 -> DRAFT
    const todayClockIn = new Date(today);
    todayClockIn.setHours(6, 0, 0, 0);

    await prisma.attendanceRecord.upsert({
      where: {
        employeeId_date: {
          employeeId: jacksonId,
          date: today,
        },
      },
      update: {},
      create: {
        employeeId: jacksonId,
        date: today,
        scheduledShiftId: shiftRecords['SHF-DAY-12'],
        scheduledStartTime: '06:00',
        scheduledEndTime: '18:00',
        actualClockIn: todayClockIn,
        attendanceStatus: 'PRESENT',
        source: 'PORTAL',
        approvalStatus: 'SUBMITTED',
        notes: 'Active on duty',
      },
    });
  }

  if (emmanuelId) {
    // Emmanuel: Yesterday Overnight Shift (18:00 -> 06:00 next morning), Clocked in 18:00, Clocked out 06:00 next day
    const clockIn = new Date(yesterday);
    clockIn.setHours(18, 0, 0, 0);
    const clockOut = new Date(today);
    clockOut.setHours(6, 0, 0, 0);

    const attRec = await prisma.attendanceRecord.upsert({
      where: {
        employeeId_date: {
          employeeId: emmanuelId,
          date: yesterday,
        },
      },
      update: {},
      create: {
        employeeId: emmanuelId,
        date: yesterday,
        scheduledShiftId: shiftRecords['SHF-NGT-12'],
        scheduledStartTime: '18:00',
        scheduledEndTime: '06:00',
        actualClockIn: clockIn,
        actualClockOut: clockOut,
        breakDurationMinutes: 60,
        workedMinutes: 660, // 12h - 1h break = 11h = 660m
        lateMinutes: 0,
        earlyDepartureMinutes: 0,
        overtimeMinutes: 0,
        attendanceStatus: 'PRESENT',
        source: 'HR_MANUAL',
        approvalStatus: 'APPROVED',
        approvedById: adminUserId || null,
        approvedAt: new Date(),
        notes: 'Overnight patrol completed smoothly',
      },
    });

    // Sample Overtime Record for Emmanuel (2 hours overtime approved)
    await prisma.overtimeRecord.create({
      data: {
        employeeId: emmanuelId,
        attendanceRecordId: attRec.id,
        date: yesterday,
        scheduledHours: 12,
        actualHours: 14,
        overtimeMinutes: 120,
        overtimeHours: 2.0,
        reason: 'Extended guard duty due to VIP client container arrival',
        requestedById: adminUserId || null,
        approvedById: adminUserId || null,
        approvedAt: new Date(),
        approvalStatus: 'APPROVED',
        comments: 'Verified by patrol commander',
      },
    });
  }

  if (aminaId) {
    // Amina: Yesterday Shift with Late Arrival (Clocked in 06:30 for 06:00 shift -> 30 min late - 15 min grace = 30 min late arrival)
    const clockIn = new Date(yesterday);
    clockIn.setHours(6, 30, 0, 0);
    const clockOut = new Date(yesterday);
    clockOut.setHours(18, 0, 0, 0);

    await prisma.attendanceRecord.upsert({
      where: {
        employeeId_date: {
          employeeId: aminaId,
          date: yesterday,
        },
      },
      update: {},
      create: {
        employeeId: aminaId,
        date: yesterday,
        scheduledShiftId: shiftRecords['SHF-DAY-12'],
        scheduledStartTime: '06:00',
        scheduledEndTime: '18:00',
        actualClockIn: clockIn,
        actualClockOut: clockOut,
        breakDurationMinutes: 60,
        workedMinutes: 630,
        lateMinutes: 30,
        earlyDepartureMinutes: 0,
        overtimeMinutes: 0,
        attendanceStatus: 'LATE',
        source: 'PORTAL',
        approvalStatus: 'SUBMITTED',
        notes: 'Arrived 30 mins late due to Mombasa ferry delays',
      },
    });
  }

  // =========================================================================
  // 10. PHASE 5: LEAVE MANAGEMENT SEEDING
  // =========================================================================
  console.log('🌱 Seeding Phase 5 Leave Management Entities...');

  // 10.1. Leave Year 2026
  const leaveYear2026 = await prisma.leaveYear.upsert({
    where: { year: 2026 },
    update: { isCurrent: true },
    create: {
      year: 2026,
      startDate: new Date('2026-01-01T00:00:00.000Z'),
      endDate: new Date('2026-12-31T23:59:59.999Z'),
      isCurrent: true,
      notes: 'Standard 2026 Calendar Leave Year',
    },
  });

  // 10.2. Leave Types
  const standardLeaveTypes = [
    {
      code: 'LT-ANNUAL',
      name: 'Annual Leave',
      description: 'Statutory 21-day annual paid leave allowance under Kenya Employment Act 2007',
      isPaid: true,
      defaultDays: 21,
      maxDays: 30,
      requiresApproval: true,
      requiresDocument: false,
      requiresMedicalCert: false,
      genderApplicability: 'ALL',
      color: '#2563eb',
    },
    {
      code: 'LT-SICK',
      name: 'Sick Leave',
      description: 'Medical sickness leave (up to 30 days full pay) with registered practitioner certificate',
      isPaid: true,
      defaultDays: 30,
      maxDays: 45,
      requiresApproval: true,
      requiresDocument: true,
      requiresMedicalCert: true,
      genderApplicability: 'ALL',
      color: '#ef4444',
    },
    {
      code: 'LT-MATERNITY',
      name: 'Maternity Leave',
      description: 'Statutory 3 months (90 calendar days) fully paid maternity leave for female employees',
      isPaid: true,
      defaultDays: 90,
      maxDays: 90,
      requiresApproval: true,
      requiresDocument: true,
      requiresMedicalCert: true,
      genderApplicability: 'FEMALE',
      color: '#ec4899',
    },
    {
      code: 'LT-PATERNITY',
      name: 'Paternity Leave',
      description: 'Statutory 2 weeks (14 calendar days) fully paid paternity leave for male employees',
      isPaid: true,
      defaultDays: 14,
      maxDays: 14,
      requiresApproval: true,
      requiresDocument: true,
      requiresMedicalCert: false,
      genderApplicability: 'MALE',
      color: '#8b5cf6',
    },
    {
      code: 'LT-COMPASSIONATE',
      name: 'Compassionate / Bereavement Leave',
      description: 'Paid special compassionate leave for bereavement of immediate family members',
      isPaid: true,
      defaultDays: 5,
      maxDays: 10,
      requiresApproval: true,
      requiresDocument: true,
      requiresMedicalCert: false,
      genderApplicability: 'ALL',
      color: '#6b7280',
    },
    {
      code: 'LT-STUDY',
      name: 'Study / Examination Leave',
      description: 'Approved leave for certified professional security and academic examinations',
      isPaid: true,
      defaultDays: 7,
      maxDays: 14,
      requiresApproval: true,
      requiresDocument: true,
      requiresMedicalCert: false,
      genderApplicability: 'ALL',
      color: '#06b6d4',
    },
    {
      code: 'LT-UNPAID',
      name: 'Unpaid Leave',
      description: 'Authorized leave of absence without compensation for extended personal matters',
      isPaid: false,
      defaultDays: 0,
      maxDays: 60,
      requiresApproval: true,
      requiresDocument: true,
      requiresMedicalCert: false,
      genderApplicability: 'ALL',
      color: '#f59e0b',
    },
    {
      code: 'LT-EMERGENCY',
      name: 'Emergency / Casual Leave',
      description: 'Short notice personal or family emergency leave',
      isPaid: true,
      defaultDays: 3,
      maxDays: 5,
      requiresApproval: true,
      requiresDocument: false,
      requiresMedicalCert: false,
      genderApplicability: 'ALL',
      color: '#10b981',
    },
  ];

  const leaveTypeMap: Record<string, string> = {};

  for (const lt of standardLeaveTypes) {
    const record = await prisma.leaveType.upsert({
      where: { code: lt.code },
      update: {
        name: lt.name,
        description: lt.description,
        isPaid: lt.isPaid,
        defaultDays: lt.defaultDays,
        maxDays: lt.maxDays,
        requiresApproval: lt.requiresApproval,
        requiresDocument: lt.requiresDocument,
        requiresMedicalCert: lt.requiresMedicalCert,
        genderApplicability: lt.genderApplicability,
        color: lt.color,
      },
      create: lt,
    });
    leaveTypeMap[lt.code] = record.id;
  }
  console.log(`✅ Leave types seeded (${Object.keys(leaveTypeMap).length} types)`);

  // 10.3. Leave Policies
  const standardPolicies = [
    {
      policyCode: 'POL-ANN-STD',
      leaveTypeId: leaveTypeMap['LT-ANNUAL'],
      policyName: 'Standard Corporate Annual Leave Policy',
      entitledDays: 21,
      accrualMethod: 'ANNUAL_ALLOCATION',
      accrualFrequency: 'YEARLY',
      allowCarryForward: true,
      maxCarryForwardDays: 5,
      carryForwardExpiryMonths: 3,
      minServiceDays: 90,
      prorationRule: 'PRORATED_BY_MONTH',
      excludeWeekends: true,
      excludeHolidays: true,
      allowAdvanceLeave: false,
    },
    {
      policyCode: 'POL-SCK-STD',
      leaveTypeId: leaveTypeMap['LT-SICK'],
      policyName: 'Standard Kenya Medical Sick Leave Policy',
      entitledDays: 30,
      accrualMethod: 'ANNUAL_ALLOCATION',
      accrualFrequency: 'YEARLY',
      allowCarryForward: false,
      maxCarryForwardDays: 0,
      carryForwardExpiryMonths: 0,
      minServiceDays: 30,
      prorationRule: 'NONE',
      excludeWeekends: true,
      excludeHolidays: true,
      allowAdvanceLeave: false,
    },
    {
      policyCode: 'POL-MAT-STD',
      leaveTypeId: leaveTypeMap['LT-MATERNITY'],
      policyName: 'Statutory Kenya Maternity Policy',
      entitledDays: 90,
      accrualMethod: 'ANNUAL_ALLOCATION',
      accrualFrequency: 'YEARLY',
      allowCarryForward: false,
      maxCarryForwardDays: 0,
      carryForwardExpiryMonths: 0,
      minServiceDays: 180,
      prorationRule: 'NONE',
      excludeWeekends: false, // Calendar days per statutory law
      excludeHolidays: false,
      allowAdvanceLeave: false,
    },
    {
      policyCode: 'POL-PAT-STD',
      leaveTypeId: leaveTypeMap['LT-PATERNITY'],
      policyName: 'Statutory Kenya Paternity Policy',
      entitledDays: 14,
      accrualMethod: 'ANNUAL_ALLOCATION',
      accrualFrequency: 'YEARLY',
      allowCarryForward: false,
      maxCarryForwardDays: 0,
      carryForwardExpiryMonths: 0,
      minServiceDays: 90,
      prorationRule: 'NONE',
      excludeWeekends: false,
      excludeHolidays: false,
      allowAdvanceLeave: false,
    },
    {
      policyCode: 'POL-CMP-STD',
      leaveTypeId: leaveTypeMap['LT-COMPASSIONATE'],
      policyName: 'Compassionate Bereavement Policy',
      entitledDays: 5,
      accrualMethod: 'ANNUAL_ALLOCATION',
      accrualFrequency: 'YEARLY',
      allowCarryForward: false,
      maxCarryForwardDays: 0,
      carryForwardExpiryMonths: 0,
      minServiceDays: 0,
      prorationRule: 'NONE',
      excludeWeekends: true,
      excludeHolidays: true,
      allowAdvanceLeave: false,
    },
    {
      policyCode: 'POL-UNP-STD',
      leaveTypeId: leaveTypeMap['LT-UNPAID'],
      policyName: 'Authorized Unpaid Leave Policy',
      entitledDays: 0,
      accrualMethod: 'CUSTOM',
      accrualFrequency: 'YEARLY',
      allowCarryForward: false,
      maxCarryForwardDays: 0,
      carryForwardExpiryMonths: 0,
      minServiceDays: 90,
      prorationRule: 'NONE',
      excludeWeekends: true,
      excludeHolidays: true,
      allowAdvanceLeave: true,
      maxAdvanceDays: 30,
    },
  ];

  const policyMap: Record<string, string> = {};

  for (const pol of standardPolicies) {
    if (!pol.leaveTypeId) continue;
    const p = await prisma.leavePolicy.upsert({
      where: { policyCode: pol.policyCode },
      update: pol,
      create: pol,
    });
    policyMap[pol.policyCode] = p.id;
  }
  console.log(`✅ Leave policies seeded (${Object.keys(policyMap).length} policies)`);

  // 10.4. Leave Entitlements for Active Seeded Employees
  const activeEmployees = await prisma.employee.findMany({
    where: { deletedAt: null, isArchived: false },
    select: { id: true, gender: true, fullName: true, employeeNumber: true },
  });

  for (const emp of activeEmployees) {
    // Annual Leave Entitlement
    await prisma.leaveEntitlement.upsert({
      where: {
        employeeId_leaveTypeId_leaveYear: {
          employeeId: emp.id,
          leaveTypeId: leaveTypeMap['LT-ANNUAL'],
          leaveYear: 2026,
        },
      },
      update: {},
      create: {
        employeeId: emp.id,
        leaveTypeId: leaveTypeMap['LT-ANNUAL'],
        policyId: policyMap['POL-ANN-STD'],
        leaveYear: 2026,
        openingBalance: 2, // 2 days carried forward
        entitledDays: 21,
        accruedDays: 0,
        carriedForwardDays: 2,
        usedDays: 0,
        pendingDays: 0,
        adjustmentDays: 0,
        expiredDays: 0,
        availableBalance: 23, // 21 + 2
      },
    });

    // Sick Leave Entitlement
    await prisma.leaveEntitlement.upsert({
      where: {
        employeeId_leaveTypeId_leaveYear: {
          employeeId: emp.id,
          leaveTypeId: leaveTypeMap['LT-SICK'],
          leaveYear: 2026,
        },
      },
      update: {},
      create: {
        employeeId: emp.id,
        leaveTypeId: leaveTypeMap['LT-SICK'],
        policyId: policyMap['POL-SCK-STD'],
        leaveYear: 2026,
        openingBalance: 0,
        entitledDays: 30,
        accruedDays: 0,
        carriedForwardDays: 0,
        usedDays: 0,
        pendingDays: 0,
        adjustmentDays: 0,
        expiredDays: 0,
        availableBalance: 30,
      },
    });

    // Gender specific
    if (emp.gender === 'FEMALE') {
      await prisma.leaveEntitlement.upsert({
        where: {
          employeeId_leaveTypeId_leaveYear: {
            employeeId: emp.id,
            leaveTypeId: leaveTypeMap['LT-MATERNITY'],
            leaveYear: 2026,
          },
        },
        update: {},
        create: {
          employeeId: emp.id,
          leaveTypeId: leaveTypeMap['LT-MATERNITY'],
          policyId: policyMap['POL-MAT-STD'],
          leaveYear: 2026,
          openingBalance: 0,
          entitledDays: 90,
          usedDays: 0,
          pendingDays: 0,
          availableBalance: 90,
        },
      });
    } else {
      await prisma.leaveEntitlement.upsert({
        where: {
          employeeId_leaveTypeId_leaveYear: {
            employeeId: emp.id,
            leaveTypeId: leaveTypeMap['LT-PATERNITY'],
            leaveYear: 2026,
          },
        },
        update: {},
        create: {
          employeeId: emp.id,
          leaveTypeId: leaveTypeMap['LT-PATERNITY'],
          policyId: policyMap['POL-PAT-STD'],
          leaveYear: 2026,
          openingBalance: 0,
          entitledDays: 14,
          usedDays: 0,
          pendingDays: 0,
          availableBalance: 14,
        },
      });
    }
  }
  console.log(`✅ Leave entitlements initialized for ${activeEmployees.length} employees`);

  // 10.5. Sample Leave Requests & Attendance Synchronization
  const samuelId = createdEmployeeMap['CORP-000005'] || createdEmployeeMap['CORP-000002'];

  if (jacksonId) {
    // Approved 3-day Annual Leave for Jackson (Aug 18 to Aug 20, 2026)
    const approvedRequest = await prisma.leaveRequest.upsert({
      where: { requestNumber: 'LR-2026-0001' },
      update: {},
      create: {
        requestNumber: 'LR-2026-0001',
        employeeId: jacksonId,
        leaveTypeId: leaveTypeMap['LT-ANNUAL'],
        leaveYear: 2026,
        startDate: new Date('2026-08-18T00:00:00.000Z'),
        endDate: new Date('2026-08-20T00:00:00.000Z'),
        durationDays: 3,
        isHalfDay: false,
        reason: 'Annual family leave and domestic travel to Nyeri',
        contactPhone: '+254 712 345 678',
        emergencyContact: 'Mary Wambui Kamau (+254 722 987 654)',
        status: 'APPROVED',
        submittedAt: new Date('2026-08-01T10:00:00.000Z'),
        reviewedById: adminUserId || null,
        reviewedAt: new Date('2026-08-02T14:30:00.000Z'),
        reviewerComments: 'Approved by Head of Security Guarding Operations',
      },
    });

    // Update Jackson's entitlement used and available balance
    await prisma.leaveEntitlement.update({
      where: {
        employeeId_leaveTypeId_leaveYear: {
          employeeId: jacksonId,
          leaveTypeId: leaveTypeMap['LT-ANNUAL'],
          leaveYear: 2026,
        },
      },
      data: {
        usedDays: 3,
        availableBalance: 20, // 23 - 3
      },
    });

    // Synchronize Approved Leave with Attendance Records (Aug 18, 19, 20)
    const leaveDates = ['2026-08-18', '2026-08-19', '2026-08-20'];
    for (const dStr of leaveDates) {
      const d = new Date(`${dStr}T00:00:00.000Z`);
      await prisma.attendanceRecord.upsert({
        where: {
          employeeId_date: {
            employeeId: jacksonId,
            date: d,
          },
        },
        update: {
          attendanceStatus: 'ON_LEAVE',
          notes: 'Approved Leave: LR-2026-0001 (Annual Leave)',
          approvalStatus: 'APPROVED',
        },
        create: {
          employeeId: jacksonId,
          date: d,
          scheduledShiftId: shiftRecords['SHF-DAY-12'],
          scheduledStartTime: '06:00',
          scheduledEndTime: '18:00',
          workedMinutes: 0,
          lateMinutes: 0,
          earlyDepartureMinutes: 0,
          overtimeMinutes: 0,
          attendanceStatus: 'ON_LEAVE',
          source: 'PORTAL',
          approvalStatus: 'APPROVED',
          notes: 'Approved Leave: LR-2026-0001 (Annual Leave)',
        },
      });
    }
  }

  if (samuelId) {
    // Pending 2-day Sick Leave Request for Samuel
    await prisma.leaveRequest.upsert({
      where: { requestNumber: 'LR-2026-0002' },
      update: {},
      create: {
        requestNumber: 'LR-2026-0002',
        employeeId: samuelId,
        leaveTypeId: leaveTypeMap['LT-SICK'],
        leaveYear: 2026,
        startDate: new Date('2026-08-25T00:00:00.000Z'),
        endDate: new Date('2026-08-26T00:00:00.000Z'),
        durationDays: 2,
        isHalfDay: false,
        reason: 'Outpatient medical treatment and doctor-ordered rest',
        contactPhone: '+254 722 000 111',
        status: 'SUBMITTED',
        submittedAt: new Date(),
      },
    });

    // Update Samuel's pending days
    await prisma.leaveEntitlement.update({
      where: {
        employeeId_leaveTypeId_leaveYear: {
          employeeId: samuelId,
          leaveTypeId: leaveTypeMap['LT-SICK'],
          leaveYear: 2026,
        },
      },
      data: {
        pendingDays: 2,
        availableBalance: 28, // 30 - 2 pending
      },
    });
  }

  // 10.6. Sample Leave Adjustment
  if (jacksonId) {
    await prisma.leaveAdjustment.create({
      data: {
        employeeId: jacksonId,
        leaveTypeId: leaveTypeMap['LT-ANNUAL'],
        leaveYear: 2026,
        adjustmentType: 'CARRY_FORWARD',
        adjustmentDays: 2,
        previousBalance: 21,
        newBalance: 23,
        reason: 'Management approved unused 2025 leave carry-forward to 2026',
        approvedById: adminUserId || null,
      },
    });
  }
  console.log('✅ Sample leave requests, adjustments, and attendance sync seeded');

  // =========================================================================
  // 11. PHASE 6: PAYROLL CONFIGURATION & SALARY STRUCTURE SEED
  // =========================================================================
  console.log('💼 Seeding Phase 6 Payroll Configuration & Salary Structures...');

  // 11.1. Company Payroll Setting
  await prisma.companyPayrollSetting.upsert({
    where: { id: 'corpsec_payroll_config_default' },
    update: {},
    create: {
      id: 'corpsec_payroll_config_default',
      payFrequency: 'MONTHLY',
      defaultPayDay: 28,
      cutoffDay: 24,
      defaultCurrency: 'KES',
      roundingMethod: 'ROUND_NEAREST_1',
      prorationBaseDays: 30,
      overtimeHourlyDivisor: 225,
      allowNegativeNetPay: false,
      requireTwoTierApproval: true,
      payrollNumberPrefix: 'PAY-',
      payslipNumberPrefix: 'PS-',
      paymentBatchPrefix: 'PB-',
    },
  });
  console.log('✅ Company payroll settings configured');

  // 11.2. 12 Monthly Payroll Periods for 2026
  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];

  for (let m = 1; m <= 12; m++) {
    const mm = m < 10 ? `0${m}` : `${m}`;
    const periodNumber = `PRD-2026-${mm}`;
    const lastDayOfMonth = new Date(Date.UTC(2026, m, 0)).getDate();
    const startDate = new Date(Date.UTC(2026, m - 1, 1, 0, 0, 0));
    const endDate = new Date(Date.UTC(2026, m - 1, lastDayOfMonth, 23, 59, 59));
    const cutoffDate = new Date(Date.UTC(2026, m - 1, 24, 23, 59, 59));
    const paymentDate = new Date(Date.UTC(2026, m - 1, 28, 12, 0, 0));

    let status = 'DRAFT';
    if (m < 8) status = 'LOCKED';
    else if (m === 8) status = 'OPEN'; // Current August 2026 period

    await prisma.payrollPeriod.upsert({
      where: { periodNumber },
      update: { status, startDate, endDate, cutoffDate, paymentDate },
      create: {
        periodNumber,
        name: `${monthNames[m - 1]} 2026 Monthly Payroll`,
        startDate,
        endDate,
        payrollMonth: m,
        payrollYear: 2026,
        payFrequency: 'MONTHLY',
        status,
        cutoffDate,
        paymentDate,
        createdById: adminUserId || null,
        notes: m === 8 ? 'Current active payroll cycle for August 2026' : undefined,
      },
    });
  }
  console.log('✅ 12 Monthly Payroll Periods for 2026 seeded (August 2026 OPEN)');

  // 11.3. Allowance Types
  const allowanceTypesData = [
    {
      code: 'ALW-HOUSE',
      name: 'House Allowance',
      description: 'Statutory housing benefit (15% of basic salary as per Kenya Employment Act standards)',
      calculationMethod: 'PERCENTAGE_OF_BASIC',
      defaultAmount: 0,
      percentageValue: 15.0,
      isTaxable: true,
      isPensionable: false,
      isRecurring: true,
    },
    {
      code: 'ALW-TRANS',
      name: 'Commuter & Transport Allowance',
      description: 'Monthly fixed commuter transport allowance for security deployments',
      calculationMethod: 'FIXED_AMOUNT',
      defaultAmount: 3500,
      percentageValue: null,
      isTaxable: true,
      isPensionable: false,
      isRecurring: true,
    },
    {
      code: 'ALW-RISK',
      name: 'Guard Tactical Risk Allowance',
      description: 'Hazard and risk compensation for cash-in-transit (CIT) and high-threat embassy guarding',
      calculationMethod: 'FIXED_AMOUNT',
      defaultAmount: 2500,
      percentageValue: null,
      isTaxable: true,
      isPensionable: false,
      isRecurring: true,
    },
    {
      code: 'ALW-RESP',
      name: 'Station Commander Responsibility Allowance',
      description: 'Duty allowance for Site Supervisors and Lead Shift In-charges',
      calculationMethod: 'FIXED_AMOUNT',
      defaultAmount: 5000,
      percentageValue: null,
      isTaxable: true,
      isPensionable: false,
      isRecurring: true,
    },
    {
      code: 'ALW-NIGHT',
      name: 'Night Shift Allowance',
      description: 'Special nocturnal duty allowance for overnight security guarding rotations',
      calculationMethod: 'FIXED_AMOUNT',
      defaultAmount: 2000,
      percentageValue: null,
      isTaxable: true,
      isPensionable: false,
      isRecurring: true,
    },
    {
      code: 'ALW-MEAL',
      name: 'Field Patrol Meal Subsidy',
      description: 'Non-taxable meal voucher subsidy for field dog handlers and mobile patrol crews',
      calculationMethod: 'FIXED_AMOUNT',
      defaultAmount: 1500,
      percentageValue: null,
      isTaxable: false,
      isPensionable: false,
      isRecurring: true,
    },
  ];

  const allowanceTypeMap: Record<string, string> = {};
  for (const at of allowanceTypesData) {
    const rec = await prisma.allowanceType.upsert({
      where: { code: at.code },
      update: at,
      create: at,
    });
    allowanceTypeMap[at.code] = rec.id;
  }
  console.log(`✅ ${Object.keys(allowanceTypeMap).length} Allowance Types seeded`);

  // 11.4. Deduction Types
  const deductionTypesData = [
    {
      code: 'DED-WELFARE',
      name: 'CorpSec Staff Benevolent & Welfare Scheme',
      description: 'Voluntary monthly employee welfare contribution for medical and bereavement aid',
      calculationMethod: 'FIXED_AMOUNT',
      isStatutory: false,
      isRecurring: true,
    },
    {
      code: 'DED-SACCO',
      name: 'Harambee / Security Guards SACCO Savings',
      description: 'Monthly cooperative society voluntary savings contribution',
      calculationMethod: 'FIXED_AMOUNT',
      isStatutory: false,
      isRecurring: true,
    },
    {
      code: 'DED-ADVANCE',
      name: 'Mid-Month Salary Advance Recovery',
      description: 'Recovery instalment for employee emergency mid-month salary advance',
      calculationMethod: 'BALANCE_BASED',
      isStatutory: false,
      isRecurring: true,
    },
    {
      code: 'DED-LOAN',
      name: 'Emergency Staff Loan Recovery',
      description: 'Company welfare emergency loan monthly deduction',
      calculationMethod: 'BALANCE_BASED',
      isStatutory: false,
      isRecurring: true,
    },
    {
      code: 'DED-HELB',
      name: 'Higher Education Loans Board (HELB)',
      description: 'Statutory university student loan repayment',
      calculationMethod: 'FIXED_AMOUNT',
      isStatutory: false,
      isRecurring: true,
    },
    {
      code: 'DED-UNIFORM',
      name: 'Guard Uniform Loss / Damage Recovery',
      description: 'Authorized deduction for tactical kit or radio equipment negligence',
      calculationMethod: 'FIXED_AMOUNT',
      isStatutory: false,
      isRecurring: false,
    },
  ];

  const deductionTypeMap: Record<string, string> = {};
  for (const dt of deductionTypesData) {
    const rec = await prisma.deductionType.upsert({
      where: { code: dt.code },
      update: dt,
      create: dt,
    });
    deductionTypeMap[dt.code] = rec.id;
  }
  console.log(`✅ ${Object.keys(deductionTypeMap).length} Deduction Types seeded`);

  // 11.5. Statutory Rules & PAYE Progressive Tax Bands (Kenya 2026)
  const payeRule = await prisma.statutoryRule.upsert({
    where: { regimeType: 'PAYE' },
    update: {
      name: 'Kenya PAYE Progressive Tax Regime',
      description: 'Individual income tax progressive brackets with personal relief',
      calculationType: 'BANDED_PROGRESSIVE',
      minThreshold: 24000,
    },
    create: {
      regimeType: 'PAYE',
      name: 'Kenya PAYE Progressive Tax Regime',
      description: 'Individual income tax progressive brackets with personal relief',
      calculationType: 'BANDED_PROGRESSIVE',
      minThreshold: 24000,
    },
  });

  const taxBandsData = [
    { bandOrder: 1, bandName: 'Band 1: Up to KES 24,000', lowerThreshold: 0, upperThreshold: 24000, ratePercentage: 10.0 },
    { bandOrder: 2, bandName: 'Band 2: KES 24,001 to KES 32,333', lowerThreshold: 24000, upperThreshold: 32333, ratePercentage: 25.0 },
    { bandOrder: 3, bandName: 'Band 3: KES 32,334 to KES 500,000', lowerThreshold: 32333, upperThreshold: 500000, ratePercentage: 30.0 },
    { bandOrder: 4, bandName: 'Band 4: KES 500,001 to KES 800,000', lowerThreshold: 500000, upperThreshold: 800000, ratePercentage: 32.5 },
    { bandOrder: 5, bandName: 'Band 5: Above KES 800,000', lowerThreshold: 800000, upperThreshold: null, ratePercentage: 35.0 },
  ];

  // Clean existing tax bands for seed idempotency
  await prisma.taxBand.deleteMany({ where: { statutoryRuleId: payeRule.id } });
  for (const tb of taxBandsData) {
    await prisma.taxBand.create({
      data: {
        statutoryRuleId: payeRule.id,
        bandOrder: tb.bandOrder,
        bandName: tb.bandName,
        lowerThreshold: tb.lowerThreshold,
        upperThreshold: tb.upperThreshold,
        ratePercentage: tb.ratePercentage,
        taxReliefMonthly: 2400,
        taxReliefAnnual: 28800,
      },
    });
  }

  // NSSF Tier 1 & Tier 2
  await prisma.statutoryRule.upsert({
    where: { regimeType: 'NSSF_TIER_1' },
    update: {
      name: 'NSSF Tier I Pension Contribution',
      description: '6% employee + 6% employer up to Lower Earnings Limit of KES 7,000',
      calculationType: 'CAPPED_PERCENTAGE',
      employeeRate: 6.0,
      employerRate: 6.0,
      minThreshold: 0,
      maxThreshold: 7000,
      capAmount: 420,
    },
    create: {
      regimeType: 'NSSF_TIER_1',
      name: 'NSSF Tier I Pension Contribution',
      description: '6% employee + 6% employer up to Lower Earnings Limit of KES 7,000',
      calculationType: 'CAPPED_PERCENTAGE',
      employeeRate: 6.0,
      employerRate: 6.0,
      minThreshold: 0,
      maxThreshold: 7000,
      capAmount: 420,
    },
  });

  await prisma.statutoryRule.upsert({
    where: { regimeType: 'NSSF_TIER_2' },
    update: {
      name: 'NSSF Tier II Pension Contribution',
      description: '6% employee + 6% employer on earnings from KES 7,001 to KES 36,000',
      calculationType: 'CAPPED_PERCENTAGE',
      employeeRate: 6.0,
      employerRate: 6.0,
      minThreshold: 7000,
      maxThreshold: 36000,
      capAmount: 1740,
    },
    create: {
      regimeType: 'NSSF_TIER_2',
      name: 'NSSF Tier II Pension Contribution',
      description: '6% employee + 6% employer on earnings from KES 7,001 to KES 36,000',
      calculationType: 'CAPPED_PERCENTAGE',
      employeeRate: 6.0,
      employerRate: 6.0,
      minThreshold: 7000,
      maxThreshold: 36000,
      capAmount: 1740,
    },
  });

  // SHA (Social Health Authority)
  await prisma.statutoryRule.upsert({
    where: { regimeType: 'SHA' },
    update: {
      name: 'Social Health Authority (SHA) Contribution',
      description: '2.75% of gross monthly earnings with statutory minimum of KES 300',
      calculationType: 'FIXED_PERCENTAGE',
      employeeRate: 2.75,
      employerRate: 0.0,
      minThreshold: 300,
    },
    create: {
      regimeType: 'SHA',
      name: 'Social Health Authority (SHA) Contribution',
      description: '2.75% of gross monthly earnings with statutory minimum of KES 300',
      calculationType: 'FIXED_PERCENTAGE',
      employeeRate: 2.75,
      employerRate: 0.0,
      minThreshold: 300,
    },
  });

  // Housing Levy
  await prisma.statutoryRule.upsert({
    where: { regimeType: 'HOUSING_LEVY' },
    update: {
      name: 'Affordable Housing Levy',
      description: '1.5% employee + 1.5% employer mandatory deduction on gross salary',
      calculationType: 'FIXED_PERCENTAGE',
      employeeRate: 1.5,
      employerRate: 1.5,
      minThreshold: 0,
    },
    create: {
      regimeType: 'HOUSING_LEVY',
      name: 'Affordable Housing Levy',
      description: '1.5% employee + 1.5% employer mandatory deduction on gross salary',
      calculationType: 'FIXED_PERCENTAGE',
      employeeRate: 1.5,
      employerRate: 1.5,
      minThreshold: 0,
    },
  });
  console.log('✅ Kenyan Statutory Rules & PAYE Progressive Tax Bands seeded');

  // 11.6. Overtime Rate Configurations
  const otConfigs = [
    {
      code: 'OT-NORMAL-1.5',
      name: 'Normal Shift Overtime (1.5x)',
      overtimeType: 'NORMAL',
      rateMultiplier: 1.5,
      hourlyDivisor: 225,
      requiresApproval: true,
    },
    {
      code: 'OT-HOLIDAY-2.0',
      name: 'Public Holiday Overtime (2.0x)',
      overtimeType: 'PUBLIC_HOLIDAY',
      rateMultiplier: 2.0,
      hourlyDivisor: 225,
      requiresApproval: true,
    },
    {
      code: 'OT-RESTDAY-2.0',
      name: 'Scheduled Rest Day Overtime (2.0x)',
      overtimeType: 'REST_DAY',
      rateMultiplier: 2.0,
      hourlyDivisor: 225,
      requiresApproval: true,
    },
  ];

  for (const ot of otConfigs) {
    await prisma.overtimeRateConfig.upsert({
      where: { code: ot.code },
      update: ot,
      create: ot,
    });
  }
  console.log('✅ Overtime Rate Configurations seeded');

  // 11.7. Bonus & Commission Types
  await prisma.bonusType.upsert({
    where: { code: 'BON-PERF' },
    update: {},
    create: {
      code: 'BON-PERF',
      name: 'Quarterly Guarding Performance Bonus',
      description: 'Reward for zero security breach and exemplary attendance',
      defaultCalculationMethod: 'FIXED_AMOUNT',
      defaultAmount: 3000,
      isTaxable: true,
    },
  });

  await prisma.bonusType.upsert({
    where: { code: 'BON-ATTEND' },
    update: {},
    create: {
      code: 'BON-ATTEND',
      name: '100% Perfect Attendance Bonus',
      description: 'Monthly reward for zero late arrivals and complete shifts',
      defaultCalculationMethod: 'FIXED_AMOUNT',
      defaultAmount: 2000,
      isTaxable: true,
    },
  });

  await prisma.commissionType.upsert({
    where: { code: 'COMM-SEC-CLIENT' },
    update: {},
    create: {
      code: 'COMM-SEC-CLIENT',
      name: 'New Guarding Site Client Acquisition',
      description: '5% commission on first month guarding contract value',
      calculationMethod: 'PERCENTAGE',
    },
  });
  console.log('✅ Bonus & Commission Types seeded');

  // 11.8. Seed Employee Salary Structures for All Seeded Employees
  const allEmployees = await prisma.employee.findMany({
    where: { deletedAt: null, isArchived: false },
    include: { position: true },
  });

  for (const emp of allEmployees) {
    let baseSalary = 24500;
    const title = emp.jobTitle?.toLowerCase() || '';

    if (title.includes('director') || title.includes('head') || title.includes('manager')) {
      baseSalary = 110000;
    } else if (title.includes('supervisor') || title.includes('in-charge') || title.includes('commander')) {
      baseSalary = 45000;
    } else if (title.includes('dog handler') || title.includes('driver') || title.includes('cctv')) {
      baseSalary = 32000;
    } else if (title.includes('guard')) {
      baseSalary = 25000;
    }

    // Historical salary review simulation for Jackson Kamau (demonstrates salary history & effective dates)
    if (emp.id === jacksonId) {
      // Historical Old Record: Jan 1, 2026 to June 30, 2026 -> 25,000 KES
      const existingHist = await prisma.salaryRecord.findFirst({
        where: { employeeId: emp.id, basicSalary: 25000 },
      });
      if (!existingHist) {
        await prisma.salaryRecord.create({
          data: {
            employeeId: emp.id,
            basicSalary: 25000,
            payFrequency: 'MONTHLY',
            currency: 'KES',
            effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
            effectiveTo: new Date('2026-06-30T23:59:59.000Z'),
            status: 'SUPERSEDED',
            isOvertimeEligible: true,
            changeReason: 'Initial probationary contract compensation',
            proposedById: adminUserId || null,
            approvedById: adminUserId || null,
            approvedAt: new Date('2026-01-01T00:00:00.000Z'),
          },
        });
      }

      // Current Active Record: Effective July 1, 2026 -> 30,000 KES
      const existingActive = await prisma.salaryRecord.findFirst({
        where: { employeeId: emp.id, status: 'ACTIVE' },
      });
      if (!existingActive) {
        await prisma.salaryRecord.create({
          data: {
            employeeId: emp.id,
            basicSalary: 30000,
            payFrequency: 'MONTHLY',
            currency: 'KES',
            effectiveFrom: new Date('2026-07-01T00:00:00.000Z'),
            effectiveTo: null,
            status: 'ACTIVE',
            isOvertimeEligible: true,
            changeReason: 'Annual Merit & Guard Performance Review Increment',
            proposedById: adminUserId || null,
            approvedById: adminUserId || null,
            approvedAt: new Date('2026-07-01T00:00:00.000Z'),
          },
        });
      }
    } else {
      // Standard active salary for other employees
      const existingActive = await prisma.salaryRecord.findFirst({
        where: { employeeId: emp.id, status: 'ACTIVE' },
      });
      if (!existingActive) {
        await prisma.salaryRecord.create({
          data: {
            employeeId: emp.id,
            basicSalary: baseSalary,
            payFrequency: 'MONTHLY',
            currency: 'KES',
            effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
            effectiveTo: null,
            status: 'ACTIVE',
            isOvertimeEligible: !title.includes('director') && !title.includes('head'),
            changeReason: 'Standard job position salary assignment',
            proposedById: adminUserId || null,
            approvedById: adminUserId || null,
            approvedAt: new Date('2026-01-01T00:00:00.000Z'),
          },
        });
      }
    }

    // 11.9. Assign Standard Allowances & Deductions
    // Assign House Allowance (15%) to all
    const hasHouseAlw = await prisma.employeeAllowance.findFirst({
      where: { employeeId: emp.id, allowanceTypeId: allowanceTypeMap['ALW-HOUSE'] },
    });
    if (!hasHouseAlw) {
      await prisma.employeeAllowance.create({
        data: {
          employeeId: emp.id,
          allowanceTypeId: allowanceTypeMap['ALW-HOUSE'],
          amount: Math.round(baseSalary * 0.15),
          calculationMethod: 'PERCENTAGE_OF_BASIC',
          percentageValue: 15.0,
          effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
          status: 'ACTIVE',
        },
      });
    }

    // Assign Welfare Deduction to all
    const hasWelfare = await prisma.employeeDeduction.findFirst({
      where: { employeeId: emp.id, deductionTypeId: deductionTypeMap['DED-WELFARE'] },
    });
    if (!hasWelfare) {
      await prisma.employeeDeduction.create({
        data: {
          employeeId: emp.id,
          deductionTypeId: deductionTypeMap['DED-WELFARE'],
          amount: 500,
          calculationMethod: 'FIXED_AMOUNT',
          effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
          status: 'ACTIVE',
        },
      });
    }
  }

  // Sample Guard Tactical Risk & SACCO for Jackson Kamau
  if (jacksonId) {
    const hasRisk = await prisma.employeeAllowance.findFirst({
      where: { employeeId: jacksonId, allowanceTypeId: allowanceTypeMap['ALW-RISK'] },
    });
    if (!hasRisk) {
      await prisma.employeeAllowance.create({
        data: {
          employeeId: jacksonId,
          allowanceTypeId: allowanceTypeMap['ALW-RISK'],
          amount: 2500,
          calculationMethod: 'FIXED_AMOUNT',
          effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
          status: 'ACTIVE',
        },
      });
    }

    const hasSacco = await prisma.employeeDeduction.findFirst({
      where: { employeeId: jacksonId, deductionTypeId: deductionTypeMap['DED-SACCO'] },
    });
    if (!hasSacco) {
      await prisma.employeeDeduction.create({
        data: {
          employeeId: jacksonId,
          deductionTypeId: deductionTypeMap['DED-SACCO'],
          amount: 2000,
          calculationMethod: 'FIXED_AMOUNT',
          effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
          status: 'ACTIVE',
        },
      });
    }
  }
  // =========================================================================
  // PHASE 11: EMPLOYMENT TYPE CONFIGS & LIFECYCLE SEEDING
  // =========================================================================
  const employmentTypes = [
    { code: 'PERMANENT', name: 'Permanent Full-Time', description: 'Standard permanent employment with 3-month probation and full statutory benefits', hasContractEnd: false, hasProbation: true, defaultProbationMonths: 3, hasLeaveEntitlement: true, hasStatutoryDeductions: true },
    { code: 'CONTRACT', name: 'Fixed-Term Contract', description: 'Renewable fixed-term assignment with specified start and end dates', hasContractEnd: true, hasProbation: true, defaultProbationMonths: 3, hasLeaveEntitlement: true, hasStatutoryDeductions: true },
    { code: 'CASUAL', name: 'Casual / Day-Rate Guard', description: 'On-demand security guard paid per shift or daily rate', hasContractEnd: false, hasProbation: false, defaultProbationMonths: 0, hasLeaveEntitlement: false, hasStatutoryDeductions: true },
    { code: 'TEMPORARY', name: 'Temporary Relief Officer', description: 'Short-term tactical relief operative for surge coverage', hasContractEnd: true, hasProbation: false, defaultProbationMonths: 0, hasLeaveEntitlement: true, hasStatutoryDeductions: true },
    { code: 'INTERN', name: 'Operations & Security Intern', description: 'Structured tactical operations internship program', hasContractEnd: true, hasProbation: false, defaultProbationMonths: 0, hasLeaveEntitlement: true, hasStatutoryDeductions: true },
    { code: 'PART_TIME', name: 'Part-Time Shift Specialist', description: 'Scheduled weekend or night tactical coverage', hasContractEnd: false, hasProbation: true, defaultProbationMonths: 3, hasLeaveEntitlement: true, hasStatutoryDeductions: true },
  ];

  for (const et of employmentTypes) {
    await prisma.employmentTypeConfig.upsert({
      where: { code: et.code },
      update: et,
      create: et,
    });
  }
  console.log('✅ Phase 11 Employment Type Configs seeded');

  // Update sample employees with contract and probation dates
  const lifecycleEmployees = await prisma.employee.findMany();
  for (let i = 0; i < lifecycleEmployees.length; i++) {
    const emp = lifecycleEmployees[i];
    if (i % 3 === 0) {
      // Contract employee with expiring contract in 35 days
      const contractEnd = new Date(Date.now() + 35 * 24 * 60 * 60 * 1000);
      const contractStart = new Date(Date.now() - 330 * 24 * 60 * 60 * 1000);
      await prisma.employee.update({
        where: { id: emp.id },
        data: {
          employmentType: 'CONTRACT',
          contractStartDate: contractStart,
          contractEndDate: contractEnd,
          probationStatus: 'CONFIRMED',
          probationStartDate: contractStart,
          probationEndDate: new Date(contractStart.getTime() + 90 * 24 * 60 * 60 * 1000),
        },
      });
    } else if (i % 3 === 1) {
      // Employee currently ON_PROBATION with 20 days remaining
      const joinDate = new Date(Date.now() - 70 * 24 * 60 * 60 * 1000);
      const probEnd = new Date(Date.now() + 20 * 24 * 60 * 60 * 1000);
      await prisma.employee.update({
        where: { id: emp.id },
        data: {
          employmentStatus: 'ON_PROBATION',
          probationStatus: 'IN_PROGRESS',
          probationStartDate: joinDate,
          probationEndDate: probEnd,
          employmentDate: joinDate,
        },
      });
    } else {
      // Confirmed permanent
      const joinDate = new Date(Date.now() - 400 * 24 * 60 * 60 * 1000);
      await prisma.employee.update({
        where: { id: emp.id },
        data: {
          employmentType: 'PERMANENT',
          employmentStatus: 'ACTIVE',
          probationStatus: 'CONFIRMED',
          probationStartDate: joinDate,
          probationEndDate: new Date(joinDate.getTime() + 90 * 24 * 60 * 60 * 1000),
        },
      });
    }
  }
  console.log('✅ Sample contract & probation lifecycle dates updated on employees');

  // 17. Default Attendance Settings
  await prisma.attendanceSetting.upsert({
    where: { id: 'corpsec_attendance_setting_default' },
    update: {},
    create: {
      id: 'corpsec_attendance_setting_default',
      gracePeriodMinutes: 15,
      overtimeThresholdMinutes: 0,
      maxDailyOvertimeMinutes: 360,
      workingDaysPerWeek: 6,
      breakDurationMinutes: 60,
      roundingIntervalMinutes: 1,
      earlyDepartureThresholdMins: 15,
      autoAbsenceCheckHour: 23,
      requireSupervisorOvertimeApproval: true,
      requireAttendanceLockForPayroll: true,
    },
  });
  console.log('✅ Default Attendance & Shift settings seeded');

  // 18. Phase 13: Recruitment Vacancies & Candidates Seed
  const opsDept = await prisma.department.findFirst({ where: { code: 'SEC-OPS' } });
  const hrDept = await prisma.department.findFirst({ where: { code: 'HR-ADMIN' } });
  const nairobiBranch = await prisma.branch.findFirst({ where: { code: 'NRB-HQ' } });
  const westlandsStation = await prisma.station.findFirst({ where: { code: 'STN-WST-01' } });
  const industrialStation = await prisma.station.findFirst({ where: { code: 'STN-IND-02' } });
  const hrAdminUser = await prisma.user.findFirst({ where: { email: 'hr.admin@corpsec.co.ke' } });

  if (opsDept && hrAdminUser) {
    const v1 = await prisma.vacancy.upsert({
      where: { vacancyNumber: 'VAC-2026-0001' },
      update: {},
      create: {
        vacancyNumber: 'VAC-2026-0001',
        title: 'Senior Manned Guarding Officer',
        departmentId: opsDept.id,
        branchId: nairobiBranch?.id,
        stationId: westlandsStation?.id,
        employmentType: 'PERMANENT',
        openingsCount: 5,
        description: 'CorpSec is seeking disciplined, physically fit, and vigilant Manned Guarding Officers to safeguard premium commercial facilities across Nairobi.',
        responsibilities: '- Perform access control, visitor screening, and vehicle inspection.\n- Conduct scheduled perimeter foot patrols.\n- Log all operational occurrences and incident reports.',
        requirements: '- Valid Kenya National ID and Certificate of Good Conduct.\n- Minimum KCSE certificate (Grade D+ and above).\n- Prior security training or NYS/military background is an added advantage.',
        qualifications: 'KCSE Certificate, Security Guard Training Certificate',
        skillsRequired: 'Access Control, Conflict De-escalation, Radio Communications',
        experienceYears: 1.5,
        minSalary: 25000,
        maxSalary: 30000,
        showSalaryPublicly: true,
        applicationDeadline: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        assignedRecruiterId: hrAdminUser.id,
        status: 'OPEN',
        publishedAt: new Date(),
      },
    });

    const v2 = await prisma.vacancy.upsert({
      where: { vacancyNumber: 'VAC-2026-0002' },
      update: {},
      create: {
        vacancyNumber: 'VAC-2026-0002',
        title: 'CCTV Control Room Operator',
        departmentId: opsDept.id,
        branchId: nairobiBranch?.id,
        stationId: westlandsStation?.id,
        employmentType: 'PERMANENT',
        openingsCount: 2,
        description: 'Responsible for monitoring 24/7 high-definition surveillance feeds, alarms, and coordinating mobile response units.',
        responsibilities: '- 24/7 video wall monitoring and automated sensor alerts.\n- Dispatching rapid response patrols upon intrusion triggers.\n- Archiving evidence and audit video logs.',
        requirements: '- Diploma in IT, Telecommunications, or Electronic Security.\n- 2+ years of surveillance control room experience.\n- High attention to detail and calm under pressure.',
        qualifications: 'Diploma in IT / Electronic Security Systems',
        skillsRequired: 'CCTV Monitoring, Hikvision/Dahua VMS, Incident Dispatching',
        experienceYears: 2.0,
        minSalary: 38000,
        maxSalary: 45000,
        showSalaryPublicly: false,
        applicationDeadline: new Date(Date.now() + 21 * 24 * 60 * 60 * 1000),
        assignedRecruiterId: hrAdminUser.id,
        status: 'OPEN',
        publishedAt: new Date(),
      },
    });

    const v3 = await prisma.vacancy.upsert({
      where: { vacancyNumber: 'VAC-2026-0003' },
      update: {},
      create: {
        vacancyNumber: 'VAC-2026-0003',
        title: 'Rapid Response Patrol Driver',
        departmentId: opsDept.id,
        branchId: nairobiBranch?.id,
        stationId: industrialStation?.id,
        employmentType: 'CONTRACT',
        openingsCount: 3,
        description: 'Provide rapid armed/unarmed tactical response to alarm activations within assigned Nairobi sectors.',
        responsibilities: '- Execute high-speed defensive driving to client alarms.\n- Secure premises and coordinate with police command.',
        requirements: '- Valid Kenyan driving license with clean record (Classes B, C, E).\n- Defensive driving certificate.\n- 3+ years experience.',
        qualifications: 'Defensive Driving Certificate, Clean BCE Driving License',
        skillsRequired: 'Defensive Driving, Navigation, Tactical Security',
        experienceYears: 3.0,
        minSalary: 32000,
        maxSalary: 36000,
        showSalaryPublicly: true,
        applicationDeadline: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000),
        assignedRecruiterId: hrAdminUser.id,
        status: 'OPEN',
        publishedAt: new Date(),
      },
    });

    if (hrDept) {
      await prisma.vacancy.upsert({
        where: { vacancyNumber: 'VAC-2026-0004' },
        update: {},
        create: {
          vacancyNumber: 'VAC-2026-0004',
          title: 'HR Compliance & Payroll Associate',
          departmentId: hrDept.id,
          branchId: nairobiBranch?.id,
          employmentType: 'PERMANENT',
          openingsCount: 1,
          description: 'Assist the HR and Payroll teams in statutory filings, shift compliance, and employee file administration.',
          responsibilities: '- Audit biometric attendance logs.\n- Support statutory returns (PAYE, NSSF, SHA, Housing Levy).\n- Coordinate employee onboarding.',
          requirements: '- Degree in Human Resources, Business, or Accounting (CPA Part II).\n- 2+ years HR/Payroll experience in Kenya.',
          qualifications: 'B.Com / B.HRM / CPA Part II',
          skillsRequired: 'Statutory Payroll, Kenya Labor Law, ATS Management',
          experienceYears: 2.0,
          minSalary: 45000,
          maxSalary: 55000,
          showSalaryPublicly: false,
          applicationDeadline: new Date(Date.now() + 45 * 24 * 60 * 60 * 1000),
          assignedRecruiterId: hrAdminUser.id,
          status: 'OPEN',
          publishedAt: new Date(),
        },
      });
    }

    // Seed Sample Candidates
    const c1 = await prisma.candidate.upsert({
      where: { applicationNumber: 'CORPSEC-APP-2026-000001' },
      update: {},
      create: {
        applicationNumber: 'CORPSEC-APP-2026-000001',
        vacancyId: v1.id,
        fullName: 'Brian Kiprop Otieno',
        email: 'brian.kiprop@example.co.ke',
        phone: '+254711998877',
        location: 'Nairobi, Kasarani',
        currentOccupation: 'Security Guard',
        experienceYears: 2,
        highestQualification: 'KCSE Certificate',
        skills: 'Perimeter Security, Access Control, Customer Service',
        relevantExperience: 'Worked as static guard at Garden City Mall for 2 years.',
        coverLetter: 'I am excited to apply for the Security Officer position at CorpSec.',
        source: 'CAREERS_PAGE',
        currentStage: 'APPLIED',
        assignedRecruiterId: hrAdminUser.id,
      },
    });

    const c2 = await prisma.candidate.upsert({
      where: { applicationNumber: 'CORPSEC-APP-2026-000002' },
      update: {},
      create: {
        applicationNumber: 'CORPSEC-APP-2026-000002',
        vacancyId: v1.id,
        fullName: 'Mercy Wanjiku Njeri',
        email: 'mercy.wanjiku@example.co.ke',
        phone: '+254722887766',
        location: 'Nairobi, Westlands',
        currentOccupation: 'Senior Guard',
        experienceYears: 3,
        highestQualification: 'Diploma in Criminology',
        skills: 'Patrol Operations, Report Writing, First Aid',
        relevantExperience: '3 years guarding diplomatic residential complexes.',
        coverLetter: 'Applying with a strong passion for corporate security and disciplined service.',
        source: 'CAREERS_PAGE',
        currentStage: 'SCREENING',
        screeningStatus: 'PASS',
        screeningScore: 88,
        screeningStrengths: 'Excellent communication, Diploma qualification, certified first responder',
        screeningWeaknesses: 'None noted',
        assignedRecruiterId: hrAdminUser.id,
      },
    });

    const c3 = await prisma.candidate.upsert({
      where: { applicationNumber: 'CORPSEC-APP-2026-000003' },
      update: {},
      create: {
        applicationNumber: 'CORPSEC-APP-2026-000003',
        vacancyId: v2.id,
        fullName: 'David Omondi Aluoch',
        email: 'david.omondi@example.co.ke',
        phone: '+254733776655',
        location: 'Nairobi, Kilimani',
        currentOccupation: 'CCTV Controller',
        experienceYears: 4,
        highestQualification: 'Diploma in IT & Security',
        skills: 'Hikvision VMS, Milestone, Alarm Dispatching',
        relevantExperience: '4 years monitoring retail banks and industrial warehouses.',
        source: 'REFERRAL',
        currentStage: 'SHORTLISTED',
        screeningStatus: 'PASS',
        screeningScore: 94,
        assignedRecruiterId: hrAdminUser.id,
      },
    });

    const c4 = await prisma.candidate.upsert({
      where: { applicationNumber: 'CORPSEC-APP-2026-000004' },
      update: {},
      create: {
        applicationNumber: 'CORPSEC-APP-2026-000004',
        vacancyId: v2.id,
        fullName: 'Grace Chebet Korir',
        email: 'grace.chebet@example.co.ke',
        phone: '+254744665544',
        location: 'Nairobi, South B',
        currentOccupation: 'Control Room Officer',
        experienceYears: 3,
        highestQualification: 'BSc in Information Systems',
        skills: 'Network Surveillance, Video Analytics, Incident Management',
        source: 'CAREERS_PAGE',
        currentStage: 'INTERVIEW',
        screeningStatus: 'PASS',
        screeningScore: 91,
        assignedRecruiterId: hrAdminUser.id,
      },
    });

    // Add interview for c4
    await prisma.interview.upsert({
      where: { id: 'seed_interview_c4' },
      update: {},
      create: {
        id: 'seed_interview_c4',
        candidateId: c4.id,
        vacancyId: v2.id,
        interviewType: 'PANEL',
        scheduledDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
        startTime: '10:00',
        endTime: '11:00',
        location: 'CorpSec HQ Boardroom 2, Upper Hill',
        status: 'SCHEDULED',
        notes: 'Technical panel interview covering CCTV VMS management and rapid escalation protocols.',
        createdById: hrAdminUser.id,
      },
    });

    const c5 = await prisma.candidate.upsert({
      where: { applicationNumber: 'CORPSEC-APP-2026-000005' },
      update: {},
      create: {
        applicationNumber: 'CORPSEC-APP-2026-000005',
        vacancyId: v3.id,
        fullName: 'Kevin Mwangi Njoroge',
        email: 'kevin.mwangi@example.co.ke',
        phone: '+254755554433',
        location: 'Nairobi, Embakasi',
        currentOccupation: 'Patrol Driver',
        experienceYears: 5,
        highestQualification: 'Clean BCE License, Defensive Driving Certificate',
        skills: 'Tactical Driving, GPS Navigation, Canine Handling',
        source: 'CAREERS_PAGE',
        currentStage: 'OFFER',
        screeningStatus: 'PASS',
        screeningScore: 96,
        assignedRecruiterId: hrAdminUser.id,
      },
    });

    // Add JobOffer for c5
    await prisma.jobOffer.upsert({
      where: { offerNumber: 'OFFER-2026-0001' },
      update: {},
      create: {
        offerNumber: 'OFFER-2026-0001',
        candidateId: c5.id,
        vacancyId: v3.id,
        departmentId: opsDept.id,
        stationId: industrialStation?.id,
        employmentType: 'CONTRACT',
        proposedSalary: 35000,
        allowancesJson: JSON.stringify([{ name: 'Risk Allowance', amount: 3000 }]),
        startDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
        offerExpiryDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        status: 'APPROVED',
        secureToken: 'sec_tok_seed_offer_kevin_mwangi_2026',
        tokenExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        createdById: hrAdminUser.id,
        approvedById: hrAdminUser.id,
        approvedAt: new Date(),
        offerLetterContent: 'Official Offer of Employment with CorpSec Investigations & Guarding Services as Rapid Response Patrol Driver.',
      },
    });

    console.log('✅ Phase 13 Vacancies, Candidates, Interviews & Job Offers seeded');
  }

  console.log('✨ Seeding completed successfully!');
}

main()
  .catch((e) => {
    console.error('❌ Error during seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
