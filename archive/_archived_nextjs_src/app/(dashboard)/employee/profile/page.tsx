'use client';

import React, { useState, useEffect } from 'react';
import {
  User,
  Building,
  MapPin,
  CreditCard,
  Phone,
  Mail,
  Shield,
  Edit,
  AlertCircle,
  CheckCircle2,
  Lock,
  FileText,
  Calendar,
  Send,
  HelpCircle,
} from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Spinner } from '@/components/ui/Spinner';
import { useToast } from '@/components/ui/ToastContext';

export default function EmployeeProfilePage() {
  const { toast } = useToast();
  const [profile, setProfile] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Change Request Modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [changeCategory, setChangeCategory] = useState<'CONTACT' | 'BANK' | 'MPESA'>('CONTACT');
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');

  // Proposed Fields
  const [newPhone, setNewPhone] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newAddress, setNewAddress] = useState('');
  const [newBankName, setNewBankName] = useState('');
  const [newAccountName, setNewAccountName] = useState('');
  const [newAccountNumber, setNewAccountNumber] = useState('');
  const [newMpesaPhone, setNewMpesaPhone] = useState('');

  useEffect(() => {
    fetchProfile();
  }, []);

  const fetchProfile = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/portal/profile');
      const data = await res.json();
      if (data.success) {
        setProfile(data.data);
      } else {
        toast.error('Error', data.message || 'Failed to load employee profile');
      }
    } catch (err) {
      toast.error('Error', 'Unable to load profile data');
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenChangeModal = (category: 'CONTACT' | 'BANK' | 'MPESA') => {
    setChangeCategory(category);
    setSubject(`Change Request: ${category === 'CONTACT' ? 'Contact Details' : category === 'BANK' ? 'Bank Account Details' : 'M-Pesa Number'}`);
    setDescription('');
    setNewPhone(profile?.primaryPhone || '');
    setNewEmail(profile?.email || '');
    setNewAddress(profile?.physicalAddress || '');
    setNewBankName(profile?.bankName || '');
    setNewAccountName(profile?.bankAccountName || '');
    setNewAccountNumber('');
    setNewMpesaPhone('');
    setIsModalOpen(true);
  };

  const handleSubmitChangeRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!description.trim()) {
      toast.error('Required', 'Please provide a justification reason for HR review.');
      return;
    }

    setIsSubmitting(true);
    try {
      const proposedData: Record<string, any> = {};
      if (changeCategory === 'CONTACT') {
        if (newPhone) proposedData.primaryPhone = newPhone;
        if (newEmail) proposedData.email = newEmail;
        if (newAddress) proposedData.physicalAddress = newAddress;
      } else if (changeCategory === 'BANK') {
        if (newBankName) proposedData.bankName = newBankName;
        if (newAccountName) proposedData.bankAccountName = newAccountName;
        if (newAccountNumber) proposedData.bankAccountNumber = newAccountNumber;
        proposedData.preferredPaymentMethod = 'BANK';
      } else if (changeCategory === 'MPESA') {
        if (newMpesaPhone) proposedData.mpesaPhoneNumber = newMpesaPhone;
        proposedData.preferredPaymentMethod = 'MPESA';
      }

      const res = await fetch('/api/portal/profile/change-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          changeCategory,
          subject,
          description,
          proposedData,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Failed to submit change request');
      }

      toast.success('Success', data.message || 'Profile change request submitted to HR Operations');
      setIsModalOpen(false);
    } catch (err: any) {
      toast.error('Error', err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div style={{ padding: '3rem 1rem', textAlign: 'center' }}>
        <Spinner fullHeight message="Loading your personnel file..." />
      </div>
    );
  }

  if (!profile) {
    return (
      <Card>
        <div style={{ textAlign: 'center', padding: '3rem 1rem' }}>
          <AlertCircle size={36} color="#ef4444" style={{ marginBottom: '1rem' }} />
          <h3>Employee Profile Not Found</h3>
        </div>
      </Card>
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
            My Employee Profile
          </h1>
          <p style={{ fontSize: '0.85rem', color: '#64748b', marginTop: '0.25rem' }}>
            Official personnel master record on file with CorpSec HR Operations.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <Button
            variant="secondary"
            leftIcon={<Edit size={16} />}
            onClick={() => handleOpenChangeModal('CONTACT')}
          >
            Update Contact Info
          </Button>
          <Button
            variant="primary"
            leftIcon={<CreditCard size={16} />}
            onClick={() => handleOpenChangeModal('BANK')}
          >
            Update Bank / M-Pesa
          </Button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.5rem' }}>
        {/* Section 1: Personal Information */}
        <Card title="Personal Information">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #f1f5f9', paddingBottom: '0.5rem' }}>
              <span style={{ color: '#64748b', fontSize: '0.85rem' }}>Full Legal Name</span>
              <strong style={{ color: '#0f172a' }}>{profile.fullName}</strong>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #f1f5f9', paddingBottom: '0.5rem' }}>
              <span style={{ color: '#64748b', fontSize: '0.85rem' }}>Staff Employee Number</span>
              <strong style={{ color: '#0f172a', fontFamily: 'monospace' }}>{profile.employeeNumber}</strong>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #f1f5f9', paddingBottom: '0.5rem' }}>
              <span style={{ color: '#64748b', fontSize: '0.85rem' }}>National ID (Encrypted)</span>
              <strong style={{ color: '#0f172a', fontFamily: 'monospace' }}>{profile.nationalIdMasked}</strong>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #f1f5f9', paddingBottom: '0.5rem' }}>
              <span style={{ color: '#64748b', fontSize: '0.85rem' }}>Gender / Marital Status</span>
              <span style={{ color: '#0f172a' }}>{profile.gender} • {profile.maritalStatus || 'Single'}</span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #f1f5f9', paddingBottom: '0.5rem' }}>
              <span style={{ color: '#64748b', fontSize: '0.85rem' }}>Nationality</span>
              <span style={{ color: '#0f172a' }}>{profile.nationality}</span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #f1f5f9', paddingBottom: '0.5rem' }}>
              <span style={{ color: '#64748b', fontSize: '0.85rem' }}>Primary Phone</span>
              <strong style={{ color: '#0f172a' }}>{profile.primaryPhone}</strong>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #f1f5f9', paddingBottom: '0.5rem' }}>
              <span style={{ color: '#64748b', fontSize: '0.85rem' }}>Work Email</span>
              <span style={{ color: '#0f172a' }}>{profile.email || 'N/A'}</span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#64748b', fontSize: '0.85rem' }}>Physical Address</span>
              <span style={{ color: '#0f172a', textAlign: 'right', maxWidth: '60%' }}>
                {profile.physicalAddress || 'Nairobi, Kenya'}
              </span>
            </div>
          </div>
        </Card>

        {/* Section 2: Employment & Deployment */}
        <Card title="Employment & Deployment Details">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #f1f5f9', paddingBottom: '0.5rem' }}>
              <span style={{ color: '#64748b', fontSize: '0.85rem' }}>Job Title</span>
              <strong style={{ color: '#0f172a' }}>{profile.jobTitle}</strong>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #f1f5f9', paddingBottom: '0.5rem' }}>
              <span style={{ color: '#64748b', fontSize: '0.85rem' }}>Department</span>
              <span style={{ color: '#0f172a' }}>{profile.department?.name || 'Operations'}</span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #f1f5f9', paddingBottom: '0.5rem' }}>
              <span style={{ color: '#64748b', fontSize: '0.85rem' }}>Assigned Station</span>
              <span style={{ color: '#0f172a' }}>{profile.station?.name || 'HQ / Unassigned'}</span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #f1f5f9', paddingBottom: '0.5rem' }}>
              <span style={{ color: '#64748b', fontSize: '0.85rem' }}>Regional Branch</span>
              <span style={{ color: '#0f172a' }}>{profile.branch?.name || 'Nairobi Headquarters'}</span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #f1f5f9', paddingBottom: '0.5rem' }}>
              <span style={{ color: '#64748b', fontSize: '0.85rem' }}>Employment Type</span>
              <span style={{ color: '#0f172a' }}>{profile.employmentType}</span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #f1f5f9', paddingBottom: '0.5rem' }}>
              <span style={{ color: '#64748b', fontSize: '0.85rem' }}>Employment Status</span>
              <Badge variant="success" size="sm">{profile.employmentStatus}</Badge>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#64748b', fontSize: '0.85rem' }}>Date of Onboarding</span>
              <span style={{ color: '#0f172a' }}>
                {profile.employmentDate ? new Date(profile.employmentDate).toLocaleDateString() : 'N/A'}
              </span>
            </div>
          </div>
        </Card>

        {/* Section 3: Payment & Statutory Details (Masked) */}
        <Card title="Payment & Statutory Details (Protected)">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #f1f5f9', paddingBottom: '0.5rem' }}>
              <span style={{ color: '#64748b', fontSize: '0.85rem' }}>Preferred Method</span>
              <Badge variant={profile.preferredPaymentMethod === 'MPESA' ? 'success' : 'info'} size="sm">
                {profile.preferredPaymentMethod}
              </Badge>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #f1f5f9', paddingBottom: '0.5rem' }}>
              <span style={{ color: '#64748b', fontSize: '0.85rem' }}>Bank Name</span>
              <span style={{ color: '#0f172a' }}>{profile.bankName || 'N/A'}</span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #f1f5f9', paddingBottom: '0.5rem' }}>
              <span style={{ color: '#64748b', fontSize: '0.85rem' }}>Bank Account (Masked)</span>
              <strong style={{ color: '#0f172a', fontFamily: 'monospace' }}>
                {profile.bankAccountNumberMasked || 'N/A'}
              </strong>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #f1f5f9', paddingBottom: '0.5rem' }}>
              <span style={{ color: '#64748b', fontSize: '0.85rem' }}>M-Pesa Number (Masked)</span>
              <strong style={{ color: '#0f172a', fontFamily: 'monospace' }}>
                {profile.mpesaPhoneNumberMasked || 'N/A'}
              </strong>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #f1f5f9', paddingBottom: '0.5rem' }}>
              <span style={{ color: '#64748b', fontSize: '0.85rem' }}>KRA PIN</span>
              <span style={{ color: '#0f172a', fontFamily: 'monospace' }}>{profile.kraPin || 'N/A'}</span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #f1f5f9', paddingBottom: '0.5rem' }}>
              <span style={{ color: '#64748b', fontSize: '0.85rem' }}>NSSF Number</span>
              <span style={{ color: '#0f172a', fontFamily: 'monospace' }}>{profile.nssfNumber || 'N/A'}</span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#64748b', fontSize: '0.85rem' }}>SHA / NHIF Number</span>
              <span style={{ color: '#0f172a', fontFamily: 'monospace' }}>{profile.shaNumber || 'N/A'}</span>
            </div>
          </div>
        </Card>
      </div>

      {/* Profile Change Request Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={subject}
        size="lg"
      >
        <form onSubmit={handleSubmitChangeRequest} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div style={{ padding: '0.75rem', backgroundColor: '#fef3c7', borderRadius: '6px', fontSize: '0.85rem', color: '#92400e', display: 'flex', gap: '0.5rem' }}>
            <AlertCircle size={18} style={{ flexShrink: 0 }} />
            <div>
              <strong>Security Protocol:</strong> For financial safety and statutory accuracy, banking and personal record updates require HR Operations approval before becoming active.
            </div>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              type="button"
              onClick={() => handleOpenChangeModal('CONTACT')}
              style={{
                flex: 1,
                padding: '0.6rem',
                borderRadius: '6px',
                border: changeCategory === 'CONTACT' ? '2px solid #0284c7' : '1px solid #e2e8f0',
                backgroundColor: changeCategory === 'CONTACT' ? '#f0f9ff' : '#ffffff',
                fontWeight: 600,
                fontSize: '0.85rem',
                cursor: 'pointer',
              }}
            >
              Contact Info
            </button>
            <button
              type="button"
              onClick={() => handleOpenChangeModal('BANK')}
              style={{
                flex: 1,
                padding: '0.6rem',
                borderRadius: '6px',
                border: changeCategory === 'BANK' ? '2px solid #0284c7' : '1px solid #e2e8f0',
                backgroundColor: changeCategory === 'BANK' ? '#f0f9ff' : '#ffffff',
                fontWeight: 600,
                fontSize: '0.85rem',
                cursor: 'pointer',
              }}
            >
              Bank Details
            </button>
            <button
              type="button"
              onClick={() => handleOpenChangeModal('MPESA')}
              style={{
                flex: 1,
                padding: '0.6rem',
                borderRadius: '6px',
                border: changeCategory === 'MPESA' ? '2px solid #0284c7' : '1px solid #e2e8f0',
                backgroundColor: changeCategory === 'MPESA' ? '#f0f9ff' : '#ffffff',
                fontWeight: 600,
                fontSize: '0.85rem',
                cursor: 'pointer',
              }}
            >
              M-Pesa Number
            </button>
          </div>

          {changeCategory === 'CONTACT' && (
            <>
              <Input
                label="New Primary Phone Number"
                value={newPhone}
                onChange={(e) => setNewPhone(e.target.value)}
                placeholder="+254 7XX XXX XXX"
              />
              <Input
                label="New Email Address"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="name@corpsec.co.ke"
              />
              <Input
                label="New Physical Address"
                value={newAddress}
                onChange={(e) => setNewAddress(e.target.value)}
                placeholder="Estate, Town, County"
              />
            </>
          )}

          {changeCategory === 'BANK' && (
            <>
              <Input
                label="Bank Name"
                value={newBankName}
                onChange={(e) => setNewBankName(e.target.value)}
                placeholder="e.g. KCB Bank, Equity Bank, NCBA"
                required
              />
              <Input
                label="Account Holder Name"
                value={newAccountName}
                onChange={(e) => setNewAccountName(e.target.value)}
                placeholder="Must match your official national identity card"
                required
              />
              <Input
                label="New Bank Account Number"
                value={newAccountNumber}
                onChange={(e) => setNewAccountNumber(e.target.value)}
                placeholder="Enter new account number"
                required
              />
            </>
          )}

          {changeCategory === 'MPESA' && (
            <Input
              label="Registered Safaricom M-Pesa Mobile Number"
              value={newMpesaPhone}
              onChange={(e) => setNewMpesaPhone(e.target.value)}
              placeholder="07XXXXXXXX or 01XXXXXXXX"
              required
            />
          )}

          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#334155', marginBottom: '0.4rem' }}>
              Reason & Supporting Justification <span style={{ color: '#ef4444' }}>*</span>
            </label>
            <textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Explain the reason for this profile change to assist HR verification..."
              required
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
            <Button variant="secondary" onClick={() => setIsModalOpen(false)} type="button">
              Cancel
            </Button>
            <Button variant="primary" type="submit" isLoading={isSubmitting} leftIcon={<Send size={16} />}>
              Submit Request to HR
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
