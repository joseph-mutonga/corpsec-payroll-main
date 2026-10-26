'use client';

import React, { useState } from 'react';
import { Breadcrumb } from '@/components/layout/Breadcrumb';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/Spinner';
import { useToast } from '@/components/ui/ToastContext';
import {
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  FileText,
  ArrowRight,
  RotateCcw,
  Download,
} from 'lucide-react';
import Link from 'next/link';

export default function AttendanceImportPage() {
  const { showToast } = useToast();
  const [step, setStep] = useState<'UPLOAD' | 'PREVIEW' | 'COMPLETE'>('UPLOAD');
  const [csvText, setCsvText] = useState('');
  const [previewData, setPreviewData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [importResult, setImportResult] = useState<any>(null);

  const sampleCsv = `EmployeeNumber,Date,ClockIn,ClockOut,Source
CORP-000001,2026-08-14,06:00,18:00,BIOMETRIC
CORP-000002,2026-08-14,18:00,06:00,BIOMETRIC
CORP-000003,2026-08-14,08:00,17:00,IMPORT`;

  const handlePreview = async () => {
    if (!csvText.trim()) {
      showToast({ type: 'error', title: 'Please paste or select a CSV attendance file' });
      return;
    }

    try {
      setLoading(true);
      const res = await fetch('/api/attendance/import/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csvContent: csvText }),
      });

      const json = await res.json();
      if (json.success) {
        setPreviewData(json.data);
        setStep('PREVIEW');
      } else {
        showToast({ type: 'error', title: json.error || 'Failed to preview CSV' });
      }
    } catch (err) {
      showToast({ type: 'error', title: 'Network error validating CSV' });
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      const content = evt.target?.result as string;
      setCsvText(content);
    };
    reader.readAsText(file);
  };

  const handleExecuteImport = async () => {
    if (!previewData || previewData.validCount === 0) {
      showToast({ type: 'error', title: 'No valid rows available to import' });
      return;
    }

    try {
      setLoading(true);
      const res = await fetch('/api/attendance/import/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: previewData.rows }),
      });

      const json = await res.json();
      if (json.success) {
        setImportResult(json.data);
        setStep('COMPLETE');
        showToast({
          type: 'success',
          title: `Successfully imported ${json.data.importedCount} attendance records`,
        });
      } else {
        showToast({ type: 'error', title: json.error || 'Failed to execute import' });
      }
    } catch (err) {
      showToast({ type: 'error', title: 'Network error importing attendance records' });
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setCsvText('');
    setPreviewData(null);
    setImportResult(null);
    setStep('UPLOAD');
  };

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <Breadcrumb items={[{ label: 'Attendance', href: '/attendance' }, { label: 'Attendance CSV / Biometric Import' }]} />

      {/* Header */}
      <div>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0f1c3f', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Upload size={28} color="#0f1c3f" />
          Attendance CSV / Biometric Logs Import
        </h1>
        <p style={{ fontSize: '0.875rem', color: '#64748b', margin: '0.25rem 0 0 0' }}>
          Bulk ingest guard station muster rolls, clock machine logs, and attendance files with pre-validation.
        </p>
      </div>

      {step === 'UPLOAD' && (
        <Card title="Upload Attendance CSV Data">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <div
              style={{
                border: '2px dashed #cbd5e1',
                borderRadius: '8px',
                padding: '2rem',
                textAlign: 'center',
                backgroundColor: '#f8fafc',
              }}
            >
              <FileSpreadsheet size={40} color="#64748b" style={{ margin: '0 auto 0.75rem auto' }} />
              <div style={{ fontWeight: 600, color: '#0f1c3f', marginBottom: '0.25rem' }}>
                Select a CSV file or paste formatted attendance data below
              </div>
              <div style={{ fontSize: '0.8125rem', color: '#64748b', marginBottom: '1rem' }}>
                Supported columns: EmployeeNumber, Date (YYYY-MM-DD), ClockIn (HH:mm), ClockOut (HH:mm), Source
              </div>
              <input
                type="file"
                accept=".csv,.txt"
                onChange={handleFileUpload}
                style={{ fontSize: '0.875rem' }}
              />
            </div>

            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                <label style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#334155' }}>
                  Raw CSV Text Data
                </label>
                <button
                  type="button"
                  onClick={() => setCsvText(sampleCsv)}
                  style={{ fontSize: '0.75rem', color: '#2563eb', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}
                >
                  Load Sample Template
                </button>
              </div>
              <textarea
                rows={8}
                value={csvText}
                onChange={(e) => setCsvText(e.target.value)}
                placeholder="EmployeeNumber,Date,ClockIn,ClockOut,Source&#10;CORP-000001,2026-08-14,06:00,18:00,BIOMETRIC"
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  borderRadius: '6px',
                  border: '1px solid #cbd5e1',
                  fontFamily: 'monospace',
                  fontSize: '0.8125rem',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <Button variant="primary" onClick={handlePreview} disabled={loading || !csvText.trim()}>
                {loading ? <Spinner size="sm" /> : 'Validate & Preview'}
              </Button>
            </div>
          </div>
        </Card>
      )}

      {step === 'PREVIEW' && previewData && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* Validation Summary Header */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
            <Card noPadding>
              <div style={{ padding: '1rem' }}>
                <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 700 }}>TOTAL ROWS</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0f1c3f' }}>{previewData.totalRows}</div>
              </div>
            </Card>
            <Card noPadding>
              <div style={{ padding: '1rem' }}>
                <div style={{ fontSize: '0.75rem', color: '#16a34a', fontWeight: 700 }}>VALID ROWS</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#16a34a' }}>{previewData.validCount}</div>
              </div>
            </Card>
            <Card noPadding>
              <div style={{ padding: '1rem' }}>
                <div style={{ fontSize: '0.75rem', color: '#dc2626', fontWeight: 700 }}>ERROR ROWS</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#dc2626' }}>{previewData.errorCount}</div>
              </div>
            </Card>
          </div>

          <Card title="Row-by-Row Import Validation Preview" noPadding>
            <div style={{ overflowX: 'auto', maxHeight: '400px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem' }}>
                <thead>
                  <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0', textAlign: 'left', position: 'sticky', top: 0 }}>
                    <th style={{ padding: '0.75rem 1rem' }}>#</th>
                    <th style={{ padding: '0.75rem 1rem' }}>Employee</th>
                    <th style={{ padding: '0.75rem 1rem' }}>Date</th>
                    <th style={{ padding: '0.75rem 1rem' }}>Clock In</th>
                    <th style={{ padding: '0.75rem 1rem' }}>Clock Out</th>
                    <th style={{ padding: '0.75rem 1rem' }}>Status</th>
                    <th style={{ padding: '0.75rem 1rem' }}>Validation Details</th>
                  </tr>
                </thead>
                <tbody>
                  {previewData.rows.map((r: any) => (
                    <tr key={r.rowIndex} style={{ borderBottom: '1px solid #f1f5f9', backgroundColor: r.isValid ? 'transparent' : '#fef2f2' }}>
                      <td style={{ padding: '0.75rem 1rem', color: '#64748b' }}>{r.rowIndex}</td>
                      <td style={{ padding: '0.75rem 1rem' }}>
                        <div style={{ fontWeight: 700 }}>{r.employeeNumber}</div>
                        <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{r.employeeName}</div>
                      </td>
                      <td style={{ padding: '0.75rem 1rem' }}>{r.dateStr}</td>
                      <td style={{ padding: '0.75rem 1rem' }}>{r.clockInStr || '--:--'}</td>
                      <td style={{ padding: '0.75rem 1rem' }}>{r.clockOutStr || '--:--'}</td>
                      <td style={{ padding: '0.75rem 1rem' }}>
                        {r.isValid ? <Badge variant="success">Valid</Badge> : <Badge variant="danger">Invalid</Badge>}
                      </td>
                      <td style={{ padding: '0.75rem 1rem' }}>
                        {r.isValid ? (
                          <span style={{ color: '#16a34a' }}>✓ Ready for ingestion</span>
                        ) : (
                          <span style={{ color: '#dc2626' }}>{r.errors.join('; ')}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div style={{ padding: '1rem', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Button variant="outline" onClick={handleReset}>
                <RotateCcw size={14} style={{ marginRight: '4px' }} /> Start Over
              </Button>
              <Button
                variant="primary"
                onClick={handleExecuteImport}
                disabled={loading || previewData.validCount === 0}
              >
                {loading ? <Spinner size="sm" /> : `Import ${previewData.validCount} Valid Records`}
              </Button>
            </div>
          </Card>
        </div>
      )}

      {step === 'COMPLETE' && importResult && (
        <Card noPadding>
          <div style={{ padding: '3rem', textAlign: 'center' }}>
            <div
              style={{
                width: '64px',
                height: '64px',
                borderRadius: '50%',
                backgroundColor: '#dcfce7',
                color: '#16a34a',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 1rem auto',
              }}
            >
              <CheckCircle2 size={36} />
            </div>
            <h2 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0f1c3f', margin: '0 0 0.5rem 0' }}>
              Attendance Import Completed
            </h2>
            <p style={{ color: '#64748b', maxWidth: '480px', margin: '0 auto 1.5rem auto' }}>
              Successfully ingested <strong>{importResult.importedCount}</strong> attendance records into the authoritative database and triggered shift evaluation.
            </p>

            <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem' }}>
              <Button variant="outline" onClick={handleReset}>
                Import Another Batch
              </Button>
              <Link href="/attendance/daily">
                <Button variant="primary">View Daily Attendance Board</Button>
              </Link>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
