'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Clock,
  MapPin,
  Video,
  Users,
} from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';

export default function TrainingCalendarPage() {
  const [sessions, setSessions] = useState<any[]>([]);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/training/sessions')
      .then((res) => res.json())
      .then((json) => {
        if (json.success) setSessions(json.data.sessions || []);
      })
      .finally(() => setLoading(false));
  }, []);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const firstDayIndex = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
  const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1));
  const today = () => setCurrentDate(new Date());

  const getSessionsForDay = (day: number) => {
    return sessions.filter((s) => {
      const start = new Date(s.startDate);
      return (
        start.getFullYear() === year &&
        start.getMonth() === month &&
        start.getDate() === day
      );
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <CalendarIcon className="h-6 w-6 text-indigo-600" />
            Training Schedule Calendar
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Visual month-by-month schedule of scheduled classroom cohorts, tactical range drills, and online webinars
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={today}>Today</Button>
          <Button variant="outline" size="sm" onClick={prevMonth}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="font-bold text-sm text-gray-900 px-3">
            {monthNames[month]} {year}
          </span>
          <Button variant="outline" size="sm" onClick={nextMonth}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Calendar Grid Card */}
      <Card className="p-5 overflow-hidden">
        {/* Days Header */}
        <div className="grid grid-cols-7 gap-px text-center text-xs font-bold text-gray-500 uppercase tracking-wider py-2 bg-gray-50 border-b border-gray-200">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
            <div key={d}>{d}</div>
          ))}
        </div>

        {/* Day Cells */}
        <div className="grid grid-cols-7 gap-px bg-gray-200 border border-gray-200">
          {/* Empty prefix cells */}
          {Array.from({ length: firstDayIndex }).map((_, i) => (
            <div key={`empty-${i}`} className="bg-gray-50/50 min-h-[110px] p-2" />
          ))}

          {/* Day Cells */}
          {Array.from({ length: daysInMonth }).map((_, i) => {
            const day = i + 1;
            const daySessions = getSessionsForDay(day);
            const isToday =
              new Date().getDate() === day &&
              new Date().getMonth() === month &&
              new Date().getFullYear() === year;

            return (
              <div
                key={`day-${day}`}
                className={`bg-white min-h-[110px] p-2 transition-colors flex flex-col justify-between ${
                  isToday ? 'bg-indigo-50/30' : ''
                }`}
              >
                <div className="flex justify-between items-center">
                  <span
                    className={`text-xs font-bold ${
                      isToday
                        ? 'bg-indigo-600 text-white w-6 h-6 rounded-full flex items-center justify-center'
                        : 'text-gray-700'
                    }`}
                  >
                    {day}
                  </span>
                  {daySessions.length > 0 && (
                    <span className="text-[10px] text-gray-400 font-medium">
                      {daySessions.length} session{daySessions.length > 1 ? 's' : ''}
                    </span>
                  )}
                </div>

                <div className="space-y-1 mt-1.5 overflow-y-auto max-h-[80px]">
                  {daySessions.map((s) => (
                    <Link
                      key={s.id}
                      href={`/training/sessions`}
                      className="block p-1 bg-indigo-50 hover:bg-indigo-100 rounded text-[11px] font-semibold text-indigo-900 truncate border-l-2 border-indigo-500"
                    >
                      {s.course?.title || s.sessionNumber}
                    </Link>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
