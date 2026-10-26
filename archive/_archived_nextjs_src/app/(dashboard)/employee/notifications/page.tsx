'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Bell,
  CheckCircle2,
  AlertCircle,
  Clock,
  ShieldCheck,
  CheckCheck,
  ExternalLink,
} from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/Spinner';
import { useToast } from '@/components/ui/ToastContext';

export default function EmployeeNotificationsPage() {
  const { toast } = useToast();
  const [notifications, setNotifications] = useState<any[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [filterUnread, setFilterUnread] = useState(false);

  useEffect(() => {
    fetchNotifications();
  }, []);

  const fetchNotifications = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/portal/notifications');
      const data = await res.json();
      if (data.success) {
        setNotifications(data.data.notifications || []);
        setUnreadCount(data.data.unreadCount || 0);
      } else {
        toast.error('Error', data.message || 'Failed to load notifications');
      }
    } catch (err) {
      toast.error('Error', 'Unable to connect to notifications service');
    } finally {
      setIsLoading(false);
    }
  };

  const handleMarkAsRead = async (id: string) => {
    try {
      const res = await fetch(`/api/portal/notifications/${id}/read`, {
        method: 'PATCH',
      });
      if (res.ok) {
        setNotifications((prev) =>
          prev.map((n) => (n.id === id ? { ...n, isRead: true } : n))
        );
        setUnreadCount((c) => Math.max(0, c - 1));
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleMarkAllRead = async () => {
    try {
      const res = await fetch('/api/portal/notifications/read-all', {
        method: 'POST',
      });
      if (res.ok) {
        setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
        setUnreadCount(0);
        toast.success('Updated', 'All notifications marked as read');
      }
    } catch (err) {
      toast.error('Error', 'Failed to update notifications');
    }
  };

  const displayList = filterUnread
    ? notifications.filter((n) => !n.isRead)
    : notifications;

  if (isLoading) {
    return (
      <div style={{ padding: '3rem 1rem', textAlign: 'center' }}>
        <Spinner fullHeight message="Loading your system notifications..." />
      </div>
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
            Notifications & HR Advisories
          </h1>
          <p style={{ fontSize: '0.85rem', color: '#64748b', marginTop: '0.25rem' }}>
            Real-time status updates on your leave, support requests, payslips, and payroll disbursements.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <Button
            variant={filterUnread ? 'primary' : 'secondary'}
            size="sm"
            onClick={() => setFilterUnread(!filterUnread)}
          >
            {filterUnread ? 'Show All' : `Unread Only (${unreadCount})`}
          </Button>

          {unreadCount > 0 && (
            <Button
              variant="secondary"
              size="sm"
              leftIcon={<CheckCheck size={16} />}
              onClick={handleMarkAllRead}
            >
              Mark All as Read
            </Button>
          )}
        </div>
      </div>

      {displayList.length === 0 ? (
        <Card>
          <div style={{ textAlign: 'center', padding: '3rem 1rem', color: '#64748b' }}>
            <Bell size={40} color="#94a3b8" style={{ marginBottom: '1rem' }} />
            <h3 style={{ fontSize: '1.15rem', color: '#0f172a' }}>No Notifications</h3>
            <p style={{ fontSize: '0.85rem', marginTop: '0.25rem' }}>
              {filterUnread ? 'You have no unread notifications.' : 'You are completely caught up!'}
            </p>
          </div>
        </Card>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {displayList.map((notif) => (
            <Card
              key={notif.id}
              style={{
                backgroundColor: notif.isRead ? '#ffffff' : '#f0f9ff',
                borderLeft: notif.isRead ? '1px solid #e2e8f0' : '4px solid #0284c7',
                transition: 'all 0.15s ease',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem' }}>
                <div style={{ display: 'flex', gap: '0.85rem', flex: 1 }}>
                  <div
                    style={{
                      width: '36px',
                      height: '36px',
                      borderRadius: '50%',
                      backgroundColor:
                        notif.type === 'success'
                          ? '#f0fdf4'
                          : notif.type === 'alert'
                          ? '#fef2f2'
                          : '#e0f2fe',
                      color:
                        notif.type === 'success'
                          ? '#16a34a'
                          : notif.type === 'alert'
                          ? '#dc2626'
                          : '#0284c7',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    {notif.type === 'success' ? (
                      <CheckCircle2 size={20} />
                    ) : notif.type === 'alert' ? (
                      <AlertCircle size={20} />
                    ) : (
                      <Bell size={20} />
                    )}
                  </div>

                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                      <strong style={{ color: '#0f172a', fontSize: '0.95rem' }}>{notif.title}</strong>
                      {!notif.isRead && (
                        <Badge variant="info" size="sm">New</Badge>
                      )}
                    </div>
                    <div style={{ color: '#334155', fontSize: '0.85rem', marginTop: '0.25rem' }}>
                      {notif.message}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.4rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                      <span>{new Date(notif.createdAt).toLocaleString()}</span>
                      {notif.link && (
                        <Link href={notif.link} style={{ color: '#0284c7', textDecoration: 'none', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '0.2rem' }}>
                          <span>Open details</span>
                          <ExternalLink size={12} />
                        </Link>
                      )}
                    </div>
                  </div>
                </div>

                {!notif.isRead && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleMarkAsRead(notif.id)}
                  >
                    Mark as read
                  </Button>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
