'use client';

import React, { useState, useEffect } from 'react';
import {
  FileText,
  Download,
  Printer,
  Eye,
  Calendar,
  Banknote,
  CheckCircle2,
  AlertCircle,
  Building,
  ShieldCheck,
} from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { Spinner } from '@/components/ui/Spinner';
import { useToast } from '@/components/ui/ToastContext';
import { FormattedPayslipData } from '@/types';

export default function EmployeePayslipsPage() {
  const { toast } = useToast();
  const [payslips, setPayslips] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Payslip Detail Modal
  const [selectedPayslipId, setSelectedPayslipId] = useState<string | null>(null);
  const [payslipData, setPayslipData] = useState<FormattedPayslipData | null>(null);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);

  useEffect(() => {
    fetchPayslips();
  }, []);

  const fetchPayslips = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/portal/payslips');
      const data = await res.json();
      if (data.success) {
        setPayslips(data.data || []);
      } else {
        toast.error('Error', data.message || 'Failed to load payslips');
      }
    } catch (err) {
      toast.error('Error', 'Unable to connect to payslips service');
    } finally {
      setIsLoading(false);
    }
  };

  const handleViewPayslip = async (recordId: string) => {
    setSelectedPayslipId(recordId);
    setIsLoadingDetail(true);
    try {
      const res = await fetch(`/api/portal/payslips/${recordId}`);
      const data = await res.json();
      if (data.success) {
        setPayslipData(data.data);
      } else {
        toast.error('Error', data.message || 'Failed to load payslip detail');
      }
    } catch (err) {
      toast.error('Error', 'Failed to retrieve formatted payslip');
    } finally {
      setIsLoadingDetail(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  if (isLoading) {
    return (
      <div style={{ padding: '3rem 1rem', textAlign: 'center' }}>
        <Spinner fullHeight message="Retrieving your official payslips vault..." />
      </div>
    );
  }

  return (
    <div style={{ paddingBottom: '3rem' }}>
      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '1rem',
          marginBottom: '1.5rem',
        }}
      >
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>
            My Payslips Vault
          </h1>
          <p style={{ fontSize: '0.85rem', color: '#64748b', marginTop: '0.25rem' }}>
            Official electronic pay advisories and statutory payroll records.
          </p>
        </div>
      </div>

      {payslips.length === 0 ? (
        <Card>
          <div style={{ textAlign: 'center', padding: '3rem 1rem', color: '#64748b' }}>
            <FileText size={40} color="#94a3b8" style={{ marginBottom: '1rem' }} />
            <h3 style={{ fontSize: '1.15rem', color: '#0f172a' }}>No Payslips Available Yet</h3>
            <p style={{ marginTop: '0.5rem', fontSize: '0.85rem' }}>
              Your payslips will automatically appear here once monthly payroll runs are finalized and published.
            </p>
          </div>
        </Card>
      ) : (
        <Card>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #e2e8f0', textAlign: 'left', backgroundColor: '#f8fafc' }}>
                  <th style={{ padding: '0.75rem 1rem', color: '#475569', fontWeight: 700 }}>Payroll Period</th>
                  <th style={{ padding: '0.75rem 1rem', color: '#475569', fontWeight: 700 }}>Run Number</th>
                  <th style={{ padding: '0.75rem 1rem', color: '#475569', fontWeight: 700, textAlign: 'right' }}>Gross Pay</th>
                  <th style={{ padding: '0.75rem 1rem', color: '#475569', fontWeight: 700, textAlign: 'right' }}>Total Deductions</th>
                  <th style={{ padding: '0.75rem 1rem', color: '#475569', fontWeight: 700, textAlign: 'right' }}>Net Pay</th>
                  <th style={{ padding: '0.75rem 1rem', color: '#475569', fontWeight: 700 }}>Disbursement</th>
                  <th style={{ padding: '0.75rem 1rem', color: '#475569', fontWeight: 700, textAlign: 'center' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {payslips.map((ps) => (
                  <tr key={ps.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '0.75rem 1rem' }}>
                      <strong style={{ color: '#0f172a' }}>{ps.periodName}</strong>
                      <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{ps.periodNumber}</div>
                    </td>
                    <td style={{ padding: '0.75rem 1rem', color: '#64748b', fontFamily: 'monospace' }}>
                      {ps.runNumber}
                    </td>
                    <td style={{ padding: '0.75rem 1rem', textAlign: 'right', fontWeight: 600 }}>
                      KES {ps.grossEarnings.toLocaleString()}
                    </td>
                    <td style={{ padding: '0.75rem 1rem', textAlign: 'right', color: '#dc2626', fontWeight: 600 }}>
                      -KES {ps.totalDeductions.toLocaleString()}
                    </td>
                    <td style={{ padding: '0.75rem 1rem', textAlign: 'right', color: '#16a34a', fontWeight: 800, fontSize: '0.95rem' }}>
                      KES {ps.netPay.toLocaleString()}
                    </td>
                    <td style={{ padding: '0.75rem 1rem' }}>
                      <Badge variant={ps.paymentStatus === 'PAID' ? 'success' : 'warning'}>
                        {ps.paymentStatus}
                      </Badge>
                    </td>
                    <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>
                      <Button
                        variant="secondary"
                        size="sm"
                        leftIcon={<Eye size={14} />}
                        onClick={() => handleViewPayslip(ps.payrollRecordId)}
                      >
                        View Payslip
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Payslip Modal */}
      <Modal
        isOpen={!!selectedPayslipId}
        onClose={() => {
          setSelectedPayslipId(null);
          setPayslipData(null);
        }}
        title="Official Employee Payslip"
        size="lg"
      >
        {isLoadingDetail || !payslipData ? (
          <div style={{ padding: '3rem 0', textAlign: 'center' }}>
            <Spinner fullHeight message="Formatting official payslip advisory..." />
          </div>
        ) : (
          <div>
            {/* Header / Company letterhead */}
            <div
              style={{
                borderBottom: '2px solid #0f172a',
                paddingBottom: '1rem',
                marginBottom: '1.25rem',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                flexWrap: 'wrap',
                gap: '1rem',
              }}
            >
              <div>
                <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>
                  {payslipData.company.name}
                </h2>
                <div style={{ fontSize: '0.8rem', color: '#475569', marginTop: '0.2rem' }}>
                  {payslipData.company.tagline}
                </div>
                <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.2rem' }}>
                  KRA PIN: {payslipData.company.kraPin} • {payslipData.company.email}
                </div>
              </div>

              <div style={{ textAlign: 'right' }}>
                <Badge variant="gold" size="md">CONFIDENTIAL PAYSLIP</Badge>
                <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#0f172a', marginTop: '0.35rem' }}>
                  {payslipData.periodName}
                </div>
                <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                  Pay Date: {payslipData.payDate || 'Month End'}
                </div>
              </div>
            </div>

            {/* Employee Information Snapshot */}
            <div
              style={{
                backgroundColor: '#f8fafc',
                borderRadius: '8px',
                padding: '0.85rem 1rem',
                marginBottom: '1.25rem',
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: '0.75rem',
                fontSize: '0.8rem',
              }}
            >
              <div>
                <span style={{ color: '#64748b' }}>Employee Name:</span>{' '}
                <strong style={{ color: '#0f172a' }}>{payslipData.employee.fullName}</strong>
              </div>
              <div>
                <span style={{ color: '#64748b' }}>Staff Number:</span>{' '}
                <strong style={{ color: '#0f172a' }}>{payslipData.employee.employeeNumber}</strong>
              </div>
              <div>
                <span style={{ color: '#64748b' }}>Department:</span>{' '}
                <span>{payslipData.employee.department}</span>
              </div>
              <div>
                <span style={{ color: '#64748b' }}>Position:</span>{' '}
                <span>{payslipData.employee.jobTitle}</span>
              </div>
              <div>
                <span style={{ color: '#64748b' }}>KRA PIN:</span>{' '}
                <span style={{ fontFamily: 'monospace' }}>{payslipData.employee.kraPin || 'N/A'}</span>
              </div>
              <div>
                <span style={{ color: '#64748b' }}>Payment Mode:</span>{' '}
                <span>{payslipData.employee.paymentMethod}</span>
              </div>
            </div>

            {/* Earnings & Deductions Breakdown Tables */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.25rem', marginBottom: '1.25rem' }}>
              {/* Earnings Table */}
              <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden' }}>
                <div style={{ backgroundColor: '#f0fdf4', padding: '0.5rem 0.75rem', fontWeight: 700, fontSize: '0.85rem', color: '#166534', borderBottom: '1px solid #bbf7d0' }}>
                  EARNINGS & ALLOWANCES
                </div>
                <div style={{ padding: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.8rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Basic Salary</span>
                    <strong>KES {payslipData.salaryStructure.basicSalary.toLocaleString()}</strong>
                  </div>
                  {payslipData.earnings.allowances.map((al, idx) => (
                    <div key={idx} style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>{al.name}</span>
                      <span>KES {al.amount.toLocaleString()}</span>
                    </div>
                  ))}
                  {payslipData.earnings.overtime.amount > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>Overtime Pay ({payslipData.earnings.overtime.hours} hrs)</span>
                      <span>KES {payslipData.earnings.overtime.amount.toLocaleString()}</span>
                    </div>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #e2e8f0', paddingTop: '0.5rem', fontWeight: 800, color: '#16a34a' }}>
                    <span>GROSS EARNINGS</span>
                    <span>KES {payslipData.earnings.grossPay.toLocaleString()}</span>
                  </div>
                </div>
              </div>

              {/* Deductions Table */}
              <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden' }}>
                <div style={{ backgroundColor: '#fef2f2', padding: '0.5rem 0.75rem', fontWeight: 700, fontSize: '0.85rem', color: '#991b1b', borderBottom: '1px solid #fecaca' }}>
                  STATUTORY & VOLUNTARY DEDUCTIONS
                </div>
                <div style={{ padding: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.8rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>PAYE Tax</span>
                    <span style={{ color: '#dc2626' }}>KES {payslipData.deductions.payeTax.toLocaleString()}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>NSSF Contribution</span>
                    <span style={{ color: '#dc2626' }}>KES {payslipData.deductions.totalNssf.toLocaleString()}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>SHA / NHIF Contribution</span>
                    <span style={{ color: '#dc2626' }}>KES {payslipData.deductions.sha.toLocaleString()}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Affordable Housing Levy</span>
                    <span style={{ color: '#dc2626' }}>KES {payslipData.deductions.housingLevy.toLocaleString()}</span>
                  </div>
                  {payslipData.deductions.otherDeductions?.map((od, idx) => (
                    <div key={idx} style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>{od.name}</span>
                      <span style={{ color: '#dc2626' }}>KES {od.amount.toLocaleString()}</span>
                    </div>
                  ))}
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #e2e8f0', paddingTop: '0.5rem', fontWeight: 800, color: '#dc2626' }}>
                    <span>TOTAL DEDUCTIONS</span>
                    <span>-KES {payslipData.deductions.totalDeductions.toLocaleString()}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Net Pay Highlight Banner */}
            <div
              style={{
                backgroundColor: '#0f172a',
                color: '#ffffff',
                borderRadius: '8px',
                padding: '1rem 1.25rem',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '1.25rem',
              }}
            >
              <div>
                <div style={{ fontSize: '0.75rem', color: '#94a3b8', textTransform: 'uppercase' }}>
                  Net Take-Home Pay (Authorized)
                </div>
                <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#38bdf8' }}>
                  KES {payslipData.summary.netPay.toLocaleString()}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <Badge variant="success" size="md">PAYMENT {payslipData.paymentStatus}</Badge>
                <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '0.25rem' }}>
                  Destination: {payslipData.employee.bankAccount || payslipData.employee.mpesaPhone || 'Bank EFT'}
                </div>
              </div>
            </div>

            {/* Actions Bar */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <Button variant="secondary" leftIcon={<Printer size={16} />} onClick={handlePrint}>
                Print Payslip
              </Button>
              <Button
                variant="primary"
                leftIcon={<Download size={16} />}
                onClick={() => {
                  toast.success('Downloaded', `Payslip for ${payslipData.periodName} saved.`);
                  window.print();
                }}
              >
                Download PDF
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
