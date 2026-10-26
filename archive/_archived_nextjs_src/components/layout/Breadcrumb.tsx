'use client';

import React from 'react';
import Link from 'next/link';
import { ChevronRight, Home } from 'lucide-react';

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

export function Breadcrumb({ items }: { items: BreadcrumbItem[] }) {
  return (
    <nav
      aria-label="Breadcrumb"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
        fontSize: '0.8125rem',
        color: '#64748b',
        marginBottom: '1rem',
      }}
    >
      <Link
        href="/"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.25rem',
          color: '#64748b',
          transition: 'color 0.15s ease',
        }}
      >
        <Home size={14} />
        <span>Home</span>
      </Link>

      {items.map((item, idx) => (
        <React.Fragment key={idx}>
          <ChevronRight size={13} color="#94a3b8" />
          {item.href && idx < items.length - 1 ? (
            <Link href={item.href} style={{ color: '#64748b', transition: 'color 0.15s ease' }}>
              {item.label}
            </Link>
          ) : (
            <span style={{ color: '#0f172a', fontWeight: 600 }}>{item.label}</span>
          )}
        </React.Fragment>
      ))}
    </nav>
  );
}
