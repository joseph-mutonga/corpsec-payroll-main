'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Breadcrumb } from '@/components/layout/Breadcrumb';
import { Card } from '@/components/ui/Card';
import { Table, Column } from '@/components/ui/Table';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/Spinner';
import { useToast } from '@/components/ui/ToastContext';
import { FileText, Search, Download, FileCheck, Eye, RefreshCw } from 'lucide-react';
import { EmployeeDocumentData } from '@/types';

export default function GlobalDocumentsPage() {
  const { error: toastError } = useToast();

  const [documents, setDocuments] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('ALL');

  useEffect(() => {
    fetchDocuments();
  }, [typeFilter]);

  const fetchDocuments = async () => {
    try {
      setIsLoading(true);
      const params = new URLSearchParams();
      if (typeFilter !== 'ALL') params.set('documentType', typeFilter);
      if (search) params.set('search', search);

      const res = await fetch(`/api/documents?${params.toString()}`);
      const data = await res.json();

      if (data.success) {
        setDocuments(data.data);
      } else {
        toastError('Access Denied', data.error?.message || 'Cannot load documents repository.');
      }
    } catch (err) {
      console.error('Fetch documents error:', err);
      toastError('Error', 'Failed to retrieve HR document repository.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchDocuments();
  };

  const columns: Column<any>[] = [
    {
      header: 'File Name / Category',
      accessor: (doc) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '8px',
              backgroundColor: '#f1f5f9',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#0f1c3f',
            }}
          >
            <FileCheck size={18} />
          </div>
          <div>
            <div style={{ fontWeight: 600, color: '#0f172a' }}>{doc.fileName}</div>
            <Badge variant="gold" size="sm">
              {doc.documentType}
            </Badge>
          </div>
        </div>
      ),
    },
    {
      header: 'Associated Employee',
      accessor: (doc) => (
        <div>
          <Link
            href={`/hr/employees/${doc.employee?.id}`}
            style={{ fontWeight: 600, color: '#0f172a', textDecoration: 'none' }}
          >
            {doc.employee?.fullName}
          </Link>
          <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
            {doc.employee?.employeeNumber} &bull; {doc.employee?.jobTitle}
          </div>
        </div>
      ),
    },
    {
      header: 'File Size',
      accessor: (doc) => (
        <span style={{ fontSize: '0.8125rem', color: '#64748b' }}>
          {(doc.fileSize / 1024).toFixed(1)} KB
        </span>
      ),
    },
    {
      header: 'Uploaded On',
      accessor: (doc) => (
        <div style={{ fontSize: '0.75rem', color: '#475569' }}>
          <div>{new Date(doc.createdAt).toLocaleDateString()}</div>
          <div style={{ color: '#94a3b8' }}>By: {doc.uploadedBy?.firstName || 'HR Admin'}</div>
        </div>
      ),
    },
    {
      header: 'Action',
      align: 'right',
      accessor: (doc) => (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '0.375rem' }}>
          <a
            href={`/api/employees/${doc.employeeId}/documents/${doc.id}/download`}
            target="_blank"
            rel="noopener noreferrer"
            style={{ textDecoration: 'none' }}
          >
            <Button variant="outline" size="sm" leftIcon={<Download size={13} />}>
              Download
            </Button>
          </a>
        </div>
      ),
    },
  ];

  return (
    <div className="animate-fade-in">
      <Breadcrumb items={[{ label: 'HR Management', href: '/hr' }, { label: 'Document Repository' }]} />

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
            HR Document & Compliance Repository
          </h1>
          <p style={{ fontSize: '0.8125rem', color: '#64748b', marginTop: '0.2rem' }}>
            Secure repository for employee national ID copies, signed contracts, certificates, and tax records.
          </p>
        </div>

        <Button variant="outline" size="sm" onClick={fetchDocuments} leftIcon={<RefreshCw size={14} />}>
          Refresh Vault
        </Button>
      </div>

      <Card noPadding>
        {/* Search and Filters */}
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
          <div style={{ display: 'flex', gap: '0.5rem', maxWidth: '380px', flex: 1 }}>
            <Input
              placeholder="Search by file name or employee name..."
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
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              style={{
                padding: '0.45rem 0.75rem',
                borderRadius: '6px',
                border: '1px solid #cbd5e1',
                fontSize: '0.8125rem',
                color: '#0f172a',
                outline: 'none',
              }}
            >
              <option value="ALL">All Categories</option>
              <option value="NATIONAL_ID">National ID / Passport</option>
              <option value="KRA_PIN_CERT">KRA PIN Certificate</option>
              <option value="EMPLOYMENT_CONTRACT">Employment Contracts</option>
              <option value="POLICE_CLEARANCE">Police Clearance</option>
              <option value="ACADEMIC_CERT">Academic Certificates</option>
              <option value="NSSF_SHA_PROOF">NSSF / SHA Proof</option>
              <option value="OTHER">Other Documents</option>
            </select>
          </div>
        </form>

        <Table
          columns={columns}
          data={documents}
          keyExtractor={(d) => d.id}
          isLoading={isLoading}
          emptyText="No HR documents found."
        />
      </Card>
    </div>
  );
}
