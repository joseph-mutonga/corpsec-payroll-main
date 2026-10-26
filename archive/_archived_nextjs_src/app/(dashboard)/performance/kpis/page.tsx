'use client';

import React, { useState, useEffect } from 'react';
import {
  BarChart3,
  PlusCircle,
  Search,
  Filter,
  CheckCircle2,
  TrendingUp,
  Layers,
  Award,
  AlertCircle,
  FileCheck,
  Check,
} from 'lucide-react';

interface KpiTemplate {
  id: string;
  code: string;
  name: string;
  description?: string;
  measurementUnit: string;
  target: number;
  minThreshold?: number;
  maxThreshold?: number;
  defaultWeight: number;
  frequency: string;
  isActive: boolean;
  department?: { name: string; code: string };
  position?: { title: string };
  _count: { kpiAssignments: number; kpiMeasurements: number };
}

interface Measurement {
  id: string;
  periodName: string;
  target: number;
  actual: number;
  achievementRate: number;
  score?: number;
  comments?: string;
  verifiedAt?: string;
  kpi: { name: string; code: string; measurementUnit: string };
  employee: { id: string; fullName: string; employeeNumber: string; jobTitle: string };
  verifiedBy?: { firstName: string; lastName: string };
}

export default function KpiManagementPage() {
  const [activeTab, setActiveTab] = useState<'templates' | 'measurements'>('templates');
  const [templates, setTemplates] = useState<KpiTemplate[]>([]);
  const [measurements, setMeasurements] = useState<Measurement[]>([]);
  const [loading, setLoading] = useState(true);
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [showMeasurementModal, setShowMeasurementModal] = useState(false);

  const [departments, setDepartments] = useState<Array<{ id: string; name: string }>>([]);
  const [positions, setPositions] = useState<Array<{ id: string; title: string }>>([]);
  const [employees, setEmployees] = useState<Array<{ id: string; fullName: string; employeeNumber: string }>>([]);

  const [templateForm, setTemplateForm] = useState({
    name: '',
    description: '',
    departmentId: '',
    positionId: '',
    measurementUnit: 'PERCENTAGE',
    target: 95,
    minThreshold: 80,
    maxThreshold: 100,
    defaultWeight: 15,
    frequency: 'MONTHLY',
  });

  const [measurementForm, setMeasurementForm] = useState({
    kpiId: '',
    employeeId: '',
    periodName: '2026-Q1',
    actual: 92,
    comments: '',
  });

  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchTemplates();
    fetchMeasurements();
    fetchDependencies();
  }, []);

  const fetchTemplates = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/performance/kpis');
      const json = await res.json();
      if (json.success) setTemplates(json.data.kpis);
    } catch (e) {
      console.error('Failed to load KPIs:', e);
    } finally {
      setLoading(false);
    }
  };

  const fetchMeasurements = async () => {
    try {
      const res = await fetch('/api/performance/kpis/measurements');
      const json = await res.json();
      if (json.success) setMeasurements(json.data.measurements);
    } catch (e) {
      console.error('Failed to load measurements:', e);
    }
  };

  const fetchDependencies = async () => {
    try {
      const [deptRes, posRes, empRes] = await Promise.all([
        fetch('/api/departments'),
        fetch('/api/positions'),
        fetch('/api/employees'),
      ]);
      const deptJson = await deptRes.json();
      const posJson = await posRes.json();
      const empJson = await empRes.json();
      if (deptJson.success) setDepartments(deptJson.data.departments || deptJson.data);
      if (posJson.success) setPositions(posJson.data.positions || posJson.data);
      if (empJson.success) setEmployees(empJson.data.employees || empJson.data);
    } catch (e) {
      console.error('Failed to load dependencies:', e);
    }
  };

  const handleCreateTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const res = await fetch('/api/performance/kpis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: templateForm.name,
          description: templateForm.description,
          departmentId: templateForm.departmentId || undefined,
          positionId: templateForm.positionId || undefined,
          measurementUnit: templateForm.measurementUnit,
          target: Number(templateForm.target),
          minThreshold: Number(templateForm.minThreshold),
          maxThreshold: Number(templateForm.maxThreshold),
          defaultWeight: Number(templateForm.defaultWeight),
          frequency: templateForm.frequency,
        }),
      });

      const json = await res.json();
      if (!json.success) {
        setError(json.message || 'Failed to create KPI template.');
      } else {
        setShowTemplateModal(false);
        fetchTemplates();
      }
    } catch (e: any) {
      setError(e.message || 'Network error.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRecordMeasurement = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const res = await fetch('/api/performance/kpis/measurements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kpiId: measurementForm.kpiId,
          employeeId: measurementForm.employeeId,
          periodName: measurementForm.periodName,
          actual: Number(measurementForm.actual),
          comments: measurementForm.comments,
        }),
      });

      const json = await res.json();
      if (!json.success) {
        setError(json.message || 'Failed to record measurement.');
      } else {
        setShowMeasurementModal(false);
        fetchMeasurements();
      }
    } catch (e: any) {
      setError(e.message || 'Network error.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleVerify = async (measurementId: string) => {
    try {
      const res = await fetch(`/api/performance/kpis/measurements/${measurementId}/verify`, {
        method: 'POST',
      });
      const json = await res.json();
      if (json.success) fetchMeasurements();
    } catch (e) {
      console.error('Failed to verify measurement:', e);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-zinc-900/60 p-6 rounded-2xl border border-zinc-800/80 backdrop-blur-xl">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-amber-500/10 border border-amber-500/20 rounded-xl">
              <BarChart3 className="w-6 h-6 text-amber-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white tracking-tight">Key Performance Indicators (KPIs)</h1>
              <p className="text-sm text-zinc-400 mt-0.5">
                Departmental metrics, guard service benchmarks & verified operational results
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowMeasurementModal(true)}
            className="px-4 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-medium text-sm rounded-xl border border-zinc-700 transition"
          >
            Record Measurement
          </button>
          <button
            onClick={() => setShowTemplateModal(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-black font-semibold text-sm rounded-xl shadow-lg shadow-amber-500/20 transition"
          >
            <PlusCircle className="w-4 h-4" />
            New KPI Template
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-zinc-800 pb-1">
        <button
          onClick={() => setActiveTab('templates')}
          className={`px-4 py-2 text-sm font-semibold rounded-xl transition ${
            activeTab === 'templates'
              ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
              : 'text-zinc-400 hover:text-white'
          }`}
        >
          KPI Templates Catalog ({templates.length})
        </button>
        <button
          onClick={() => setActiveTab('measurements')}
          className={`px-4 py-2 text-sm font-semibold rounded-xl transition ${
            activeTab === 'measurements'
              ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
              : 'text-zinc-400 hover:text-white'
          }`}
        >
          Recorded Measurements ({measurements.length})
        </button>
      </div>

      {/* Content */}
      {activeTab === 'templates' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {templates.map((kpi) => (
            <div
              key={kpi.id}
              className="bg-zinc-900/60 p-5 rounded-2xl border border-zinc-800/80 hover:border-zinc-700/80 transition space-y-3"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono text-amber-400 bg-amber-950/60 border border-amber-800/60 px-2 py-0.5 rounded">
                  {kpi.code}
                </span>
                <span className="text-xs text-zinc-400 font-mono">{kpi.frequency}</span>
              </div>

              <div>
                <h3 className="text-base font-bold text-white">{kpi.name}</h3>
                {kpi.description && (
                  <p className="text-xs text-zinc-400 mt-1 line-clamp-2">{kpi.description}</p>
                )}
              </div>

              <div className="p-3 bg-black/40 rounded-xl border border-zinc-800/80 text-xs space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-zinc-400">Target Standard:</span>
                  <span className="text-emerald-400 font-bold font-mono">
                    {kpi.target} {kpi.measurementUnit === 'PERCENTAGE' ? '%' : ''}
                  </span>
                </div>
                <div className="flex items-center justify-between text-zinc-500">
                  <span>Scope:</span>
                  <span>{kpi.department?.name || kpi.position?.title || 'All Staff'}</span>
                </div>
              </div>

              <div className="flex items-center justify-between text-xs text-zinc-500 pt-1">
                <span>Default Weight: {kpi.defaultWeight}%</span>
                <span>Active Assignments: {kpi._count.kpiAssignments}</span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-zinc-900/60 rounded-2xl border border-zinc-800/80 overflow-hidden">
          <table className="w-full text-left text-sm text-zinc-300">
            <thead className="bg-zinc-950/40 text-xs font-semibold text-zinc-400 uppercase tracking-wider border-b border-zinc-800">
              <tr>
                <th className="px-6 py-3.5">KPI Metric</th>
                <th className="px-6 py-3.5">Employee</th>
                <th className="px-6 py-3.5 text-center">Period</th>
                <th className="px-6 py-3.5 text-center">Target</th>
                <th className="px-6 py-3.5 text-center">Actual</th>
                <th className="px-6 py-3.5 text-center">Achievement</th>
                <th className="px-6 py-3.5 text-center">Score</th>
                <th className="px-6 py-3.5 text-center">Verified</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/50">
              {measurements.map((m) => (
                <tr key={m.id} className="hover:bg-zinc-800/30 transition">
                  <td className="px-6 py-4 font-medium text-white">
                    <div>{m.kpi.name}</div>
                    <span className="text-xs text-zinc-500 font-mono">{m.kpi.code}</span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-zinc-200 font-medium">{m.employee.fullName}</div>
                    <div className="text-xs text-zinc-500">{m.employee.employeeNumber}</div>
                  </td>
                  <td className="px-6 py-4 text-center font-mono text-xs">{m.periodName}</td>
                  <td className="px-6 py-4 text-center font-mono">{m.target}</td>
                  <td className="px-6 py-4 text-center font-mono font-bold text-white">{m.actual}</td>
                  <td className="px-6 py-4 text-center font-mono">
                    <span
                      className={`px-2 py-0.5 rounded text-xs font-semibold ${
                        m.achievementRate >= 100
                          ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-800'
                          : m.achievementRate >= 80
                          ? 'bg-blue-950/60 text-blue-400 border border-blue-800'
                          : 'bg-amber-950/60 text-amber-400 border border-amber-800'
                      }`}
                    >
                      {m.achievementRate}%
                    </span>
                  </td>
                  <td className="px-6 py-4 text-center font-mono font-bold text-amber-400">
                    {m.score ?? 'N/A'} / 5.0
                  </td>
                  <td className="px-6 py-4 text-center">
                    {m.verifiedAt ? (
                      <span className="inline-flex items-center gap-1 text-xs text-emerald-400 font-medium">
                        <Check className="w-3.5 h-3.5" /> Verified
                      </span>
                    ) : (
                      <button
                        onClick={() => handleVerify(m.id)}
                        className="px-2.5 py-1 bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 border border-amber-500/30 rounded text-xs font-semibold"
                      >
                        Verify
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create KPI Template Modal */}
      {showTemplateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <h3 className="text-lg font-bold text-white">Create KPI Template</h3>
              <button onClick={() => setShowTemplateModal(false)} className="text-zinc-500 hover:text-zinc-300">
                ✕
              </button>
            </div>

            {error && <div className="p-3 bg-rose-950/40 border border-rose-900/60 text-xs text-rose-400 rounded-xl">{error}</div>}

            <form onSubmit={handleCreateTemplate} className="space-y-3.5">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-zinc-300">KPI Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Guard Shift Attendance Rate"
                  value={templateForm.name}
                  onChange={(e) => setTemplateForm({ ...templateForm, name: e.target.value })}
                  className="w-full px-3.5 py-2 bg-zinc-800 border border-zinc-700 rounded-xl text-xs text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-zinc-300">Department</label>
                  <select
                    value={templateForm.departmentId}
                    onChange={(e) => setTemplateForm({ ...templateForm, departmentId: e.target.value })}
                    className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-xl text-xs text-white"
                  >
                    <option value="">All Departments</option>
                    {departments.map((d) => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-zinc-300">Measurement Unit</label>
                  <select
                    value={templateForm.measurementUnit}
                    onChange={(e) => setTemplateForm({ ...templateForm, measurementUnit: e.target.value })}
                    className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-xl text-xs text-white"
                  >
                    <option value="PERCENTAGE">Percentage (%)</option>
                    <option value="NUMERIC">Numeric Count</option>
                    <option value="CURRENCY">Currency (KES)</option>
                    <option value="TIME_HOURS">Time (Hours/Minutes)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-zinc-300">Target Standard *</label>
                  <input
                    type="number"
                    required
                    value={templateForm.target}
                    onChange={(e) => setTemplateForm({ ...templateForm, target: Number(e.target.value) })}
                    className="w-full px-3 py-1.5 bg-zinc-800 border border-zinc-700 rounded-lg text-xs text-white font-mono"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-zinc-300">Default Weight (%)</label>
                  <input
                    type="number"
                    value={templateForm.defaultWeight}
                    onChange={(e) => setTemplateForm({ ...templateForm, defaultWeight: Number(e.target.value) })}
                    className="w-full px-3 py-1.5 bg-zinc-800 border border-zinc-700 rounded-lg text-xs text-white font-mono"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-zinc-300">Frequency</label>
                  <select
                    value={templateForm.frequency}
                    onChange={(e) => setTemplateForm({ ...templateForm, frequency: e.target.value })}
                    className="w-full px-3 py-1.5 bg-zinc-800 border border-zinc-700 rounded-lg text-xs text-white"
                  >
                    <option value="MONTHLY">Monthly</option>
                    <option value="QUARTERLY">Quarterly</option>
                    <option value="ANNUAL">Annual</option>
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-zinc-800">
                <button
                  type="button"
                  onClick={() => setShowTemplateModal(false)}
                  className="px-4 py-2 bg-zinc-800 text-xs text-zinc-300 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 bg-amber-500 text-black font-semibold text-xs rounded-xl"
                >
                  Save KPI
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Record Measurement Modal */}
      {showMeasurementModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <h3 className="text-lg font-bold text-white">Record KPI Achievement</h3>
              <button onClick={() => setShowMeasurementModal(false)} className="text-zinc-500 hover:text-zinc-300">
                ✕
              </button>
            </div>

            <form onSubmit={handleRecordMeasurement} className="space-y-3.5">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-zinc-300">Select KPI *</label>
                <select
                  required
                  value={measurementForm.kpiId}
                  onChange={(e) => setMeasurementForm({ ...measurementForm, kpiId: e.target.value })}
                  className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-xl text-xs text-white"
                >
                  <option value="">Select KPI Template...</option>
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>{t.name} (Target: {t.target})</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-zinc-300">Employee *</label>
                <select
                  required
                  value={measurementForm.employeeId}
                  onChange={(e) => setMeasurementForm({ ...measurementForm, employeeId: e.target.value })}
                  className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-xl text-xs text-white"
                >
                  <option value="">Select Employee...</option>
                  {employees.map((emp) => (
                    <option key={emp.id} value={emp.id}>{emp.fullName} ({emp.employeeNumber})</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-zinc-300">Measurement Period *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. 2026-Q1 or 2026-03"
                    value={measurementForm.periodName}
                    onChange={(e) => setMeasurementForm({ ...measurementForm, periodName: e.target.value })}
                    className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-xl text-xs text-white"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-zinc-300">Actual Result Achieved *</label>
                  <input
                    type="number"
                    step="any"
                    required
                    value={measurementForm.actual}
                    onChange={(e) => setMeasurementForm({ ...measurementForm, actual: Number(e.target.value) })}
                    className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-xl text-xs text-white font-mono"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-zinc-300">Comments</label>
                <textarea
                  rows={2}
                  placeholder="Verification notes or performance context..."
                  value={measurementForm.comments}
                  onChange={(e) => setMeasurementForm({ ...measurementForm, comments: e.target.value })}
                  className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-xl text-xs text-white"
                />
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-zinc-800">
                <button
                  type="button"
                  onClick={() => setShowMeasurementModal(false)}
                  className="px-4 py-2 bg-zinc-800 text-xs text-zinc-300 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 bg-amber-500 text-black font-semibold text-xs rounded-xl"
                >
                  Save Result
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
