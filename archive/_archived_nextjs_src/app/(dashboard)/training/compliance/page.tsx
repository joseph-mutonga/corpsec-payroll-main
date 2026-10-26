'use client';

import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  Search,
  Filter,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Clock,
  Building,
} from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';

export default function TrainingCompliancePage() {
  const [data, setData] = useState<any>(null);
  const [departments, setDepartments] = useState<any[]>([]);
  const [departmentId, setDepartmentId] = useState('ALL');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  const fetchCompliance = async () => {
    setLoading(true);
    try {
      const [resCompliance, resDepts] = await Promise.all([
        fetch(`/api/training/compliance?departmentId=${departmentId}`),
        fetch('/api/departments'),
      ]);
      const jsonComp = await resCompliance.json();
      const jsonDepts = await resDepts.json();

      if (jsonComp.success) setData(jsonComp.data);
      if (jsonDepts.success) setDepartments(jsonDepts.data.departments || []);
    } catch (err) {
      console.error('Failed to load compliance:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCompliance();
  }, [departmentId]);

  const mandatoryCourses = data?.mandatoryCourses || [];
  const employees = data?.employees || [];

  const filteredEmployees = employees.filter((emp: any) => {
    if (search) {
      const q = search.toLowerCase();
      return (
        emp.employee.fullName.toLowerCase().includes(q) ||
        emp.employee.employeeNumber.toLowerCase().includes(q) ||
        emp.employee.jobTitle?.toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <ShieldCheck className="h-6 w-6 text-emerald-600" />
            Mandatory Compliance & Certification Matrix
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Ensure all operational guards and staff adhere to statutory PSRA licensing, firearm safety, and first aid mandates
          </p>
        </div>
      </div>

      {/* Filter Bar */}
      <Card className="p-4">
        <div className="flex flex-col md:flex-row items-center gap-3">
          <div className="relative flex-1 w-full">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search employee name, badge #, or role..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <select
            value={departmentId}
            onChange={(e) => setDepartmentId(e.target.value)}
            className="px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white focus:outline-none"
          >
            <option value="ALL">All Departments</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </div>
      </Card>

      {/* Compliance Matrix Table */}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-gray-50 border-b border-gray-200 text-gray-500 uppercase tracking-wider font-semibold">
              <tr>
                <th className="py-3 px-4 min-w-[200px]">Employee</th>
                <th className="py-3 px-4">Department</th>
                <th className="py-3 px-4 text-center">Compliance</th>
                {mandatoryCourses.map((c: any) => (
                  <th key={c.id} className="py-3 px-4 text-center min-w-[130px]">
                    <div>{c.code}</div>
                    <div className="text-[10px] text-gray-400 font-normal lowercase">{c.title}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr>
                  <td colSpan={3 + mandatoryCourses.length} className="py-8 text-center text-gray-400">
                    Loading compliance matrix...
                  </td>
                </tr>
              ) : filteredEmployees.length === 0 ? (
                <tr>
                  <td colSpan={3 + mandatoryCourses.length} className="py-8 text-center text-gray-400">
                    No employees found matching criteria.
                  </td>
                </tr>
              ) : (
                filteredEmployees.map((item: any) => (
                  <tr key={item.employee.id} className="hover:bg-gray-50/70 transition-colors">
                    <td className="py-3 px-4">
                      <div className="font-semibold text-gray-900">{item.employee.fullName}</div>
                      <div className="text-gray-400">{item.employee.employeeNumber} • {item.employee.jobTitle || 'Guard'}</div>
                    </td>
                    <td className="py-3 px-4 text-gray-600 font-medium">{item.employee.department}</td>
                    <td className="py-3 px-4 text-center">
                      <div className="flex flex-col items-center">
                        <span
                          className={`font-bold ${
                            item.complianceRate === 100
                              ? 'text-emerald-600'
                              : item.complianceRate >= 50
                              ? 'text-amber-600'
                              : 'text-rose-600'
                          }`}
                        >
                          {item.complianceRate}%
                        </span>
                        <div className="w-12 bg-gray-200 rounded-full h-1 mt-0.5 overflow-hidden">
                          <div
                            className={`h-1 rounded-full ${
                              item.complianceRate === 100
                                ? 'bg-emerald-500'
                                : item.complianceRate >= 50
                                ? 'bg-amber-500'
                                : 'bg-rose-500'
                            }`}
                            style={{ width: `${item.complianceRate}%` }}
                          />
                        </div>
                      </div>
                    </td>
                    {item.courses?.map((cStatus: any) => (
                      <td key={cStatus.courseId} className="py-3 px-4 text-center">
                        {cStatus.status === 'COMPLIANT' ? (
                          <Badge variant="success" className="text-[10px]">
                            COMPLIANT
                          </Badge>
                        ) : cStatus.status === 'EXPIRED' ? (
                          <Badge variant="danger" className="text-[10px]">
                            EXPIRED
                          </Badge>
                        ) : (
                          <Badge variant="warning" className="text-[10px]">
                            DUE
                          </Badge>
                        )}
                      </td>
                    ))}
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
