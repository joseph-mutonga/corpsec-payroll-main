'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Shield, Lock, Mail, AlertCircle, ArrowRight, CheckCircle2 } from 'lucide-react';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { useToast } from '@/components/ui/ToastContext';

export default function LoginPage() {
  const router = useRouter();
  const { success, error: toastError } = useToast();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setIsLoading(true);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        const msg = data.error?.message || 'Authentication failed. Please check your credentials.';
        setErrorMessage(msg);
        toastError('Login Failed', msg);
        setIsLoading(false);
        return;
      }

      success('Login Successful', `Welcome back, ${data.data.user.firstName}!`);
      router.push('/');
      router.refresh();
    } catch (err) {
      const msg = 'Network or connection error. Please try again.';
      setErrorMessage(msg);
      toastError('Connection Error', msg);
      setIsLoading(false);
    }
  };

  const setDemoUser = (demoEmail: string, demoPass: string) => {
    setEmail(demoEmail);
    setPassword(demoPass);
    setErrorMessage(null);
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: '#0a1128',
        backgroundImage: 'radial-gradient(ellipse 80% 80% at 50% -20%, rgba(42, 63, 117, 0.4), rgba(10, 17, 40, 0.9))',
      }}
    >
      {/* Top Corporate Nav Header */}
      <header
        style={{
          padding: '1.25rem 2.5rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '8px',
              backgroundColor: '#d4a34b',
              color: '#0a1128',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 800,
              fontSize: '1.125rem',
            }}
          >
            CS
          </div>
          <div>
            <div style={{ color: '#ffffff', fontWeight: 800, fontSize: '0.9375rem', letterSpacing: '0.02em' }}>
              CorpSec HR Payroll
            </div>
            <div style={{ color: '#94a3b8', fontSize: '0.6875rem' }}>
              CorpSec Investigations & Guarding Services
            </div>
          </div>
        </div>

        <Badge variant="gold" size="sm">
          Kenya Edition
        </Badge>
      </header>

      {/* Main Login Form Area */}
      <main
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '2rem 1.5rem',
        }}
      >
        <div
          className="animate-fade-in"
          style={{
            maxWidth: '460px',
            width: '100%',
            backgroundColor: '#ffffff',
            borderRadius: '16px',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.35)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            overflow: 'hidden',
          }}
        >
          {/* Card Header */}
          <div
            style={{
              padding: '2rem 2rem 1.5rem 2rem',
              textAlign: 'center',
              borderBottom: '1px solid #f1f5f9',
            }}
          >
            <div
              style={{
                width: '48px',
                height: '48px',
                borderRadius: '12px',
                backgroundColor: '#f1f5f9',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#0f1c3f',
                margin: '0 auto 1rem auto',
              }}
            >
              <Shield size={24} />
            </div>
            <h1 style={{ fontSize: '1.375rem', fontWeight: 800, color: '#0f1c3f' }}>
              Account Sign In
            </h1>
            <p style={{ fontSize: '0.8125rem', color: '#64748b', marginTop: '0.35rem' }}>
              Secure HR & Payroll Portal Authentication
            </p>
          </div>

          {/* Card Body */}
          <div style={{ padding: '1.75rem 2rem' }}>
            {errorMessage && (
              <div
                style={{
                  padding: '0.75rem 1rem',
                  backgroundColor: '#fef2f2',
                  border: '1px solid #fecaca',
                  borderRadius: '8px',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '0.625rem',
                  marginBottom: '1.25rem',
                  fontSize: '0.8125rem',
                  color: '#991b1b',
                }}
              >
                <AlertCircle size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
                <span>{errorMessage}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <Input
                label="Corporate Email Address"
                type="email"
                required
                placeholder="name@corpsec.co.ke"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                leftIcon={<Mail size={16} />}
                disabled={isLoading}
              />

              <Input
                label="Account Password"
                type="password"
                required
                placeholder="••••••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                leftIcon={<Lock size={16} />}
                disabled={isLoading}
              />

              <Button
                type="submit"
                variant="primary"
                size="lg"
                fullWidth
                isLoading={isLoading}
                rightIcon={<ArrowRight size={16} />}
              >
                Sign In to Platform
              </Button>
            </form>

            {/* Safe Development Credentials Selector */}
            <div
              style={{
                marginTop: '1.75rem',
                padding: '1rem',
                backgroundColor: '#f8fafc',
                borderRadius: '8px',
                border: '1px solid #e2e8f0',
              }}
            >
              <div
                style={{
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  color: '#475569',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  marginBottom: '0.625rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                }}
              >
                <CheckCircle2 size={13} color="#059669" />
                <span>Development Seed Accounts (Quick Fill):</span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                <button
                  type="button"
                  onClick={() => setDemoUser('admin@corpsec.co.ke', 'Admin@CorpSec2026!')}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '0.35rem 0.5rem',
                    background: '#ffffff',
                    border: '1px solid #cbd5e1',
                    borderRadius: '5px',
                    fontSize: '0.75rem',
                    color: '#0f172a',
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  <span><strong>Super Admin</strong> (admin@corpsec.co.ke)</span>
                  <span style={{ color: '#64748b', fontSize: '0.6875rem' }}>Click to fill</span>
                </button>

                <button
                  type="button"
                  onClick={() => setDemoUser('hr.admin@corpsec.co.ke', 'HrAdmin@CorpSec2026!')}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '0.35rem 0.5rem',
                    background: '#ffffff',
                    border: '1px solid #cbd5e1',
                    borderRadius: '5px',
                    fontSize: '0.75rem',
                    color: '#0f172a',
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  <span><strong>HR Admin</strong> (hr.admin@corpsec.co.ke)</span>
                  <span style={{ color: '#64748b', fontSize: '0.6875rem' }}>Click to fill</span>
                </button>

                <button
                  type="button"
                  onClick={() => setDemoUser('payroll@corpsec.co.ke', 'Payroll@CorpSec2026!')}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '0.35rem 0.5rem',
                    background: '#ffffff',
                    border: '1px solid #cbd5e1',
                    borderRadius: '5px',
                    fontSize: '0.75rem',
                    color: '#0f172a',
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  <span><strong>Payroll Officer</strong> (payroll@corpsec.co.ke)</span>
                  <span style={{ color: '#64748b', fontSize: '0.6875rem' }}>Click to fill</span>
                </button>
              </div>
            </div>
          </div>

          {/* Card Footer */}
          <div
            style={{
              padding: '0.875rem 2rem',
              backgroundColor: '#f8fafc',
              borderTop: '1px solid #f1f5f9',
              textAlign: 'center',
              fontSize: '0.75rem',
              color: '#64748b',
            }}
          >
            CorpSec Investigations & Guarding Services &bull; Phase 1 Architecture
          </div>
        </div>
      </main>
    </div>
  );
}
