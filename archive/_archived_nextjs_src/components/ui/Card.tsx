'use client';

import React from 'react';

export interface CardProps {
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
  action?: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  bodyStyle?: React.CSSProperties;
  noPadding?: boolean;
  hoverable?: boolean;
  onClick?: (e?: any) => void;
}

export function Card({
  children,
  title,
  subtitle,
  action,
  footer,
  className,
  style,
  bodyStyle,
  noPadding = false,
  hoverable = false,
  onClick,
}: CardProps) {
  return (
    <div
      style={{
        backgroundColor: '#ffffff',
        border: '1px solid #e2e8f0',
        borderRadius: '12px',
        boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.05)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        ...style,
      }}
      className={className}
      onClick={onClick}
    >
      {(title || subtitle || action) && (
        <div
          style={{
            padding: '1.25rem 1.5rem',
            borderBottom: '1px solid #f1f5f9',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '1rem',
          }}
        >
          <div>
            {title && (
              <h3 style={{ fontSize: '1rem', fontWeight: 600, color: '#0f172a' }}>{title}</h3>
            )}
            {subtitle && (
              <p style={{ fontSize: '0.8125rem', color: '#64748b', marginTop: '0.15rem' }}>
                {subtitle}
              </p>
            )}
          </div>
          {action && <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>{action}</div>}
        </div>
      )}

      <div
        style={{
          padding: noPadding ? 0 : '1.5rem',
          flex: 1,
          ...bodyStyle,
        }}
      >
        {children}
      </div>

      {footer && (
        <div
          style={{
            padding: '0.875rem 1.5rem',
            backgroundColor: '#f8fafc',
            borderTop: '1px solid #f1f5f9',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: '0.75rem',
          }}
        >
          {footer}
        </div>
      )}
    </div>
  );
}
