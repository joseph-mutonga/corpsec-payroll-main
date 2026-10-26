import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { apiSuccess, apiError } from '@/lib/response';
import { requireAuth } from '@/lib/permissions';

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireAuth(req, ['payroll.finalize']);
    if (auth.error) return auth.error;

    const run = await prisma.payrollRun.findUnique({
      where: { id: params.id },
      include: {
        employeeRecords: true,
        exceptions: {
          where: { isResolved: false, severity: 'CRITICAL' },
        },
      },
    });

    if (!run) {
      return apiError('Payroll run not found', 404);
    }

    if (run.status !== 'APPROVED') {
      return apiError(`Cannot finalize payroll run with status ${run.status}. Expected status is APPROVED.`, 400);
    }

    // Check for unresolved critical exceptions
    if (run.exceptions.length > 0) {
      return apiError(
        `Finalization Blocked: There are ${run.exceptions.length} unresolved critical exceptions that must be resolved before finalizing this payroll run.`,
        400
      );
    }

    // Atomic transaction to update loan balances and mark finalized
    await prisma.$transaction(async (tx) => {
      // Process loan / advance balance updates from calculation trace
      for (const rec of run.employeeRecords) {
        if (rec.calculationTrace) {
          try {
            const trace = JSON.parse(rec.calculationTrace);
            const balanceUpdates = trace.otherDeductions?.balanceUpdates || [];

            for (const upd of balanceUpdates) {
              if (upd.assignmentId && upd.newBalance !== undefined) {
                await tx.employeeDeduction.update({
                  where: { id: upd.assignmentId },
                  data: {
                    currentBalance: upd.newBalance,
                    status: upd.isFinished ? 'INACTIVE' : 'ACTIVE',
                  },
                });
              }
            }
          } catch (e) {
            // Ignore parse errors on individual traces
          }
        }
      }

      // Update Payroll Run
      await tx.payrollRun.update({
        where: { id: run.id },
        data: {
          status: 'FINALIZED',
          finalizedById: auth.user.id,
          finalizedAt: new Date(),
        },
      });

      // Audit log
      await tx.auditLog.create({
        data: {
          userId: auth.user.id,
          action: 'FINALIZE_PAYROLL_RUN',
          module: 'PAYROLL',
          entityType: 'PAYROLL_RUN',
          entityId: run.id,
          newValue: JSON.stringify({
            runNumber: run.runNumber,
            employeeCount: run.employeeCount,
            netPayroll: run.totalNetPayroll,
          }),
        },
      });
    });

    return apiSuccess({ id: run.id, status: 'FINALIZED' }, {
      message: `Payroll run ${run.runNumber} has been finalized. Financial records are now sealed.`,
    });
  } catch (err: any) {
    return apiError(err.message || 'Failed to finalize payroll run', 500);
  }
}
