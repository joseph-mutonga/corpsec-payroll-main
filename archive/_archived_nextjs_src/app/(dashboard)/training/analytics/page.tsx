'use client';

import React, { useState, useEffect } from 'react';
import {
  BarChart3,
  TrendingUp,
  PieChart,
  Users,
  Award,
  CheckCircle2,
  Clock,
  DollarSign,
  ShieldCheck,
} from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';

export default function TrainingAnalyticsPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/training/dashboard')
      .then((res) => res.json())
      .then((json) => {
        if (json.success) setData(json.data);
      })
      .finally(() => setLoading(false));
  }, []);

  const kpis = data?.kpis || {};
  const costSummary = data?.costSummary || {};
  const deptSummary = data?.departmentSummary || [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <BarChart3 className="h-6 w-6 text-indigo-600" />
            Learning & Development Analytics
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Enterprise analytics on workforce upskilling, assessment scoring rates, and training ROI
          </p>
        </div>
      </div>

      {/* 4 Performance Rate Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="p-5 border-l-4 border-emerald-500">
          <p className="text-xs font-semibold text-gray-500 uppercase">Completion Rate</p>
          <h3 className="text-2xl font-bold text-emerald-600 mt-1">{loading ? '...' : `${kpis.rates?.completionRate ?? 100}%`}</h3>
          <p className="text-xs text-gray-400 mt-1">Enrolled trainees who finished</p>
        </Card>

        <Card className="p-5 border-l-4 border-blue-500">
          <p className="text-xs font-semibold text-gray-500 uppercase">Attendance Rate</p>
          <h3 className="text-2xl font-bold text-blue-600 mt-1">{loading ? '...' : `${kpis.rates?.attendanceRate ?? 100}%`}</h3>
          <p className="text-xs text-gray-400 mt-1">Presence during scheduled sessions</p>
        </Card>

        <Card className="p-5 border-l-4 border-indigo-500">
          <p className="text-xs font-semibold text-gray-500 uppercase">Assessment Pass Rate</p>
          <h3 className="text-2xl font-bold text-indigo-600 mt-1">{loading ? '...' : `${kpis.rates?.assessmentPassRate ?? 100}%`}</h3>
          <p className="text-xs text-gray-400 mt-1">Trainees meeting pass marks</p>
        </Card>

        <Card className="p-5 border-l-4 border-purple-500">
          <p className="text-xs font-semibold text-gray-500 uppercase">Budget Utilization</p>
          <h3 className="text-2xl font-bold text-purple-600 mt-1">{loading ? '...' : `${kpis.rates?.budgetUtilizationRate ?? 0}%`}</h3>
          <p className="text-xs text-gray-400 mt-1">Spend against annual allocated budget</p>
        </Card>
      </div>

      {/* Department Breakdown Matrix */}
      <Card className="p-5">
        <h3 className="text-base font-bold text-gray-900 mb-4 flex items-center gap-2">
          <Users className="h-5 w-5 text-indigo-600" />
          Departmental Training Metrics
        </h3>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-500 uppercase tracking-wider">
              <tr>
                <th className="py-3 px-4">Department</th>
                <th className="py-3 px-4">Staff Headcount</th>
                <th className="py-3 px-4">Staff Trained</th>
                <th className="py-3 px-4">Training Hours</th>
                <th className="py-3 px-4">Completion %</th>
                <th className="py-3 px-4 text-right">Total Expenditure</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {deptSummary.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-gray-400">Loading metrics...</td>
                </tr>
              ) : (
                deptSummary.map((dept: any) => (
                  <tr key={dept.id} className="hover:bg-gray-50/60 transition-colors">
                    <td className="py-3 px-4 font-semibold text-gray-900">{dept.name}</td>
                    <td className="py-3 px-4 text-gray-700">{dept.totalEmployees}</td>
                    <td className="py-3 px-4 text-gray-700 font-medium">
                      {dept.employeesTrained} ({dept.totalEmployees > 0 ? Math.round((dept.employeesTrained / dept.totalEmployees) * 100) : 0}%)
                    </td>
                    <td className="py-3 px-4 text-gray-600">{dept.totalHours} hrs</td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <div className="w-20 bg-gray-200 rounded-full h-1.5 overflow-hidden">
                          <div className="bg-indigo-600 h-1.5 rounded-full" style={{ width: `${dept.completionRate}%` }} />
                        </div>
                        <span className="text-xs font-medium text-gray-700">{dept.completionRate}%</span>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-right font-bold text-gray-900">
                      KES {dept.totalCost.toLocaleString()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
