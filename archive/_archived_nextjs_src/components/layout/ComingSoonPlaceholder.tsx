'use client';

import React from 'react';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Breadcrumb } from './Breadcrumb';
import { ShieldCheck, Calendar, FileText, Clock, Users, ArrowRight } from 'lucide-react';
import Link from 'next/link';

export interface ComingSoonPlaceholderProps {
  moduleName: string;
  plannedPhase: string;
  description: string;
  plannedFeatures: string[];
  icon?: React.ReactNode;
}

export function ComingSoonPlaceholder({
  moduleName,
  plannedPhase,
  description,
  plannedFeatures,
  icon,
}: ComingSoonPlaceholderProps) {
  return (
    <div>
      <Breadcrumb items={[{ label: moduleName }]} />

      <div style={{ maxWidth: '800px', margin: '0 auto', paddingTop: '1.5rem' }}>
        <Card noPadding>
          <div
            style={{
              padding: '2.5rem 2rem',
              backgroundColor: '#ffffff',
              borderBottom: '1px solid #e2e8f0',
              textAlign: 'center',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '1rem',
            }}
          >
            <div
              style={{
                width: '64px',
                height: '64px',
                borderRadius: '16px',
                backgroundColor: '#f1f5f9',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#0f1c3f',
                boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)',
              }}
            >
              {icon || <ShieldCheck size={32} />}
            </div>

            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                <Badge variant="gold" size="md">
                  Planned for {plannedPhase}
                </Badge>
                <Badge variant="neutral" size="md">
                  Foundation Ready
                </Badge>
              </div>
              <h2 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#0f1c3f' }}>
                {moduleName}
              </h2>
              <p style={{ color: '#64748b', fontSize: '0.9375rem', marginTop: '0.35rem', maxWidth: '520px' }}>
                {description}
              </p>
            </div>
          </div>

          <div style={{ padding: '2rem' }}>
            <h4
              style={{
                fontSize: '0.875rem',
                fontWeight: 700,
                color: '#334155',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                marginBottom: '1rem',
              }}
            >
              Architectural Roadmap & Scope for this Module:
            </h4>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                gap: '0.875rem',
              }}
            >
              {plannedFeatures.map((feat, idx) => (
                <div
                  key={idx}
                  style={{
                    padding: '0.875rem 1rem',
                    backgroundColor: '#f8fafc',
                    borderRadius: '8px',
                    border: '1px solid #e2e8f0',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.75rem',
                    fontSize: '0.875rem',
                    color: '#334155',
                    fontWeight: 500,
                  }}
                >
                  <div
                    style={{
                      width: '8px',
                      height: '8px',
                      borderRadius: '50%',
                      backgroundColor: '#0f1c3f',
                    }}
                  />
                  <span>{feat}</span>
                </div>
              ))}
            </div>

            <div
              style={{
                marginTop: '2rem',
                padding: '1.25rem',
                backgroundColor: '#eff6ff',
                borderRadius: '8px',
                border: '1px solid #bfdbfe',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '1rem',
              }}
            >
              <div>
                <strong style={{ fontSize: '0.875rem', color: '#1e40af', display: 'block' }}>
                  Phase 1 Foundation Rule:
                </strong>
                <span style={{ fontSize: '0.8125rem', color: '#1e3a8a' }}>
                  No fake calculations or mock records are displayed until the engine is built in its dedicated phase.
                </span>
              </div>
              <Link
                href="/"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.375rem',
                  fontSize: '0.8125rem',
                  fontWeight: 600,
                  color: '#1e40af',
                }}
              >
                <span>Return to Dashboard</span>
                <ArrowRight size={14} />
              </Link>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
