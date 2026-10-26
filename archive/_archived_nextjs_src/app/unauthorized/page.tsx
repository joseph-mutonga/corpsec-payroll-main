import React from 'react';
import Link from 'next/link';
import { ShieldX, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/Button';

export default function UnauthorizedPage() {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#0a1128',
        padding: '1.5rem',
      }}
    >
      <div
        style={{
          maxWidth: '480px',
          width: '100%',
          backgroundColor: '#ffffff',
          borderRadius: '16px',
          padding: '2.5rem 2rem',
          textAlign: 'center',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.35)',
        }}
      >
        <div
          style={{
            width: '64px',
            height: '64px',
            borderRadius: '50%',
            backgroundColor: '#fee2e2',
            color: '#dc2626',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 1.5rem auto',
          }}
        >
          <ShieldX size={32} />
        </div>

        <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0f1c3f', marginBottom: '0.5rem' }}>
          403 — Access Denied
        </h1>
        <p style={{ fontSize: '0.875rem', color: '#64748b', marginBottom: '2rem', lineHeight: 1.6 }}>
          You do not have the required permissions or role to access this module. Please contact your CorpSec system administrator if you believe this is in error.
        </p>

        <Link href="/" style={{ textDecoration: 'none' }}>
          <Button variant="primary" size="md" fullWidth leftIcon={<ArrowLeft size={16} />}>
            Return to Dashboard
          </Button>
        </Link>
      </div>
    </div>
  );
}
