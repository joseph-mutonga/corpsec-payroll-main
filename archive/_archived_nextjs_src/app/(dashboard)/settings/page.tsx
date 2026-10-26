'use client';

import React, { useState, useEffect } from 'react';
import { Breadcrumb } from '@/components/layout/Breadcrumb';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/Spinner';
import { useToast } from '@/components/ui/ToastContext';
import { Building, Save, Shield, Globe, Clock, FileText } from 'lucide-react';
import { CompanySettingsData } from '@/types';

export default function CompanySettingsPage() {
  const { success, error: toastError } = useToast();
  const [formData, setFormData] = useState<Partial<CompanySettingsData>>({
    companyName: '',
    registrationNumber: '',
    kraPin: '',
    phone: '',
    email: '',
    physicalAddress: '',
    postalAddress: '',
    website: '',
    defaultCurrency: 'KES',
    country: 'Kenya',
    timezone: 'Africa/Nairobi',
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [formErrors, setFormErrors] = useState<Record<string, string[]>>({});

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      setIsLoading(true);
      const res = await fetch('/api/settings');
      const data = await res.json();
      if (data.success && data.data) {
        setFormData(data.data);
      }
    } catch (err) {
      console.error('Failed to load company settings:', err);
      toastError('Error', 'Failed to retrieve company settings.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleInputChange = (field: string, value: string) => {
    setFormData((prev: any) => ({ ...prev, [field]: value }));
    if (formErrors[field]) {
      setFormErrors((prev) => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setFormErrors({});

    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        if (data.error?.code === 'VALIDATION_ERROR' && data.error.details) {
          setFormErrors(data.error.details);
          toastError('Validation Failed', 'Please correct the highlighted fields.');
        } else {
          toastError('Save Failed', data.error?.message || 'Could not update settings.');
        }
        setIsSaving(false);
        return;
      }

      setFormData(data.data);
      success('Settings Updated', 'Company configuration saved successfully.');
    } catch (err) {
      console.error('Error saving settings:', err);
      toastError('Save Failed', 'Network error occurred while saving.');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return <Spinner fullHeight message="Loading company settings..." />;
  }

  return (
    <div className="animate-fade-in">
      <Breadcrumb items={[{ label: 'System Settings', href: '/settings' }, { label: 'Company Profile' }]} />

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontSize: '1.375rem', fontWeight: 800, color: '#0f1c3f' }}>
            Company Settings & Configuration
          </h1>
          <p style={{ fontSize: '0.8125rem', color: '#64748b', marginTop: '0.2rem' }}>
            Central company identity, tax identifiers, and Kenyan statutory defaults.
          </p>
        </div>

        <Badge variant="gold" size="md">
          Kenyan Statutory Base
        </Badge>
      </div>

      <form onSubmit={handleSave}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', maxWidth: '1000px' }}>
          {/* Company Identity */}
          <Card title="Corporate Identity & Registration" subtitle="Legal company name and Kenya Revenue Authority details">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.25rem' }}>
              <Input
                label="Registered Company Name"
                requiredIndicator
                value={formData.companyName || ''}
                onChange={(e) => handleInputChange('companyName', e.target.value)}
                error={formErrors.companyName?.[0]}
                placeholder="CorpSec Investigations & Guarding Services"
              />

              <Input
                label="Company Registration / Incorporation No."
                value={formData.registrationNumber || ''}
                onChange={(e) => handleInputChange('registrationNumber', e.target.value)}
                error={formErrors.registrationNumber?.[0]}
                placeholder="CPR/2018/89421"
              />

              <Input
                label="KRA PIN (Kenya Revenue Authority)"
                value={formData.kraPin || ''}
                onChange={(e) => handleInputChange('kraPin', e.target.value.toUpperCase())}
                error={formErrors.kraPin?.[0]}
                helperText="Format: 11 characters (e.g. P051234567Z)"
                placeholder="P051234567Z"
              />

              <Input
                label="Official Website URL"
                value={formData.website || ''}
                onChange={(e) => handleInputChange('website', e.target.value)}
                error={formErrors.website?.[0]}
                placeholder="https://www.corpsec.co.ke"
              />
            </div>
          </Card>

          {/* Contact & Physical Address */}
          <Card title="Contact & Location Information" subtitle="Headquarters physical and postal communication addresses">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.25rem' }}>
              <Input
                label="Official Email Address"
                type="email"
                value={formData.email || ''}
                onChange={(e) => handleInputChange('email', e.target.value)}
                error={formErrors.email?.[0]}
                placeholder="info@corpsec.co.ke"
              />

              <Input
                label="Official Phone Number"
                value={formData.phone || ''}
                onChange={(e) => handleInputChange('phone', e.target.value)}
                error={formErrors.phone?.[0]}
                placeholder="+254 700 000 000"
              />

              <Input
                label="Physical Address (Headquarters)"
                value={formData.physicalAddress || ''}
                onChange={(e) => handleInputChange('physicalAddress', e.target.value)}
                error={formErrors.physicalAddress?.[0]}
                placeholder="CorpSec Plaza, Upper Hill, Nairobi"
              />

              <Input
                label="Postal Address"
                value={formData.postalAddress || ''}
                onChange={(e) => handleInputChange('postalAddress', e.target.value)}
                error={formErrors.postalAddress?.[0]}
                placeholder="P.O. Box 45678 - 00100, Nairobi, Kenya"
              />
            </div>
          </Card>

          {/* Regional & Financial Defaults */}
          <Card title="Regional & Payroll Localization Defaults" subtitle="Core system currency, country, and timezone settings">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.25rem' }}>
              <Select
                label="Country of Operation"
                value={formData.country || 'Kenya'}
                onChange={(e) => handleInputChange('country', e.target.value)}
                options={[
                  { value: 'Kenya', label: 'Kenya' },
                ]}
                disabled
                helperText="Fixed to Kenya for statutory compliance"
              />

              <Select
                label="Default System Currency"
                value={formData.defaultCurrency || 'KES'}
                onChange={(e) => handleInputChange('defaultCurrency', e.target.value)}
                options={[
                  { value: 'KES', label: 'Kenyan Shilling (KES / KSh)' },
                ]}
                disabled
              />

              <Select
                label="System Timezone"
                value={formData.timezone || 'Africa/Nairobi'}
                onChange={(e) => handleInputChange('timezone', e.target.value)}
                options={[
                  { value: 'Africa/Nairobi', label: 'Africa/Nairobi (EAT, UTC+3)' },
                ]}
                disabled
              />
            </div>

            <div
              style={{
                marginTop: '1.25rem',
                padding: '1rem',
                backgroundColor: '#f8fafc',
                borderRadius: '8px',
                border: '1px solid #e2e8f0',
                fontSize: '0.8125rem',
                color: '#475569',
              }}
            >
              <div style={{ fontWeight: 600, color: '#0f1c3f', marginBottom: '0.25rem' }}>
                Payroll Statutory Regime Placeholder:
              </div>
              <div>
                Kenya PAYE, NSSF Act 2013 tiers, SHA / SHIF contributions, and Housing Levy rules will be dynamically configured in <strong>Phase 6 (Payroll Configuration)</strong> without hardcoded assumptions.
              </div>
            </div>
          </Card>

          {/* Action Footer */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
            <Button
              type="submit"
              variant="primary"
              size="md"
              isLoading={isSaving}
              leftIcon={<Save size={16} />}
            >
              Save Company Settings
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}
