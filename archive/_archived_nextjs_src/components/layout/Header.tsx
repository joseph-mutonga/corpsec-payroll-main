'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Menu,
  Bell,
  User as UserIcon,
  LogOut,
  Settings,
  Shield,
  ChevronDown,
  Globe,
  Clock,
} from 'lucide-react';
import { UserSession } from '@/types';
import { Badge } from '../ui/Badge';
import Link from 'next/link';

export function Header({
  session,
  onToggleSidebar,
}: {
  session: UserSession | null;
  onToggleSidebar: () => void;
}) {
  const router = useRouter();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLogout = async () => {
    try {
      setIsLoggingOut(true);
      await fetch('/api/auth/logout', { method: 'POST' });
      router.push('/login');
      router.refresh();
    } catch (err) {
      console.error('Logout failed:', err);
    } finally {
      setIsLoggingOut(false);
    }
  };

  const primaryRole = session?.roles[0] || 'employee';
  const roleDisplay = primaryRole.replace(/_/g, ' ').toUpperCase();

  return (
    <header
      style={{
        height: '64px',
        backgroundColor: '#ffffff',
        borderBottom: '1px solid #e2e8f0',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 1.75rem',
        position: 'sticky',
        top: 0,
        zIndex: 30,
      }}
    >
      {/* Left: Mobile Toggle & Context */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <button
          onClick={onToggleSidebar}
          style={{
            background: 'none',
            border: 'none',
            color: '#475569',
            cursor: 'pointer',
            padding: '0.375rem',
            borderRadius: '6px',
            display: 'flex',
            alignItems: 'center',
          }}
          aria-label="Toggle navigation"
        >
          <Menu size={20} />
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <span style={{ fontSize: '0.875rem', fontWeight: 700, color: '#0f172a' }}>
            CorpSec Investigations & Guarding Services
          </span>
          <span style={{ color: '#cbd5e1' }}>|</span>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.35rem',
              fontSize: '0.75rem',
              color: '#64748b',
            }}
          >
            <Clock size={13} />
            <span>Nairobi (EAT, UTC+3)</span>
          </div>
        </div>
      </div>

      {/* Right: Status, Role & Profile Dropdown */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
        {/* System Status Pill */}
        <Badge variant="success" size="sm" dot>
          System Active
        </Badge>

        {/* User Profile Dropdown */}
        <div style={{ position: 'relative' }} ref={dropdownRef}>
          <button
            onClick={() => setDropdownOpen((prev) => !prev)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.625rem',
              background: 'none',
              border: '1px solid #e2e8f0',
              borderRadius: '8px',
              padding: '0.35rem 0.625rem',
              cursor: 'pointer',
              transition: 'background-color 0.15s ease',
            }}
          >
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '50%',
                backgroundColor: '#0f1c3f',
                color: '#ffffff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 700,
                fontSize: '0.8125rem',
              }}
            >
              {session?.firstName ? session.firstName[0] : 'U'}
              {session?.lastName ? session.lastName[0] : 'S'}
            </div>

            <div style={{ textAlign: 'left', display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#0f172a', lineHeight: 1.2 }}>
                {session?.firstName} {session?.lastName}
              </span>
              <span style={{ fontSize: '0.6875rem', color: '#64748b', textTransform: 'capitalize' }}>
                {primaryRole.replace(/_/g, ' ')}
              </span>
            </div>

            <ChevronDown size={14} color="#64748b" />
          </button>

          {/* Dropdown Menu */}
          {dropdownOpen && (
            <div
              className="animate-fade-in"
              style={{
                position: 'absolute',
                top: 'calc(100% + 6px)',
                right: 0,
                width: '240px',
                backgroundColor: '#ffffff',
                border: '1px solid #e2e8f0',
                borderRadius: '10px',
                boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
                zIndex: 100,
                padding: '0.5rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.25rem',
              }}
            >
              {/* User Summary Info */}
              <div
                style={{
                  padding: '0.625rem 0.75rem',
                  borderBottom: '1px solid #f1f5f9',
                  marginBottom: '0.25rem',
                }}
              >
                <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#0f172a' }}>
                  {session?.firstName} {session?.lastName}
                </div>
                <div style={{ fontSize: '0.75rem', color: '#64748b', wordBreak: 'break-all' }}>
                  {session?.email}
                </div>
                <div style={{ marginTop: '0.4rem' }}>
                  <Badge variant="gold" size="sm">
                    {roleDisplay}
                  </Badge>
                </div>
              </div>

              {/* Links */}
              <Link
                href="/settings"
                onClick={() => setDropdownOpen(false)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.625rem',
                  padding: '0.5rem 0.75rem',
                  fontSize: '0.8125rem',
                  color: '#334155',
                  borderRadius: '6px',
                  textDecoration: 'none',
                  transition: 'background-color 0.15s ease',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#f8fafc')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
              >
                <Settings size={15} color="#64748b" />
                <span>Company Settings</span>
              </Link>

              <Link
                href="/users"
                onClick={() => setDropdownOpen(false)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.625rem',
                  padding: '0.5rem 0.75rem',
                  fontSize: '0.8125rem',
                  color: '#334155',
                  borderRadius: '6px',
                  textDecoration: 'none',
                  transition: 'background-color 0.15s ease',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#f8fafc')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
              >
                <Shield size={15} color="#64748b" />
                <span>User Roles & Access</span>
              </Link>

              <div style={{ height: '1px', backgroundColor: '#f1f5f9', margin: '0.25rem 0' }} />

              {/* Logout Button */}
              <button
                onClick={handleLogout}
                disabled={isLoggingOut}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.625rem',
                  padding: '0.5rem 0.75rem',
                  fontSize: '0.8125rem',
                  color: '#dc2626',
                  borderRadius: '6px',
                  border: 'none',
                  backgroundColor: 'transparent',
                  cursor: 'pointer',
                  width: '100%',
                  textAlign: 'left',
                  transition: 'background-color 0.15s ease',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#fee2e2')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
              >
                <LogOut size={15} color="#dc2626" />
                <span>{isLoggingOut ? 'Signing out...' : 'Sign Out'}</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
