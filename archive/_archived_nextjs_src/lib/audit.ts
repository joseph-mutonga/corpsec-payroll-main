import { db } from './db';
import { headers } from 'next/headers';

const SENSITIVE_KEYS = new Set([
  'password',
  'passwordhash',
  'password_hash',
  'token',
  'tokenhash',
  'jwt',
  'secret',
  'authorization',
  'cookie',
  'confirmPassword',
  'oldPassword',
  'newPassword',
]);

/**
 * Recursively scrub sensitive keys from an object before recording to audit logs.
 */
function sanitizeForAudit(data: any): any {
  if (data === null || data === undefined) return data;
  if (typeof data !== 'object') return data;

  if (Array.isArray(data)) {
    return data.map(sanitizeForAudit);
  }

  const sanitized: Record<string, any> = {};
  for (const [key, val] of Object.entries(data)) {
    if (SENSITIVE_KEYS.has(key.toLowerCase())) {
      sanitized[key] = '[REDACTED_SECRET]';
    } else if (typeof val === 'object' && val !== null) {
      sanitized[key] = sanitizeForAudit(val);
    } else {
      sanitized[key] = val;
    }
  }
  return sanitized;
}

export interface CreateAuditLogParams {
  userId?: string | null;
  userEmail?: string | null;
  action: string;
  module?: string;
  resource?: string;
  entityType?: string;
  entityId?: string;
  resourceId?: string;
  details?: any;
  previousValue?: any;
  oldValues?: any;
  newValue?: any;
  newValues?: any;
  ipAddress?: string;
  userAgent?: string;
}

/**
 * Record an audit log entry in the database.
 */
export async function createAuditLog(params: CreateAuditLogParams): Promise<void> {
  try {
    let clientIp = params.ipAddress;
    let clientUa = params.userAgent;

    if (!clientIp || !clientUa) {
      try {
        const headerList = headers();
        if (!clientIp) {
          clientIp =
            headerList.get('x-forwarded-for')?.split(',')[0].trim() ||
            headerList.get('x-real-ip') ||
            '127.0.0.1';
        }
        if (!clientUa) {
          clientUa = headerList.get('user-agent') || 'Unknown User Agent';
        }
      } catch (err) {
        // Headers might not be available in background/cron contexts
        clientIp = clientIp || '127.0.0.1';
        clientUa = clientUa || 'System Process';
      }
    }

    let validUserId: string | null = null;
    let validUserEmail = params.userEmail || null;

    if (params.userId) {
      const userExists = await db.user.findUnique({
        where: { id: params.userId },
        select: { id: true, email: true },
      });
      if (userExists) {
        validUserId = userExists.id;
        if (!validUserEmail) validUserEmail = userExists.email;
      } else {
        const emp = await db.employee.findUnique({
          where: { id: params.userId },
          select: { userId: true, user: { select: { email: true } } },
        });
        if (emp?.userId) {
          validUserId = emp.userId;
          if (!validUserEmail) validUserEmail = emp.user?.email || null;
        }
      }
    }

    const prevJson = params.previousValue || params.oldValues
      ? JSON.stringify(sanitizeForAudit(params.previousValue || params.oldValues))
      : null;
    const newJson = params.newValue || params.newValues
      ? JSON.stringify(sanitizeForAudit(params.newValue || params.newValues))
      : null;

    await db.auditLog.create({
      data: {
        userId: validUserId,
        userEmail: validUserEmail,
        action: params.action.toUpperCase(),
        module: (params.module || params.resource || 'SYSTEM').toUpperCase(),
        entityType: params.entityType || params.resource || null,
        entityId: params.entityId || params.resourceId || null,
        previousValue: prevJson,
        newValue: newJson,
        ipAddress: clientIp,
        userAgent: clientUa,
      },
    });
  } catch (error) {
    // Audit logging failure should not crash the main operation, but must be logged to stderr
    console.error('CRITICAL: Failed to write audit log:', error);
  }
}

export const logAudit = createAuditLog;

export const AuditService = {
  log: createAuditLog,
};

