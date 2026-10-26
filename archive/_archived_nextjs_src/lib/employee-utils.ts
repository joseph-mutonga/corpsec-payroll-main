import { db } from './db';

/**
 * Normalizes common Kenyan phone formats to standard E.164 (+254...) format.
 * Accommodates +254..., 07..., 01..., 254...
 */
export function normalizeKenyanPhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const cleaned = phone.replace(/[\s\-\(\)]/g, '');

  if (/^\+254[17]\d{8}$/.test(cleaned)) {
    return cleaned;
  }
  if (/^254[17]\d{8}$/.test(cleaned)) {
    return `+${cleaned}`;
  }
  if (/^0[17]\d{8}$/.test(cleaned)) {
    return `+254${cleaned.substring(1)}`;
  }
  if (/^[17]\d{8}$/.test(cleaned)) {
    return `+254${cleaned}`;
  }
  // Return cleaned original if non-standard or foreign
  return cleaned;
}

/**
 * Validates whether a phone number matches standard Kenyan carrier prefixes (Safaricom, Airtel, Telkom).
 */
export function isValidKenyanPhone(phone: string | null | undefined): boolean {
  if (!phone) return false;
  const normalized = normalizeKenyanPhone(phone);
  if (!normalized) return false;
  return /^\+254[17]\d{8}$/.test(normalized);
}

/**
 * Generates next sequential unique employee number.
 * Format: CORP-000001
 */
export async function generateNextEmployeeNumber(prefix = 'CORP-'): Promise<string> {
  const lastEmployee = await db.employee.findFirst({
    where: {
      employeeNumber: { startsWith: prefix },
    },
    orderBy: { employeeNumber: 'desc' },
    select: { employeeNumber: true },
  });

  if (!lastEmployee) {
    return `${prefix}000001`;
  }

  const numericPartStr = lastEmployee.employeeNumber.replace(prefix, '');
  const numericVal = parseInt(numericPartStr, 10);

  if (isNaN(numericVal)) {
    const totalCount = await db.employee.count();
    const nextNum = (totalCount + 1).toString().padStart(6, '0');
    return `${prefix}${nextNum}`;
  }

  const nextNum = (numericVal + 1).toString().padStart(6, '0');
  return `${prefix}${nextNum}`;
}

/**
 * Masks sensitive bank account number or M-Pesa number.
 * Example: "1104892841" -> "****2841"
 */
export function maskSensitiveNumber(val: string | null | undefined): string | null {
  if (!val) return null;
  const trimmed = val.trim();
  if (trimmed.length <= 4) return '****';
  const lastFour = trimmed.slice(-4);
  return `****${lastFour}`;
}

/**
 * Masks M-Pesa phone number.
 * Example: "+254712345678" -> "+254***5678"
 */
export function maskMpesaPhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const normalized = normalizeKenyanPhone(phone) || phone;
  if (normalized.length >= 8) {
    const prefix = normalized.slice(0, 4);
    const suffix = normalized.slice(-4);
    return `${prefix}***${suffix}`;
  }
  return '****';
}

/**
 * Sanitize an employee record for users without sensitive view permissions.
 */
export function sanitizeEmployeeForView(employee: any, hasSensitiveAccess: boolean) {
  if (hasSensitiveAccess) {
    return employee;
  }

  return {
    ...employee,
    bankAccountNumber: maskSensitiveNumber(employee.bankAccountNumber),
    mpesaPhoneNumber: maskMpesaPhone(employee.mpesaPhoneNumber),
    // Hide bank branch codes if sensitive
    bankBranchCode: employee.bankBranchCode ? '***' : null,
  };
}
