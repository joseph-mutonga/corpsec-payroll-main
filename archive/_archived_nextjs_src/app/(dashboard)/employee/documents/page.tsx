'use client';

import React, { useState, useEffect } from 'react';
import {
  FileCheck,
  Download,
  Eye,
  Plus,
  Send,
  FileText,
  ShieldCheck,
  AlertCircle,
  Building,
  Calendar,
  Lock,
} from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Spinner } from '@/components/ui/Spinner';
import { useToast } from '@/components/ui/ToastContext';

export default function EmployeeDocumentsPage() {
  const { toast } = useToast();
  const [documents, setDocuments] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Letter Request Modal
  const [isLetterModalOpen, setIsLetterModalOpen] = useState(false);
  const [isSubmittingLetter, setIsSubmittingLetter] = useState(false);
  const [letterType, setLetterType] = useState('PROOF_OF_EMPLOYMENT');
  const [purpose, setPurpose] = useState('');
  const [addressedTo, setAddressedTo] = useState('To Whom It May Concern');
  const [additionalNotes, setAdditionalNotes] = useState('');

  useEffect(() => {
    fetchDocuments();
  }, []);

  const fetchDocuments = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/portal/documents');
      const data = await res.json();
      if (data.success) {
        setDocuments(data.data || []);
      } else {
        toast.error('Error', data.message || 'Failed to load employee documents');
      }
    } catch (err) {
      toast.error('Error', 'Unable to connect to documents vault');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRequestLetter = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!purpose.trim()) {
      toast.error('Required', 'Please explain the purpose of this letter request.');
      return;
    }

    setIsSubmittingLetter(true);
    try {
      const res = await fetch('/api/portal/letters/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          letterType,
          purpose,
          addressedTo,
          additionalNotes,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Failed to submit letter request');
      }

      toast.success('Requested', data.message || 'Employment letter requested from HR Operations');
      setIsLetterModalOpen(false);
      setPurpose('');
      setAdditionalNotes('');
    } catch (err: any) {
      toast.error('Error', err.message);
    } finally {
      setIsSubmittingLetter(false);
    }
  };

  if (isLoading) {
    return (
      <div style={{ padding: '3rem 1rem', textAlign: 'center' }}>
        <Spinner fullHeight message="Loading your personnel compliance documents vault..." />
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
            Personnel Documents & HR Letters
          </h1>
          <p style={{ fontSize: '0.85rem', color: '#64748b', marginTop: '0.25rem' }}>
            Verified employment contracts, certificates on file, and official corporate letters.
          </p>
        </div>

        <Button
          variant="primary"
          leftIcon={<Plus size={16} />}
          onClick={() => setIsLetterModalOpen(true)}
        >
          Request Official HR Letter
        </Button>
      </div>

      {/* Document Vault List */}
      <Card title="My Verified Employment Documents">
        {documents.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '2.5rem 1rem', color: '#64748b' }}>
            <FileCheck size={40} color="#94a3b8" style={{ marginBottom: '0.75rem' }} />
            <h4 style={{ margin: 0, color: '#0f172a' }}>No Documents Uploaded Yet</h4>
            <p style={{ fontSize: '0.8rem', marginTop: '0.25rem' }}>
              Your contract and verified ID scans will be archived here by HR Compliance.
            </p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #e2e8f0', textAlign: 'left', backgroundColor: '#f8fafc' }}>
                  <th style={{ padding: '0.75rem 1rem', color: '#475569', fontWeight: 700 }}>Document Name</th>
                  <th style={{ padding: '0.75rem 1rem', color: '#475569', fontWeight: 700 }}>Type</th>
                  <th style={{ padding: '0.75rem 1rem', color: '#475569', fontWeight: 700 }}>Size</th>
                  <th style={{ padding: '0.75rem 1rem', color: '#475569', fontWeight: 700 }}>Archived Date</th>
                  <th style={{ padding: '0.75rem 1rem', color: '#475569', fontWeight: 700, textAlign: 'center' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {documents.map((doc) => (
                  <tr key={doc.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '0.75rem 1rem' }}>
                      <strong style={{ color: '#0f172a' }}>{doc.fileName}</strong>
                      {doc.description && (
                        <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{doc.description}</div>
                      )}
                    </td>
                    <td style={{ padding: '0.75rem 1rem' }}>
                      <Badge variant="neutral" size="sm">
                        {doc.documentType.replace(/_/g, ' ')}
                      </Badge>
                    </td>
                    <td style={{ padding: '0.75rem 1rem', color: '#64748b' }}>
                      {Math.round(doc.fileSize / 1024)} KB
                    </td>
                    <td style={{ padding: '0.75rem 1rem', color: '#64748b' }}>
                      {new Date(doc.createdAt).toLocaleDateString()}
                    </td>
                    <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>
                      <Button
                        variant="secondary"
                        size="sm"
                        leftIcon={<Download size={14} />}
                        onClick={() => toast.success('Document Vault', `Downloading ${doc.fileName}...`)}
                      >
                        Download
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Official HR Letter Request Modal */}
      <Modal
        isOpen={isLetterModalOpen}
        onClose={() => setIsLetterModalOpen(false)}
        title="Request Official HR Employment Letter"
        size="md"
      >
        <form onSubmit={handleRequestLetter} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div style={{ padding: '0.75rem', backgroundColor: '#f0fdf4', borderRadius: '6px', fontSize: '0.85rem', color: '#166534', display: 'flex', gap: '0.5rem' }}>
            <ShieldCheck size={18} style={{ flexShrink: 0 }} />
            <div>
              <strong>Corporate Authentication:</strong> Official letters are generated on CorpSec letterhead and signed by the HR Director / Managing Director.
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#334155', marginBottom: '0.4rem' }}>
              Select Letter Type <span style={{ color: '#ef4444' }}>*</span>
            </label>
            <select
              value={letterType}
              onChange={(e) => setLetterType(e.target.value)}
              required
              style={{
                width: '100%',
                padding: '0.65rem',
                borderRadius: '6px',
                border: '1px solid #cbd5e1',
                fontSize: '0.85rem',
                outline: 'none',
              }}
            >
              <option value="PROOF_OF_EMPLOYMENT">Proof of Employment Letter</option>
              <option value="BANK_INTRODUCTION">Bank Account Opening / Loan Introduction Letter</option>
              <option value="EMBASSY_VISA">Embassy / Visa Travel Clearance Letter</option>
              <option value="SALARY_CONFIRMATION">Salary Confirmation & Net Earnings Statement</option>
              <option value="OTHER">General Recommendation / Service Letter</option>
            </select>
          </div>

          <Input
            label="Addressed To (Recipient Organization)"
            value={addressedTo}
            onChange={(e) => setAddressedTo(e.target.value)}
            placeholder="e.g. The Embassy of France, Nairobi / KCB Bank Branch Manager"
            required
          />

          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#334155', marginBottom: '0.4rem' }}>
              Purpose of Request <span style={{ color: '#ef4444' }}>*</span>
            </label>
            <Input
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
              placeholder="e.g. Visa application for vacation, SACCO loan processing, Bank account"
              required
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#334155', marginBottom: '0.4rem' }}>
              Additional Specifications (Optional)
            </label>
            <textarea
              rows={2}
              value={additionalNotes}
              onChange={(e) => setAdditionalNotes(e.target.value)}
              placeholder="Any specific salary mentions or dates required in the text..."
              style={{
                width: '100%',
                padding: '0.65rem',
                borderRadius: '6px',
                border: '1px solid #cbd5e1',
                fontSize: '0.85rem',
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
            <Button variant="secondary" onClick={() => setIsLetterModalOpen(false)} type="button">
              Cancel
            </Button>
            <Button variant="primary" type="submit" isLoading={isSubmittingLetter} leftIcon={<Send size={16} />}>
              Submit Order to HR
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
