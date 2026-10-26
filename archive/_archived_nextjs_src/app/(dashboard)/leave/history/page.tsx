'use client';

import React, { useState, useEffect } from 'react';
import { Breadcrumb } from '@/components/layout/Breadcrumb';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Spinner } from '@/components/ui/Spinner';
import { useToast } from '@/components/ui/ToastContext';
import { ShieldCheck, History, Search, Filter } from 'lucide-react';

export default function LeaveHistoryPage() {
  const { toastError } = useToast() as any;
  const [employees, setEmployees] = useState<any[]>([]);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>('ALL');
  const [ledgerEntries, setLedgerEntries] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchEmployees();
  }, []);

  useEffect(() => {
    fetchHistory();
  }, [selectedEmployeeId]);

  const fetchEmployees = async () => {
    try {
      const res = await fetch('/api/employees?pageSize=100&status=ACTIVE');
      const json = await res.json();
      if (json.success) setEmployees(json.data.employees || []);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchHistory = async () => {
    try {
      setIsLoading(true);
      const url =
        selectedEmployeeId && selectedEmployeeId !== 'ALL'
          ? `/api/leave/ledger?employeeId=${selectedEmployeeId}`
          : `/api/leave/ledger?employeeId=${employees[0]?.id || ''}`;

      if (url.includes('employeeId=') && !url.endsWith('employeeId=')) {
        const res = await fetch(url);
        const json = await res.json();
        if (json.success) setLedgerEntries(json.data.entries || []);
      } else {
        setLedgerEntries([]);
      }
    } catch (err) {
      console.error('Failed to load leave history', err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Header */}
      <div>
        <Breadcrumb
          items={[
            { label: 'Leave Management', href: '/leave' },
            { label: 'Immutable Leave History Vault' },
          ]}
        />
        <h1 style={{ fontSize: '1.75rem', fontWeight: 800, color: '#0f172a', marginTop: '0.25rem' }}>
          Immutable Leave History Vault
        </h1>
        <p style={{ fontSize: '0.875rem', color: '#64748b' }}>
          Permanent historical ledger of all opening allocations, monthly accruals, leave usages, rollover carry-forwards, and restorations
        </p>
      </div>

      {/* Filter Card */}
      <Card>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ width: '320px' }}>
            <Select
              label="Select Personnel"
              value={selectedEmployeeId}
              onChange={(e) => setSelectedEmployeeId(e.target.value)}
              options={[
                { value: 'ALL', label: 'Select an employee to inspect history...' },
                ...employees.map((e) => ({
                  value: e.id,
                  label: `${e.fullName} (${e.employeeNumber} — ${e.department?.name || 'General'})`,
                })),
              ]}
            />
          </div>
        </div>
      </Card>

      {/* History Ledger Table */}
      <Card>
        {isLoading ? (
          <div style={{ padding: '3rem', display: 'flex', justifyContent: 'center' }}>
            <Spinner size="lg" />
          </div>
        ) : ledgerEntries.length === 0 ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: '#94a3b8' }}>
            Select an employee from the dropdown above to view their permanent leave transaction audit ledger.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem' }}>
              <thead>
                <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0', textAlign: 'left', color: '#475569' }}>
                  <th style={{ padding: '0.75rem 1rem', fontWeight: 700 }}>Timestamp</th>
                  <th style={{ padding: '0.75rem 1rem', fontWeight: 700 }}>Transaction Type</th>
                  <th style={{ padding: '0.75rem 1rem', fontWeight: 700 }}>Leave Category</th>
                  <th style={{ padding: '0.75rem 1rem', fontWeight: 700, textAlign: 'right' }}>Days Delta</th>
                  <th style={{ padding: '0.75rem 1rem', fontWeight: 700, textAlign: 'right' }}>Balance Trajectory</th>
                  <th style={{ padding: '0.75rem 1rem', fontWeight: 700 }}>Reference Code</th>
                  <th style={{ padding: '0.75rem 1rem', fontWeight: 700 }}>Reason / Audit Notes</th>
                </tr>
              </thead>
              <tbody>
                {ledgerEntries.map((e) => (
                  <tr key={e.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '0.75rem 1rem', color: '#64748b' }}>
                      {new Date(e.date).toLocaleString()}
                    </td>
                    <td style={{ padding: '0.75rem 1rem' }}>
                      <Badge variant="neutral" size="sm">{e.transactionType}</Badge>
                    </td>
                    <td style={{ padding: '0.75rem 1rem', fontWeight: 600, color: '#0f172a' }}>
                      {e.leaveType.name}
                    </td>
                    <td style={{ padding: '0.75rem 1rem', textAlign: 'right', fontWeight: 800, color: e.days > 0 ? '#059669' : '#ef4444' }}>
                      {e.days > 0 ? `+${e.days}` : e.days}d
                    </td>
                    <td style={{ padding: '0.75rem 1rem', textAlign: 'right', fontFamily: 'monospace', fontWeight: 600 }}>
                      {e.previousBalance} &rarr; {e.newBalance}
                    </td>
                    <td style={{ padding: '0.75rem 1rem', fontFamily: 'monospace', fontWeight: 700, color: '#2563eb' }}>
                      {e.reference || '—'}
                    </td>
                    <td style={{ padding: '0.75rem 1rem', color: '#475569' }}>
                      {e.reason || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
