'use client';

import React, { useState } from 'react';
import { Breadcrumb } from '@/components/layout/Breadcrumb';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { Input } from '@/components/ui/Input';
import { Spinner } from '@/components/ui/Spinner';
import { useToast } from '@/components/ui/ToastContext';
import { Download, FileSpreadsheet, FileText, Search } from 'lucide-react';

export default function LeaveReportsPage() {
  const { toastError } = useToast() as any;
  const [reportType, setReportType] = useState('LEAVE_REGISTER');
  const [year, setYear] = useState(new Date().getFullYear());
  const [previewData, setPreviewData] = useState<any[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleFetchPreview = async () => {
    try {
      setIsLoading(true);
      const res = await fetch(`/api/leave/reports?type=${reportType}&format=json&year=${year}`);
      const json = await res.json();
      if (json.success) {
        setPreviewData(json.data.report);
      }
    } catch (err) {
      console.error('Failed to preview report', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDownloadCsv = () => {
    window.location.href = `/api/leave/reports?type=${reportType}&format=csv&year=${year}`;
  };

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Header */}
      <div>
        <Breadcrumb
          items={[
            { label: 'Leave Management', href: '/leave' },
            { label: 'Leave & Absence Reports' },
          ]}
        />
        <h1 style={{ fontSize: '1.75rem', fontWeight: 800, color: '#0f172a', marginTop: '0.25rem' }}>
          Leave &amp; Absence Reports
        </h1>
        <p style={{ fontSize: '0.875rem', color: '#64748b' }}>
          Generate statutory leave registers, employee balance sheets, and CSV exports for external compliance audits
        </p>
      </div>

      {/* Control Configuration Card */}
      <Card>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div style={{ width: '280px' }}>
            <Select
              label="Select Report Type"
              value={reportType}
              onChange={(e) => setReportType(e.target.value)}
              options={[
                { value: 'LEAVE_REGISTER', label: '1. Official Leave Register' },
                { value: 'LEAVE_BALANCES', label: '2. Leave Balances & Accruals' },
                { value: 'ABSENCE_REPORT', label: '3. Incident & Absence Log' },
              ]}
            />
          </div>

          <div style={{ width: '140px' }}>
            <Input
              label="Leave Year"
              type="number"
              value={year}
              onChange={(e) => setYear(parseInt(e.target.value, 10) || new Date().getFullYear())}
            />
          </div>

          <Button variant="outline" onClick={handleFetchPreview} disabled={isLoading}>
            <Search size={16} style={{ marginRight: '0.5rem' }} /> Preview Report
          </Button>

          <Button variant="primary" onClick={handleDownloadCsv}>
            <Download size={16} style={{ marginRight: '0.5rem' }} /> Download CSV
          </Button>
        </div>
      </Card>

      {/* Preview Card */}
      <Card title="Report Data Preview">
        {isLoading ? (
          <div style={{ padding: '3rem', display: 'flex', justifyContent: 'center' }}>
            <Spinner size="lg" />
          </div>
        ) : !previewData ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: '#94a3b8' }}>
            Click &quot;Preview Report&quot; or &quot;Download CSV&quot; to inspect the generated dataset.
          </div>
        ) : previewData.length === 0 ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: '#94a3b8' }}>
            No records found for the selected parameters.
          </div>
        ) : (
          <div style={{ overflowX: 'auto', maxHeight: '500px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem' }}>
              <thead>
                <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0', textAlign: 'left', color: '#475569' }}>
                  {Object.keys(previewData[0])
                    .filter((k) => typeof previewData[0][k] !== 'object')
                    .map((key) => (
                      <th key={key} style={{ padding: '0.625rem 0.75rem', fontWeight: 700, textTransform: 'capitalize' }}>
                        {key.replace(/([A-Z])/g, ' $1')}
                      </th>
                    ))}
                </tr>
              </thead>
              <tbody>
                {previewData.slice(0, 50).map((row, idx) => (
                  <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    {Object.keys(row)
                      .filter((k) => typeof row[k] !== 'object')
                      .map((key) => (
                        <td key={key} style={{ padding: '0.625rem 0.75rem', color: '#334155' }}>
                          {String(row[key] ?? '—')}
                        </td>
                      ))}
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
