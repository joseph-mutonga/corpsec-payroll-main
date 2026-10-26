'use client';

import React from 'react';

export interface Option {
  value: string;
  label: string;
}

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  options: Option[];
  helperText?: string;
  error?: string;
  requiredIndicator?: boolean;
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  (
    {
      label,
      options,
      helperText,
      error,
      requiredIndicator,
      id,
      style,
      disabled,
      className,
      ...props
    },
    ref
  ) => {
    const selectId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem', width: '100%' }}>
        {label && (
          <label
            htmlFor={selectId}
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
        <select
          id={selectId}
          ref={ref}
          disabled={disabled}
          style={{
            width: '100%',
            padding: '0.55rem 0.875rem',
            fontSize: '0.875rem',
            color: '#0f172a',
            backgroundColor: disabled ? '#f8fafc' : '#ffffff',
            border: `1px solid ${error ? '#ef4444' : '#cbd5e1'}`,
            borderRadius: '8px',
            outline: 'none',
            cursor: disabled ? 'not-allowed' : 'pointer',
            ...style,
          }}
          className={className}
          {...props}
        >
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        {error ? (
          <span style={{ fontSize: '0.75rem', color: '#dc2626', fontWeight: 500 }}>{error}</span>
        ) : helperText ? (
          <span style={{ fontSize: '0.75rem', color: '#64748b' }}>{helperText}</span>
        ) : null}
      </div>
    );
  }
);

Select.displayName = 'Select';
