'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  GraduationCap,
  BookOpen,
  Calendar,
  Users,
  Award,
  ShieldCheck,
  Clock,
  DollarSign,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  Plus,
  RefreshCw,
  FileText,
  BarChart3,
} from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';

export default function TrainingDashboardPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const fetchDashboardData = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/training/dashboard');
      const json = await res.json();
      if (json.success) {
        setData(json.data);
      }
    } catch (err) {
      console.error('Failed to load training dashboard:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const kpis = data?.kpis || {};
  const costSummary = data?.costSummary || {};
  const deptSummary = data?.departmentSummary || [];

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <GraduationCap className="h-7 w-7 text-indigo-600" />
            Training & Development Command Center
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Workforce skill building, mandatory compliance tracking, certified security training, and budget governance
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={fetchDashboardData} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Link href="/training/sessions">
            <Button size="sm" className="bg-indigo-600 hover:bg-indigo-700 text-white">
              <Plus className="h-4 w-4 mr-2" />
              Schedule Session
            </Button>
          </Link>
        </div>
      </div>

      {/* 8 Metric KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="p-5 border-l-4 border-indigo-500 hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Active Programs</p>
              <h3 className="text-2xl font-bold text-gray-900 mt-1">{loading ? '...' : kpis.activePrograms ?? 0}</h3>
              <p className="text-xs text-gray-400 mt-1">Structured learning tracks</p>
            </div>
            <div className="p-3 bg-indigo-50 text-indigo-600 rounded-xl">
              <BookOpen className="h-6 w-6" />
            </div>
          </div>
        </Card>

        <Card className="p-5 border-l-4 border-blue-500 hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Upcoming Sessions</p>
              <h3 className="text-2xl font-bold text-gray-900 mt-1">{loading ? '...' : kpis.upcomingSessions ?? 0}</h3>
              <p className="text-xs text-gray-400 mt-1">Classroom & online</p>
            </div>
            <div className="p-3 bg-blue-50 text-blue-600 rounded-xl">
              <Calendar className="h-6 w-6" />
            </div>
          </div>
        </Card>

        <Card className="p-5 border-l-4 border-emerald-500 hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Employees Enrolled</p>
              <h3 className="text-2xl font-bold text-gray-900 mt-1">{loading ? '...' : kpis.employeesEnrolled ?? 0}</h3>
              <p className="text-xs text-emerald-600 font-medium mt-1">
                {kpis.trainingCompleted ?? 0} Completed
              </p>
            </div>
            <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl">
              <Users className="h-6 w-6" />
            </div>
          </div>
        </Card>

        <Card className="p-5 border-l-4 border-amber-500 hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Certs Expiring</p>
              <h3 className="text-2xl font-bold text-amber-600 mt-1">{loading ? '...' : kpis.certificationsExpiring ?? 0}</h3>
              <p className="text-xs text-gray-400 mt-1">Next 60 days</p>
            </div>
            <div className="p-3 bg-amber-50 text-amber-600 rounded-xl">
              <Award className="h-6 w-6" />
            </div>
          </div>
        </Card>

        <Card className="p-5 border-l-4 border-purple-500 hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Training Hours</p>
              <h3 className="text-2xl font-bold text-gray-900 mt-1">{loading ? '...' : `${kpis.trainingHoursThisMonth ?? 0} hrs`}</h3>
              <p className="text-xs text-gray-400 mt-1">Delivered this month</p>
            </div>
            <div className="p-3 bg-purple-50 text-purple-600 rounded-xl">
              <Clock className="h-6 w-6" />
            </div>
          </div>
        </Card>

        <Card className="p-5 border-l-4 border-teal-500 hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Completion Rate</p>
              <h3 className="text-2xl font-bold text-teal-700 mt-1">{loading ? '...' : `${kpis.rates?.completionRate ?? 100}%`}</h3>
              <p className="text-xs text-teal-600 font-medium mt-1">
                Pass Rate: {kpis.rates?.assessmentPassRate ?? 100}%
              </p>
            </div>
            <div className="p-3 bg-teal-50 text-teal-600 rounded-xl">
              <CheckCircle2 className="h-6 w-6" />
            </div>
          </div>
        </Card>

        <Card className="p-5 border-l-4 border-rose-500 hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Mandatory Due</p>
              <h3 className="text-2xl font-bold text-rose-600 mt-1">{loading ? '...' : kpis.mandatoryTrainingDue ?? 0}</h3>
              <p className="text-xs text-rose-500 font-medium mt-1">Compliance alert</p>
            </div>
            <div className="p-3 bg-rose-50 text-rose-600 rounded-xl">
              <ShieldCheck className="h-6 w-6" />
            </div>
          </div>
        </Card>

        <Card className="p-5 border-l-4 border-slate-600 hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Training Cost</p>
              <h3 className="text-2xl font-bold text-gray-900 mt-1">
                {loading ? '...' : `KES ${(kpis.trainingCostThisMonth ?? 0).toLocaleString()}`}
              </h3>
              <p className="text-xs text-gray-400 mt-1">
                Utilized: {kpis.rates?.budgetUtilizationRate ?? 0}%
              </p>
            </div>
            <div className="p-3 bg-slate-100 text-slate-700 rounded-xl">
              <DollarSign className="h-6 w-6" />
            </div>
          </div>
        </Card>
      </div>

      {/* Quick Navigation Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { label: 'Course Catalog', href: '/training/courses', icon: BookOpen, color: 'text-blue-600 bg-blue-50' },
          { label: 'Programs', href: '/training/programs', icon: GraduationCap, color: 'text-indigo-600 bg-indigo-50' },
          { label: 'Sessions', href: '/training/sessions', icon: Calendar, color: 'text-emerald-600 bg-emerald-50' },
          { label: 'Attendance', href: '/training/attendance', icon: Clock, color: 'text-purple-600 bg-purple-50' },
          { label: 'Certificates', href: '/training/certificates', icon: Award, color: 'text-amber-600 bg-amber-50' },
          { label: 'Compliance', href: '/training/compliance', icon: ShieldCheck, color: 'text-rose-600 bg-rose-50' },
        ].map((item, idx) => {
          const Icon = item.icon;
          return (
            <Link key={idx} href={item.href}>
              <Card className="p-3.5 hover:border-indigo-300 hover:shadow-sm transition-all flex flex-col items-center text-center cursor-pointer">
                <div className={`p-2.5 rounded-lg ${item.color} mb-2`}>
                  <Icon className="h-5 w-5" />
                </div>
                <span className="text-xs font-semibold text-gray-800">{item.label}</span>
              </Card>
            </Link>
          );
        })}
      </div>

      {/* Budget & Departmental Overview Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Department Summary */}
        <div className="lg:col-span-2 space-y-4">
          <Card className="p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
                  <BarChart3 className="h-5 w-5 text-indigo-600" />
                  Departmental Training Performance
                </h3>
                <p className="text-xs text-gray-500">Live progress across active company divisions</p>
              </div>
              <Link href="/training/analytics" className="text-xs text-indigo-600 hover:text-indigo-800 font-medium flex items-center gap-1">
                Full Analytics <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-gray-200 text-gray-500 font-semibold bg-gray-50/50">
                    <th className="py-2.5 px-3">Department</th>
                    <th className="py-2.5 px-3">Staff Trained</th>
                    <th className="py-2.5 px-3">Hours</th>
                    <th className="py-2.5 px-3">Completion</th>
                    <th className="py-2.5 px-3 text-right">Total Cost</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {deptSummary.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-4 text-center text-gray-400">
                        {loading ? 'Loading department data...' : 'No department training records yet.'}
                      </td>
                    </tr>
                  ) : (
                    deptSummary.slice(0, 6).map((dept: any) => (
                      <tr key={dept.id} className="hover:bg-gray-50/60 transition-colors">
                        <td className="py-2.5 px-3 font-medium text-gray-900">{dept.name}</td>
                        <td className="py-2.5 px-3 text-gray-700">
                          {dept.employeesTrained} / {dept.totalEmployees}
                        </td>
                        <td className="py-2.5 px-3 text-gray-600">{dept.totalHours} hrs</td>
                        <td className="py-2.5 px-3">
                          <div className="flex items-center gap-2">
                            <div className="w-16 bg-gray-200 rounded-full h-1.5 overflow-hidden">
                              <div
                                className="bg-indigo-600 h-1.5 rounded-full"
                                style={{ width: `${dept.completionRate}%` }}
                              />
                            </div>
                            <span className="text-[11px] font-medium text-gray-700">{dept.completionRate}%</span>
                          </div>
                        </td>
                        <td className="py-2.5 px-3 text-right font-medium text-gray-900">
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

        {/* Right Col: Budget & Cost Accounting */}
        <div className="space-y-4">
          <Card className="p-5">
            <h3 className="text-base font-bold text-gray-900 flex items-center gap-2 mb-3">
              <DollarSign className="h-5 w-5 text-emerald-600" />
              Budget Utilization
            </h3>
            <div className="space-y-3">
              <div>
                <div className="flex justify-between text-xs font-medium text-gray-700 mb-1">
                  <span>Fiscal Year Budget</span>
                  <span>{costSummary.budget?.utilizationRate ?? 0}% Utilized</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2.5 overflow-hidden">
                  <div
                    className="bg-emerald-600 h-2.5 rounded-full transition-all duration-500"
                    style={{ width: `${Math.min(100, costSummary.budget?.utilizationRate ?? 0)}%` }}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-gray-100 text-xs">
                <div className="bg-gray-50 p-2.5 rounded-lg">
                  <span className="text-gray-400 block">Total Spend</span>
                  <span className="font-bold text-gray-900 mt-0.5 block">
                    KES {(costSummary.totalCost ?? 0).toLocaleString()}
                  </span>
                </div>
                <div className="bg-gray-50 p-2.5 rounded-lg">
                  <span className="text-gray-400 block">Cost / Person</span>
                  <span className="font-bold text-indigo-600 mt-0.5 block">
                    KES {(costSummary.costPerEmployee ?? 0).toLocaleString()}
                  </span>
                </div>
              </div>

              <Link href="/training/costs">
                <Button variant="outline" size="sm" className="w-full mt-2 text-xs">
                  Manage Training Costs & Budgets
                </Button>
              </Link>
            </div>
          </Card>

          {/* Quick Action Alerts */}
          <Card className="p-5 bg-gradient-to-br from-indigo-900 to-slate-900 text-white">
            <h4 className="font-semibold text-sm flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-emerald-400" />
              PSRA Security Compliance
            </h4>
            <p className="text-xs text-indigo-200 mt-1.5 leading-relaxed">
              Mandatory tactical guard certifications require renewal every 24 months per Private Security Regulatory Authority guidelines.
            </p>
            <div className="mt-3.5 flex gap-2">
              <Link href="/training/compliance">
                <Button size="sm" className="bg-emerald-500 hover:bg-emerald-600 text-white text-xs">
                  Check Compliance Matrix
                </Button>
              </Link>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
