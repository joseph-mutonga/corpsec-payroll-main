'use client';

import React from 'react';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  helperText?: string;
  error?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  requiredIndicator?: boolean;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  (
    {
      label,
      helperText,
      error,
      leftIcon,
      rightIcon,
      requiredIndicator,
      id,
      style,
      disabled,
      className,
      ...props
    },
    ref
  ) => {
    const inputId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem', width: '100%' }}>
        {label && (
          <label
            htmlFor={inputId}
            style={{
              fontSize: '0.8125rem',
              fontWeight: 600,
              color: '#334155',
              display: 'flex',
              alignItems: 'center',
              gap: '0.25rem',
            }}
          >
            {label}
            {requiredIndicator && <span style={{ color: '#dc2626' }}>*</span>}
          </label>
        )}
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', width: '100%' }}>
          {leftIcon && (
            <div
              style={{
                position: 'absolute',
                left: '0.75rem',
                display: 'flex',
                alignItems: 'center',
                color: '#64748b',
                pointerEvents: 'none',
              }}
            >
              {leftIcon}
            </div>
          )}
          <input
            id={inputId}
            ref={ref}
            disabled={disabled}
            style={{
              width: '100%',
              paddingTop: '0.55rem',
              paddingBottom: '0.55rem',
              paddingLeft: leftIcon ? '2.5rem' : '0.875rem',
              paddingRight: rightIcon ? '2.5rem' : '0.875rem',
              fontSize: '0.875rem',
              color: '#0f172a',
              backgroundColor: disabled ? '#f8fafc' : '#ffffff',
              border: `1px solid ${error ? '#ef4444' : '#cbd5e1'}`,
              borderRadius: '8px',
              outline: 'none',
              transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
              ...style,
            }}
            className={className}
            {...props}
          />
          {rightIcon && (
            <div
              style={{
                position: 'absolute',
                right: '0.75rem',
                display: 'flex',
                alignItems: 'center',
                color: '#64748b',
              }}
            >
              {rightIcon}
            </div>
          )}
        </div>
        {error ? (
          <span style={{ fontSize: '0.75rem', color: '#dc2626', fontWeight: 500 }}>{error}</span>
        ) : helperText ? (
          <span style={{ fontSize: '0.75rem', color: '#64748b' }}>{helperText}</span>
        ) : null}
      </div>
    );
  }
);

Input.displayName = 'Input';
