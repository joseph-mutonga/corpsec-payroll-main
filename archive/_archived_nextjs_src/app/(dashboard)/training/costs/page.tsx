'use client';

import React, { useState, useEffect } from 'react';
import {
  DollarSign,
  Plus,
  Search,
  Building,
  TrendingUp,
  PieChart,
  Users,
  Calendar,
} from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';

export default function TrainingCostsPage() {
  const [costs, setCosts] = useState<any[]>([]);
  const [budgets, setBudgets] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [courses, setCourses] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const [showCostModal, setShowCostModal] = useState(false);
  const [showBudgetModal, setShowBudgetModal] = useState(false);

  const [costForm, setCostForm] = useState({
    departmentId: '',
    courseId: '',
    courseFee: 0,
    trainerFee: 0,
    venueFee: 0,
    materialsCost: 0,
    travelCost: 0,
    accommodationCost: 0,
    otherCost: 0,
    notes: '',
  });

  const [budgetForm, setBudgetForm] = useState({
    budgetPeriod: new Date().getFullYear().toString(),
    departmentId: '',
    allocatedAmount: 500000,
  });

  const [submitting, setSubmitting] = useState(false);

  const fetchCostData = async () => {
    setLoading(true);
    try {
      const [resCosts, resBudgets, resSummary, resDepts, resCourses] = await Promise.all([
        fetch('/api/training/costs'),
        fetch('/api/training/budgets'),
        fetch('/api/training/costs?summary=true'),
        fetch('/api/departments'),
        fetch('/api/training/courses'),
      ]);

      const jsonCosts = await resCosts.json();
      const jsonBudgets = await resBudgets.json();
      const jsonSummary = await resSummary.json();
      const jsonDepts = await resDepts.json();
      const jsonCourses = await resCourses.json();

      if (jsonCosts.success) setCosts(jsonCosts.data.costs || []);
      if (jsonBudgets.success) setBudgets(jsonBudgets.data.budgets || []);
      if (jsonSummary.success) setSummary(jsonSummary.data || null);
      if (jsonDepts.success) setDepartments(jsonDepts.data.departments || []);
      if (jsonCourses.success) setCourses(jsonCourses.data.courses || []);
    } catch (err) {
      console.error('Failed to load cost data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCostData();
  }, []);

  const handleCreateCost = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch('/api/training/costs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(costForm),
      });
      const json = await res.json();
      if (json.success) {
        setShowCostModal(false);
        setCostForm({
          departmentId: '',
          courseId: '',
          courseFee: 0,
          trainerFee: 0,
          venueFee: 0,
          materialsCost: 0,
          travelCost: 0,
          accommodationCost: 0,
          otherCost: 0,
          notes: '',
        });
        fetchCostData();
      } else {
        alert(json.error || 'Failed to record cost.');
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  const handleSetBudget = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch('/api/training/budgets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(budgetForm),
      });
      const json = await res.json();
      if (json.success) {
        setShowBudgetModal(false);
        fetchCostData();
      } else {
        alert(json.error || 'Failed to set budget.');
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <DollarSign className="h-6 w-6 text-emerald-600" />
            Training Costs & Budget Management
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Track course expenditures, trainer compensations, venue rental fees, and departmental budget caps
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={() => setShowBudgetModal(true)}>
            <Building className="h-4 w-4 mr-2" />
            Set Dept Budget
          </Button>
          <Button size="sm" onClick={() => setShowCostModal(true)} className="bg-emerald-600 hover:bg-emerald-700 text-white">
            <Plus className="h-4 w-4 mr-2" />
            Record Cost
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="p-5 border-l-4 border-emerald-500">
          <p className="text-xs font-semibold text-gray-500 uppercase">Total Training Spend</p>
          <h3 className="text-2xl font-bold text-gray-900 mt-1">
            KES {(summary?.totalCost ?? 0).toLocaleString()}
          </h3>
          <p className="text-xs text-gray-400 mt-1">Fiscal year to date</p>
        </Card>

        <Card className="p-5 border-l-4 border-indigo-500">
          <p className="text-xs font-semibold text-gray-500 uppercase">Cost Per Employee</p>
          <h3 className="text-2xl font-bold text-indigo-600 mt-1">
            KES {(summary?.costPerEmployee ?? 0).toLocaleString()}
          </h3>
          <p className="text-xs text-gray-400 mt-1">
            Across {summary?.uniqueEmployeesTrained ?? 0} trained staff
          </p>
        </Card>

        <Card className="p-5 border-l-4 border-blue-500">
          <p className="text-xs font-semibold text-gray-500 uppercase">Budget Allocated</p>
          <h3 className="text-2xl font-bold text-gray-900 mt-1">
            KES {(summary?.budget?.allocated ?? 0).toLocaleString()}
          </h3>
          <p className="text-xs text-gray-400 mt-1">
            Remaining: KES {(summary?.budget?.remaining ?? 0).toLocaleString()}
          </p>
        </Card>

        <Card className="p-5 border-l-4 border-purple-500">
          <p className="text-xs font-semibold text-gray-500 uppercase">Budget Utilization</p>
          <h3 className="text-2xl font-bold text-purple-600 mt-1">
            {summary?.budget?.utilizationRate ?? 0}%
          </h3>
          <div className="w-full bg-gray-200 rounded-full h-1.5 mt-2 overflow-hidden">
            <div
              className="bg-purple-600 h-1.5 rounded-full"
              style={{ width: `${Math.min(100, summary?.budget?.utilizationRate ?? 0)}%` }}
            />
          </div>
        </Card>
      </div>

      {/* Department Budgets Grid */}
      <Card className="p-5">
        <h3 className="text-base font-bold text-gray-900 mb-4 flex items-center gap-2">
          <Building className="h-5 w-5 text-indigo-600" />
          Departmental Budget Allocations
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {budgets.map((b) => {
            const util = b.allocatedAmount > 0 ? Math.round((b.usedAmount / b.allocatedAmount) * 100) : 0;
            return (
              <div key={b.id} className="p-4 bg-gray-50 rounded-xl border border-gray-100 space-y-2">
                <div className="flex justify-between items-start">
                  <span className="font-bold text-sm text-gray-900">{b.department?.name}</span>
                  <Badge variant={util > 90 ? 'danger' : 'info'}>{util}%</Badge>
                </div>
                <div className="text-xs text-gray-500 flex justify-between">
                  <span>Used: KES {b.usedAmount.toLocaleString()}</span>
                  <span>Limit: KES {b.allocatedAmount.toLocaleString()}</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                  <div
                    className={`h-2 rounded-full ${util > 90 ? 'bg-rose-500' : 'bg-indigo-600'}`}
                    style={{ width: `${Math.min(100, util)}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Itemized Cost Ledger Table */}
      <Card className="overflow-hidden">
        <div className="p-4 bg-gray-50 border-b border-gray-200">
          <h3 className="text-sm font-bold text-gray-900">Itemized Training Cost Ledger</h3>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50/50 border-b border-gray-200 text-xs font-semibold text-gray-500 uppercase tracking-wider">
              <tr>
                <th className="py-3 px-4">Ref #</th>
                <th className="py-3 px-4">Department</th>
                <th className="py-3 px-4">Course / Session</th>
                <th className="py-3 px-4">Course Fee</th>
                <th className="py-3 px-4">Trainer Fee</th>
                <th className="py-3 px-4">Venue & Others</th>
                <th className="py-3 px-4 text-right">Total Cost</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-gray-400">Loading cost records...</td>
                </tr>
              ) : costs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-gray-400">No cost records found.</td>
                </tr>
              ) : (
                costs.map((c) => (
                  <tr key={c.id} className="hover:bg-gray-50/60 transition-colors">
                    <td className="py-3 px-4 font-mono text-xs font-semibold text-indigo-600">{c.costNumber}</td>
                    <td className="py-3 px-4 font-medium text-gray-900">{c.department?.name || 'General'}</td>
                    <td className="py-3 px-4">
                      <div className="font-medium text-gray-800">{c.course?.title || 'General Training'}</div>
                      <div className="text-xs text-gray-400">{c.session?.sessionNumber}</div>
                    </td>
                    <td className="py-3 px-4 text-xs text-gray-700">KES {c.courseFee.toLocaleString()}</td>
                    <td className="py-3 px-4 text-xs text-gray-700">KES {c.trainerFee.toLocaleString()}</td>
                    <td className="py-3 px-4 text-xs text-gray-700">
                      KES {(c.venueFee + c.materialsCost + c.travelCost + c.accommodationCost + c.otherCost).toLocaleString()}
                    </td>
                    <td className="py-3 px-4 text-right font-bold text-gray-900">
                      KES {c.totalCost.toLocaleString()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Record Cost Modal */}
      {showCostModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl space-y-4 my-8">
            <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-emerald-600" />
              Record Training Expenditure
            </h3>

            <form onSubmit={handleCreateCost} className="space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Department *</label>
                  <select
                    required
                    value={costForm.departmentId}
                    onChange={(e) => setCostForm({ ...costForm, departmentId: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white focus:outline-none"
                  >
                    <option value="">-- Select Department --</option>
                    {departments.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Course</label>
                  <select
                    value={costForm.courseId}
                    onChange={(e) => setCostForm({ ...costForm, courseId: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white focus:outline-none"
                  >
                    <option value="">-- Select Course --</option>
                    {courses.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.code} - {c.title}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Course Tuition Fee (KES)</label>
                  <input
                    type="number"
                    min="0"
                    value={costForm.courseFee}
                    onChange={(e) => setCostForm({ ...costForm, courseFee: Number(e.target.value) })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Trainer Honorarium (KES)</label>
                  <input
                    type="number"
                    min="0"
                    value={costForm.trainerFee}
                    onChange={(e) => setCostForm({ ...costForm, trainerFee: Number(e.target.value) })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Venue Hire Fee (KES)</label>
                  <input
                    type="number"
                    min="0"
                    value={costForm.venueFee}
                    onChange={(e) => setCostForm({ ...costForm, venueFee: Number(e.target.value) })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Materials / Books (KES)</label>
                  <input
                    type="number"
                    min="0"
                    value={costForm.materialsCost}
                    onChange={(e) => setCostForm({ ...costForm, materialsCost: Number(e.target.value) })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Travel & Logistics (KES)</label>
                  <input
                    type="number"
                    min="0"
                    value={costForm.travelCost}
                    onChange={(e) => setCostForm({ ...costForm, travelCost: Number(e.target.value) })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Other Incidentals (KES)</label>
                  <input
                    type="number"
                    min="0"
                    value={costForm.otherCost}
                    onChange={(e) => setCostForm({ ...costForm, otherCost: Number(e.target.value) })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none"
                  />
                </div>

                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Expense Notes</label>
                  <textarea
                    rows={2}
                    value={costForm.notes}
                    onChange={(e) => setCostForm({ ...costForm, notes: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-gray-100">
                <Button type="button" variant="outline" size="sm" onClick={() => setShowCostModal(false)}>
                  Cancel
                </Button>
                <Button type="submit" size="sm" disabled={submitting} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                  {submitting ? 'Saving...' : 'Record Cost'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Set Budget Modal */}
      {showBudgetModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
              <Building className="h-5 w-5 text-indigo-600" />
              Set Department Training Budget
            </h3>

            <form onSubmit={handleSetBudget} className="space-y-4 text-sm">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Department *</label>
                <select
                  required
                  value={budgetForm.departmentId}
                  onChange={(e) => setBudgetForm({ ...budgetForm, departmentId: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white focus:outline-none"
                >
                  <option value="">-- Select Department --</option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Budget Period (Year)</label>
                <input
                  type="text"
                  required
                  value={budgetForm.budgetPeriod}
                  onChange={(e) => setBudgetForm({ ...budgetForm, budgetPeriod: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Allocated Amount (KES) *</label>
                <input
                  type="number"
                  min="0"
                  required
                  value={budgetForm.allocatedAmount}
                  onChange={(e) => setBudgetForm({ ...budgetForm, allocatedAmount: Number(e.target.value) })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none"
                />
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-gray-100">
                <Button type="button" variant="outline" size="sm" onClick={() => setShowBudgetModal(false)}>
                  Cancel
                </Button>
                <Button type="submit" size="sm" disabled={submitting} className="bg-indigo-600 hover:bg-indigo-700 text-white">
                  {submitting ? 'Saving...' : 'Set Budget'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
