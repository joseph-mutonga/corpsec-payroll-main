'use client';

import React from 'react';
import { Loader2 } from 'lucide-react';

export interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  fullHeight?: boolean;
  message?: string;
}

export function Spinner({ size = 'md', fullHeight = false, message }: SpinnerProps) {
  const pixelSize = {
    sm: 16,
    md: 24,
    lg: 36,
    xl: 48,
  }[size];

  const content = (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '0.75rem',
        color: '#0f1c3f',
      }}
    >
      <Loader2
        size={pixelSize}
        style={{
          animation: 'spin 1s linear infinite',
          color: '#0f1c3f',
        }}
      />
      {message && (
        <span style={{ fontSize: '0.875rem', color: '#64748b', fontWeight: 500 }}>
          {message}
        </span>
      )}
    </div>
  );

  if (fullHeight) {
    return (
      <div
        style={{
          minHeight: '300px',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '100%',
        }}
      >
        {content}
      </div>
    );
  }

  return content;
}
