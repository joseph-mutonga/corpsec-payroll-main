'use client';

import React, { useEffect, useState } from 'react';
import { Breadcrumb } from '@/components/layout/Breadcrumb';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Spinner } from '@/components/ui/Spinner';
import { useToast } from '@/components/ui/ToastContext';
import {
  ShieldCheck,
  Edit2,
  Lock,
  Plus,
  AlertTriangle,
  Info,
  CheckCircle2,
  ExternalLink,
  Layers,
} from 'lucide-react';
import { StatutoryRuleData } from '@/types';

export default function StatutoryRulesPage() {
  const { toast } = useToast();
  const [rules, setRules] = useState<StatutoryRuleData[]>([]);
  const [loading, setLoading] = useState(true);

  // Edit Rule Modal
  const [editingRule, setEditingRule] = useState<StatutoryRuleData | null>(null);
  const [ruleForm, setRuleForm] = useState({
    name: '',
    description: '',
    employeeRate: '',
    employerRate: '',
    minThreshold: '',
    maxThreshold: '',
    capAmount: '',
    status: 'ACTIVE',
  });
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    fetchStatutoryRules();
  }, []);

  const fetchStatutoryRules = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/payroll/statutory/rules');
      const data = await res.json();
      if (data.success) {
        setRules(data.data || []);
      }
    } catch (err) {
      console.error('Error fetching statutory rules:', err);
    } finally {
      setLoading(false);
    }
  };

  const openEditModal = (rule: StatutoryRuleData) => {
    setEditingRule(rule);
    setRuleForm({
      name: rule.name,
      description: rule.description || '',
      employeeRate: rule.employeeRate !== null && rule.employeeRate !== undefined ? String(rule.employeeRate) : '',
      employerRate: rule.employerRate !== null && rule.employerRate !== undefined ? String(rule.employerRate) : '',
      minThreshold: rule.minThreshold !== null && rule.minThreshold !== undefined ? String(rule.minThreshold) : '',
      maxThreshold: rule.maxThreshold !== null && rule.maxThreshold !== undefined ? String(rule.maxThreshold) : '',
      capAmount: rule.capAmount !== null && rule.capAmount !== undefined ? String(rule.capAmount) : '',
      status: rule.status,
    });
  };

  const handleSaveRule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRule) return;

    try {
      setIsSaving(true);
      const res = await fetch(`/api/payroll/statutory/rules/${editingRule.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...ruleForm,
          employeeRate: ruleForm.employeeRate ? parseFloat(ruleForm.employeeRate) : null,
          employerRate: ruleForm.employerRate ? parseFloat(ruleForm.employerRate) : null,
          minThreshold: ruleForm.minThreshold ? parseFloat(ruleForm.minThreshold) : 0,
          maxThreshold: ruleForm.maxThreshold ? parseFloat(ruleForm.maxThreshold) : null,
          capAmount: ruleForm.capAmount ? parseFloat(ruleForm.capAmount) : null,
        }),
      });
      const data = await res.json();
      if (data.success) {
        toast({ title: 'Success', message: 'Statutory rule updated successfully', type: 'success' });
        setEditingRule(null);
        fetchStatutoryRules();
      } else {
        toast({ title: 'Error', message: data.error?.message || 'Failed to update rule', type: 'error' });
      }
    } catch (err) {
      toast({ title: 'Error', message: 'An unexpected error occurred', type: 'error' });
    } finally {
      setIsSaving(false);
    }
  };

  const payeRule = rules.find((r) => r.regimeType === 'PAYE');
  const otherRules = rules.filter((r) => r.regimeType !== 'PAYE');

  return (
    <div className="animate-fade-in">
      <Breadcrumb
        items={[
          { label: 'Payroll Management', href: '/payroll' },
          { label: 'Statutory Rules & Tax Bands' },
        ]}
      />

      {/* Header Banner */}
      <div
        style={{
          backgroundColor: '#ffffff',
          border: '1px solid #e2e8f0',
          borderRadius: '12px',
          padding: '1.5rem 1.75rem',
          marginBottom: '1.5rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '1rem',
          boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.05)',
        }}
      >
        <div>
          <h1 style={{ fontSize: '1.375rem', fontWeight: 800, color: '#0f1c3f', marginBottom: '0.25rem' }}>
            Kenyan Statutory Deductions &amp; Tax Bands
          </h1>
          <p style={{ fontSize: '0.8125rem', color: '#64748b' }}>
            Configurable statutory parameters: Versioned PAYE progressive brackets, NSSF Pension Act 2013 Tiers, Social Health Authority (SHA), and Affordable Housing Levy.
          </p>
        </div>

        <Badge variant="gold" size="sm">
          Kenya Statutory Compliant (2026)
        </Badge>
      </div>

      {loading ? (
        <div style={{ padding: '3rem', textAlign: 'center' }}>
          <Spinner message="Loading statutory regimes and tax bands..." />
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* Section 1: Progressive PAYE Tax Bands */}
          <Card
            title="PAYE Individual Income Tax — Progressive Brackets (Kenya 2026)"
            subtitle="Configurable tax tiers with individual monthly personal relief of KES 2,400 (KES 28,800 annually)"
            action={
              payeRule && (
                <Button variant="outline" size="sm" onClick={() => openEditModal(payeRule)} leftIcon={<Edit2 size={13} />}>
                  Configure Rule
                </Button>
              )
            }
          >
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem', textAlign: 'left' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #e2e8f0', color: '#64748b', backgroundColor: '#f8fafc' }}>
                    <th style={{ padding: '0.75rem 1rem' }}>Bracket Order</th>
                    <th style={{ padding: '0.75rem 1rem' }}>Bracket Range</th>
                    <th style={{ padding: '0.75rem 1rem' }}>Taxable Lower Limit</th>
                    <th style={{ padding: '0.75rem 1rem' }}>Taxable Upper Limit</th>
                    <th style={{ padding: '0.75rem 1rem' }}>Tax Rate (%)</th>
                    <th style={{ padding: '0.75rem 1rem' }}>Monthly Relief</th>
                  </tr>
                </thead>
                <tbody>
                  {payeRule?.taxBands && payeRule.taxBands.length > 0 ? (
                    payeRule.taxBands.map((b) => (
                      <tr key={b.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '0.75rem 1rem', fontWeight: 700, color: '#2563eb' }}>
                          Band {b.bandOrder}
                        </td>
                        <td style={{ padding: '0.75rem 1rem', fontWeight: 600, color: '#0f1c3f' }}>
                          {b.bandName}
                        </td>
                        <td style={{ padding: '0.75rem 1rem', color: '#475569' }}>
                          KES {b.lowerThreshold.toLocaleString()}
                        </td>
                        <td style={{ padding: '0.75rem 1rem', color: '#475569' }}>
                          {b.upperThreshold ? `KES ${b.upperThreshold.toLocaleString()}` : 'Unlimited (Excess)'}
                        </td>
                        <td style={{ padding: '0.75rem 1rem', fontWeight: 800, color: '#dc2626' }}>
                          {b.ratePercentage}%
                        </td>
                        <td style={{ padding: '0.75rem 1rem', color: '#059669', fontWeight: 600 }}>
                          KES {(b.taxReliefMonthly || 2400).toLocaleString()}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={6} style={{ padding: '1.5rem', textAlign: 'center', color: '#94a3b8' }}>
                        No progressive tax bands configured for PAYE.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Section 2: Statutory Contribution Regimes Grid (NSSF, SHA, Housing Levy) */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
              gap: '1.25rem',
            }}
          >
            {otherRules.map((rule) => (
              <Card
                key={rule.id}
                title={rule.name}
                subtitle={rule.regimeType}
                action={
                  <Button variant="ghost" size="sm" onClick={() => openEditModal(rule)} leftIcon={<Edit2 size={13} />}>
                    Edit
                  </Button>
                }
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', fontSize: '0.8125rem' }}>
                  <p style={{ color: '#64748b', margin: 0 }}>{rule.description}</p>

                  <div
                    style={{
                      padding: '0.75rem',
                      backgroundColor: '#f8fafc',
                      borderRadius: '8px',
                      border: '1px solid #e2e8f0',
                      display: 'grid',
                      gridTemplateColumns: '1fr 1fr',
                      gap: '0.5rem',
                    }}
                  >
                    <div>
                      <span style={{ fontSize: '0.6875rem', color: '#64748b', display: 'block' }}>Calculation Type:</span>
                      <strong style={{ color: '#0f1c3f' }}>{rule.calculationType.replace(/_/g, ' ')}</strong>
                    </div>

                    <div>
                      <span style={{ fontSize: '0.6875rem', color: '#64748b', display: 'block' }}>Status:</span>
                      <Badge variant={rule.status === 'ACTIVE' ? 'success' : 'neutral'} size="sm">
                        {rule.status}
                      </Badge>
                    </div>

                    <div>
                      <span style={{ fontSize: '0.6875rem', color: '#64748b', display: 'block' }}>Employee Rate:</span>
                      <strong style={{ color: '#dc2626' }}>
                        {rule.employeeRate !== null ? `${rule.employeeRate}%` : '---'}
                      </strong>
                    </div>

                    <div>
                      <span style={{ fontSize: '0.6875rem', color: '#64748b', display: 'block' }}>Employer Match:</span>
                      <strong style={{ color: '#2563eb' }}>
                        {rule.employerRate !== null ? `${rule.employerRate}%` : '0%'}
                      </strong>
                    </div>

                    {rule.capAmount !== null && rule.capAmount !== undefined && (
                      <div>
                        <span style={{ fontSize: '0.6875rem', color: '#64748b', display: 'block' }}>Monthly Cap:</span>
                        <strong style={{ color: '#0f172a' }}>KES {rule.capAmount.toLocaleString()}</strong>
                      </div>
                    )}

                    {rule.minThreshold !== null && rule.minThreshold !== undefined && rule.minThreshold > 0 && (
                      <div>
                        <span style={{ fontSize: '0.6875rem', color: '#64748b', display: 'block' }}>Minimum Contribution:</span>
                        <strong style={{ color: '#0f172a' }}>KES {rule.minThreshold.toLocaleString()}</strong>
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Edit Rule Modal */}
      {editingRule && (
        <Modal
          isOpen={Boolean(editingRule)}
          onClose={() => setEditingRule(null)}
          title={`Configure Statutory Rule — ${editingRule.name}`}
          size="md"
        >
          <form onSubmit={handleSaveRule} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <Input
              label="Regime Name"
              value={ruleForm.name}
              onChange={(e) => setRuleForm({ ...ruleForm, name: e.target.value })}
              required
            />

            <Input
              label="Mandate Description"
              value={ruleForm.description}
              onChange={(e) => setRuleForm({ ...ruleForm, description: e.target.value })}
            />

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <Input
                label="Employee Rate (%)"
                type="number"
                step="0.01"
                value={ruleForm.employeeRate}
                onChange={(e) => setRuleForm({ ...ruleForm, employeeRate: e.target.value })}
                placeholder="e.g. 1.5 for 1.5%"
              />
              <Input
                label="Employer Matching Rate (%)"
                type="number"
                step="0.01"
                value={ruleForm.employerRate}
                onChange={(e) => setRuleForm({ ...ruleForm, employerRate: e.target.value })}
                placeholder="e.g. 1.5 for 1.5%"
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <Input
                label="Statutory Cap / Max Deduction (KES)"
                type="number"
                value={ruleForm.capAmount}
                onChange={(e) => setRuleForm({ ...ruleForm, capAmount: e.target.value })}
                placeholder="e.g. 420 for NSSF Tier 1"
              />
              <Input
                label="Minimum Threshold (KES)"
                type="number"
                value={ruleForm.minThreshold}
                onChange={(e) => setRuleForm({ ...ruleForm, minThreshold: e.target.value })}
                placeholder="e.g. 300 for SHA"
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1rem' }}>
              <Button variant="ghost" type="button" onClick={() => setEditingRule(null)}>
                Cancel
              </Button>
              <Button variant="primary" type="submit" isLoading={isSaving}>
                Save Statutory Rule
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
