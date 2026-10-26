'use client';

import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  Clock,
  Search,
  CheckCircle,
  XCircle,
  AlertCircle,
  Lock,
  Save,
  Users,
} from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';

export default function TrainingAttendancePage() {
  const searchParams = useSearchParams();
  const initialSessionId = searchParams.get('sessionId') || '';

  const [sessions, setSessions] = useState<any[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState(initialSessionId);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [rosterData, setRosterData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [attendanceMap, setAttendanceMap] = useState<Record<string, { status: string; hours: number; remarks: string }>>({});

  useEffect(() => {
    fetch('/api/training/sessions')
      .then((res) => res.json())
      .then((json) => {
        if (json.success) {
          setSessions(json.data.sessions || []);
          if (!selectedSessionId && json.data.sessions?.length > 0) {
            setSelectedSessionId(json.data.sessions[0].id);
          }
        }
      });
  }, []);

  const fetchRoster = async () => {
    if (!selectedSessionId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/training/attendance?sessionId=${selectedSessionId}&date=${selectedDate}`);
      const json = await res.json();
      if (json.success) {
        setRosterData(json.data);
        const map: Record<string, any> = {};
        json.data.roster?.forEach((item: any) => {
          map[item.employee.id] = {
            status: item.attendance?.status || 'PRESENT',
            hours: item.attendance?.hoursAttended !== undefined ? item.attendance.hoursAttended : 8,
            remarks: item.attendance?.remarks || '',
          };
        });
        setAttendanceMap(map);
      }
    } catch (err) {
      console.error('Failed to load roster:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (selectedSessionId) {
      fetchRoster();
    }
  }, [selectedSessionId, selectedDate]);

  const handleStatusChange = (employeeId: string, status: string) => {
    setAttendanceMap((prev) => ({
      ...prev,
      [employeeId]: {
        ...prev[employeeId],
        status,
        hours: status === 'PRESENT' ? 8 : status === 'PARTIAL' ? 4 : 0,
      },
    }));
  };

  const handleMarkAll = (status: string) => {
    const map: Record<string, any> = {};
    rosterData?.roster?.forEach((item: any) => {
      map[item.employee.id] = {
        status,
        hours: status === 'PRESENT' ? 8 : status === 'PARTIAL' ? 4 : 0,
        remarks: attendanceMap[item.employee.id]?.remarks || '',
      };
    });
    setAttendanceMap(map);
  };

  const handleSaveAttendance = async () => {
    setSaving(true);
    try {
      const records = Object.keys(attendanceMap).map((employeeId) => ({
        employeeId,
        status: attendanceMap[employeeId].status,
        hoursAttended: attendanceMap[employeeId].hours,
        remarks: attendanceMap[employeeId].remarks,
      }));

      const res = await fetch('/api/training/attendance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bulk: true,
          sessionId: selectedSessionId,
          date: selectedDate,
          records,
        }),
      });

      const json = await res.json();
      if (json.success) {
        alert('Attendance records saved successfully!');
        fetchRoster();
      } else {
        alert(json.error || 'Failed to save attendance.');
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const handleFinalize = async () => {
    if (!confirm('Are you sure you want to finalize and lock attendance for this date? It cannot be edited after finalization.')) return;
    try {
      const res = await fetch('/api/training/attendance', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: selectedSessionId,
          date: selectedDate,
        }),
      });
      const json = await res.json();
      if (json.success) {
        alert('Attendance successfully finalized and locked.');
        fetchRoster();
      }
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Clock className="h-6 w-6 text-indigo-600" />
            Session Attendance & Roster
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Record training presence, check-in timestamps, and hours attended for enrolled security personnel
          </p>
        </div>
      </div>

      {/* Session & Date Selector Card */}
      <Card className="p-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-2">
            <label className="block text-xs font-semibold text-gray-700 mb-1">Select Training Session</label>
            <select
              value={selectedSessionId}
              onChange={(e) => setSelectedSessionId(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {sessions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.sessionNumber} - {s.course?.title} ({new Date(s.startDate).toLocaleDateString()})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">Attendance Date</label>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        </div>
      </Card>

      {/* Roster Table Card */}
      <Card className="overflow-hidden">
        <div className="p-4 bg-gray-50 border-b border-gray-200 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-indigo-600" />
            <span className="font-bold text-sm text-gray-900">
              Enrolled Roster ({rosterData?.roster?.length || 0} participants)
            </span>
          </div>

          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => handleMarkAll('PRESENT')} className="text-xs">
              Mark All Present
            </Button>
            <Button size="sm" variant="outline" onClick={() => handleMarkAll('ABSENT')} className="text-xs">
              Mark All Absent
            </Button>
            <Button
              size="sm"
              onClick={handleSaveAttendance}
              disabled={saving || !rosterData?.roster?.length}
              className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs"
            >
              <Save className="h-3.5 w-3.5 mr-1.5" />
              {saving ? 'Saving...' : 'Save Attendance'}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={handleFinalize}
              className="text-xs text-rose-600 border-rose-200 hover:bg-rose-50"
            >
              <Lock className="h-3.5 w-3.5 mr-1.5" />
              Finalize & Lock
            </Button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50/50 border-b border-gray-200 text-xs font-semibold text-gray-500 uppercase tracking-wider">
              <tr>
                <th className="py-3 px-4">Employee</th>
                <th className="py-3 px-4">Department / Station</th>
                <th className="py-3 px-4">Attendance Status</th>
                <th className="py-3 px-4">Hours</th>
                <th className="py-3 px-4">Remarks</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-gray-400">
                    Loading session roster...
                  </td>
                </tr>
              ) : !rosterData?.roster || rosterData.roster.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-gray-400">
                    No confirmed enrollments found for this training session.
                  </td>
                </tr>
              ) : (
                rosterData.roster.map((item: any) => {
                  const empId = item.employee.id;
                  const current = attendanceMap[empId] || { status: 'PRESENT', hours: 8, remarks: '' };

                  return (
                    <tr key={empId} className="hover:bg-gray-50/60 transition-colors">
                      <td className="py-3 px-4">
                        <div className="font-semibold text-gray-900">{item.employee.fullName}</div>
                        <div className="text-xs text-gray-400">{item.employee.employeeNumber}</div>
                      </td>
                      <td className="py-3 px-4 text-xs text-gray-600">
                        {item.employee.department?.name || 'Security'} • {item.employee.station?.name || 'HQ'}
                      </td>
                      <td className="py-3 px-4">
                        <select
                          value={current.status}
                          onChange={(e) => handleStatusChange(empId, e.target.value)}
                          className="px-2.5 py-1 text-xs border border-gray-300 rounded-md bg-white font-medium focus:outline-none"
                        >
                          <option value="PRESENT">Present</option>
                          <option value="PARTIAL">Partial Day</option>
                          <option value="ABSENT">Absent</option>
                          <option value="EXCUSED">Excused</option>
                          <option value="NO_SHOW">No Show</option>
                        </select>
                      </td>
                      <td className="py-3 px-4">
                        <input
                          type="number"
                          min="0"
                          max="24"
                          value={current.hours}
                          onChange={(e) =>
                            setAttendanceMap((prev) => ({
                              ...prev,
                              [empId]: { ...prev[empId], hours: Number(e.target.value) },
                            }))
                          }
                          className="w-16 px-2 py-1 text-xs border border-gray-300 rounded-md text-center focus:outline-none"
                        />
                      </td>
                      <td className="py-3 px-4">
                        <input
                          type="text"
                          placeholder="Optional remarks..."
                          value={current.remarks}
                          onChange={(e) =>
                            setAttendanceMap((prev) => ({
                              ...prev,
                              [empId]: { ...prev[empId], remarks: e.target.value },
                            }))
                          }
                          className="w-full px-2 py-1 text-xs border border-gray-300 rounded-md focus:outline-none"
                        />
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
