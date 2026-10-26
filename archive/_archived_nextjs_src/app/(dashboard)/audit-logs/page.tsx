'use client';

import React, { useState, useEffect } from 'react';
import { Breadcrumb } from '@/components/layout/Breadcrumb';
import { Card } from '@/components/ui/Card';
import { Table, Column } from '@/components/ui/Table';
import { Pagination } from '@/components/ui/Pagination';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { Spinner } from '@/components/ui/Spinner';
import { useToast } from '@/components/ui/ToastContext';
import { ShieldAlert, Search, Eye, Filter, RefreshCw, Terminal } from 'lucide-react';
import { AuditLogData } from '@/types';

export default function AuditLogsPage() {
  const { error: toastError } = useToast();

  const [logs, setLogs] = useState<AuditLogData[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(15);
  const [isLoading, setIsLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState('');
  const [moduleFilter, setModuleFilter] = useState('ALL');
  const [actionFilter, setActionFilter] = useState('ALL');

  // Inspect Modal State
  const [selectedLog, setSelectedLog] = useState<AuditLogData | null>(null);

  useEffect(() => {
    fetchLogs();
  }, [page, moduleFilter, actionFilter]);

  const fetchLogs = async () => {
    try {
      setIsLoading(true);
      const params = new URLSearchParams({
        page: page.toString(),
        pageSize: pageSize.toString(),
      });

      if (moduleFilter !== 'ALL') params.set('module', moduleFilter);
      if (actionFilter !== 'ALL') params.set('action', actionFilter);
      if (search) params.set('search', search);

      const res = await fetch(`/api/audit-logs?${params.toString()}`);
      const data = await res.json();

      if (data.success) {
        setLogs(data.data);
        setTotal(data.meta?.total || 0);
      } else {
        toastError('Audit Access Denied', data.error?.message || 'Cannot load audit logs.');
      }
    } catch (err) {
      console.error('Fetch audit logs error:', err);
      toastError('Error', 'Failed to retrieve system audit logs.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchLogs();
  };

  const totalPages = Math.ceil(total / pageSize);

  const columns: Column<AuditLogData>[] = [
    {
      header: 'Timestamp',
      accessor: (log) => (
        <span style={{ fontSize: '0.8125rem', color: '#475569', whiteSpace: 'nowrap' }}>
          {new Date(log.createdAt).toLocaleDateString()} {new Date(log.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
        </span>
      ),
    },
    {
      header: 'Module',
      accessor: (log) => (
        <Badge variant="neutral" size="sm">
          {log.module}
        </Badge>
      ),
    },
    {
      header: 'Action Performed',
      accessor: (log) => (
        <div>
          <span style={{ fontWeight: 600, color: '#0f172a' }}>{log.action}</span>
          {log.entityType && (
            <div style={{ fontSize: '0.6875rem', color: '#64748b' }}>
              Target: {log.entityType} {log.entityId ? `(${log.entityId})` : ''}
            </div>
          )}
        </div>
      ),
    },
    {
      header: 'User / Performed By',
      accessor: (log) => (
        <span style={{ fontSize: '0.8125rem', color: '#334155', fontWeight: 500 }}>
          {log.userEmail || 'System / Automated'}
        </span>
      ),
    },
    {
      header: 'Client Telemetry',
      accessor: (log) => (
        <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
          <div>IP: {log.ipAddress || '127.0.0.1'}</div>
        </div>
      ),
    },
    {
      header: 'Details',
      align: 'right',
      accessor: (log) => (
        <Button
          variant="outline"
          size="sm"
          onClick={() => setSelectedLog(log)}
          leftIcon={<Eye size={13} />}
        >
          Inspect
        </Button>
      ),
    },
  ];

  return (
    <div className="animate-fade-in">
      <Breadcrumb items={[{ label: 'System & Security', href: '/users' }, { label: 'Audit Logs' }]} />

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '1.5rem',
          flexWrap: 'wrap',
          gap: '1rem',
        }}
      >
        <div>
          <h1 style={{ fontSize: '1.375rem', fontWeight: 800, color: '#0f1c3f' }}>
            System Audit Trail & Security Logs
          </h1>
          <p style={{ fontSize: '0.8125rem', color: '#64748b', marginTop: '0.2rem' }}>
            Immutable, sanitized record of administrative events, user authentication, and entity modifications.
          </p>
        </div>

        <Button variant="outline" size="sm" onClick={fetchLogs} leftIcon={<RefreshCw size={14} />}>
          Refresh Trail
        </Button>
      </div>

      <Card noPadding>
        {/* Filters Header */}
        <form
          onSubmit={handleSearchSubmit}
          style={{
            padding: '1rem 1.25rem',
            borderBottom: '1px solid #f1f5f9',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '1rem',
          }}
        >
          <div style={{ display: 'flex', gap: '0.5rem', flex: 1, maxWidth: '380px' }}>
            <Input
              placeholder="Search user, action, or entity..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              leftIcon={<Search size={15} />}
            />
            <Button type="submit" variant="secondary" size="md">
              Filter
            </Button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <select
              value={moduleFilter}
              onChange={(e) => {
                setModuleFilter(e.target.value);
                setPage(1);
              }}
              style={{
                padding: '0.45rem 0.75rem',
                borderRadius: '6px',
                border: '1px solid #cbd5e1',
                fontSize: '0.8125rem',
                color: '#0f172a',
                outline: 'none',
              }}
            >
              <option value="ALL">All Modules</option>
              <option value="AUTH">AUTH</option>
              <option value="USERS">USERS</option>
              <option value="SETTINGS">SETTINGS</option>
              <option value="ORGANIZATION">ORGANIZATION</option>
              <option value="SYSTEM">SYSTEM</option>
            </select>
          </div>
        </form>

        <Table
          columns={columns}
          data={logs}
          keyExtractor={(l) => l.id}
          isLoading={isLoading}
          emptyText="No audit records matched your filter criteria."
        />

        <div style={{ padding: '0 1.25rem' }}>
          <Pagination
            currentPage={page}
            totalPages={totalPages}
            onPageChange={setPage}
            totalItems={total}
            pageSize={pageSize}
          />
        </div>
      </Card>

      {/* Inspect Audit Log Payload Modal */}
      <Modal
        isOpen={selectedLog !== null}
        onClose={() => setSelectedLog(null)}
        title="Audit Log Entry Inspection"
        subtitle={`Action: ${selectedLog?.action} | Module: ${selectedLog?.module}`}
        maxWidth="640px"
      >
        {selectedLog && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                gap: '0.75rem',
                backgroundColor: '#f8fafc',
                padding: '1rem',
                borderRadius: '8px',
                border: '1px solid #e2e8f0',
                fontSize: '0.8125rem',
              }}
            >
              <div>
                <span style={{ color: '#64748b', display: 'block' }}>User:</span>
                <strong>{selectedLog.userEmail || 'System'}</strong>
              </div>
              <div>
                <span style={{ color: '#64748b', display: 'block' }}>IP Address:</span>
                <strong>{selectedLog.ipAddress || '127.0.0.1'}</strong>
              </div>
              <div>
                <span style={{ color: '#64748b', display: 'block' }}>Entity Target:</span>
                <strong>
                  {selectedLog.entityType || '—'} {selectedLog.entityId ? `(#${selectedLog.entityId})` : ''}
                </strong>
              </div>
              <div>
                <span style={{ color: '#64748b', display: 'block' }}>Recorded At:</span>
                <strong>{new Date(selectedLog.createdAt).toLocaleString()}</strong>
              </div>
            </div>

            {selectedLog.userAgent && (
              <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                <span style={{ fontWeight: 600 }}>User Agent:</span> {selectedLog.userAgent}
              </div>
            )}

            {/* Previous Value */}
            {selectedLog.previousValue && (
              <div>
                <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#991b1b', display: 'block', marginBottom: '0.25rem' }}>
                  Previous State (Sanitized):
                </span>
                <pre
                  style={{
                    backgroundColor: '#0a1128',
                    color: '#f87171',
                    padding: '0.875rem',
                    borderRadius: '8px',
                    fontSize: '0.75rem',
                    fontFamily: 'var(--font-mono)',
                    overflowX: 'auto',
                    maxHeight: '200px',
                  }}
                >
                  {JSON.stringify(JSON.parse(selectedLog.previousValue), null, 2)}
                </pre>
              </div>
            )}

            {/* New Value */}
            {selectedLog.newValue && (
              <div>
                <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#065f46', display: 'block', marginBottom: '0.25rem' }}>
                  New / Updated State (Sanitized):
                </span>
                <pre
                  style={{
                    backgroundColor: '#0a1128',
                    color: '#4ade80',
                    padding: '0.875rem',
                    borderRadius: '8px',
                    fontSize: '0.75rem',
                    fontFamily: 'var(--font-mono)',
                    overflowX: 'auto',
                    maxHeight: '200px',
                  }}
                >
                  {JSON.stringify(JSON.parse(selectedLog.newValue), null, 2)}
                </pre>
              </div>
            )}

            {!selectedLog.previousValue && !selectedLog.newValue && (
              <div style={{ padding: '1rem', textAlign: 'center', color: '#64748b', fontSize: '0.8125rem' }}>
                No payload state recorded for this event.
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
