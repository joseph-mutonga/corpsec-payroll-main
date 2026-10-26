'use client';

import React from 'react';
import { Loader2 } from 'lucide-react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'danger' | 'ghost' | 'gold';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  fullWidth?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      children,
      variant = 'primary',
      size = 'md',
      isLoading = false,
      leftIcon,
      rightIcon,
      fullWidth = false,
      disabled,
      style,
      className,
      ...props
    },
    ref
  ) => {
    // Base size styles
    const sizeStyles = {
      sm: {
        padding: '0.4rem 0.75rem',
        fontSize: '0.8125rem',
        gap: '0.375rem',
        borderRadius: '6px',
      },
      md: {
        padding: '0.55rem 1rem',
        fontSize: '0.875rem',
        gap: '0.5rem',
        borderRadius: '8px',
      },
      lg: {
        padding: '0.75rem 1.35rem',
        fontSize: '1rem',
        gap: '0.625rem',
        borderRadius: '10px',
      },
    }[size];

    // Variant color styles
    const variantStyles = {
      primary: {
        backgroundColor: '#0f1c3f',
        color: '#ffffff',
        border: '1px solid #0a1128',
      },
      secondary: {
        backgroundColor: '#f1f5f9',
        color: '#1e293b',
        border: '1px solid #cbd5e1',
      },
      outline: {
        backgroundColor: 'transparent',
        color: '#1e293b',
        border: '1px solid #cbd5e1',
      },
      danger: {
        backgroundColor: '#dc2626',
        color: '#ffffff',
        border: '1px solid #b91c1c',
      },
      ghost: {
        backgroundColor: 'transparent',
        color: '#475569',
        border: '1px solid transparent',
      },
      gold: {
        backgroundColor: '#d4a34b',
        color: '#0a1128',
        border: '1px solid #b88628',
        fontWeight: 600,
      },
    }[variant];

    const isDisabled = disabled || isLoading;

    return (
      <button
        ref={ref}
        disabled={isDisabled}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontWeight: 500,
          cursor: isDisabled ? 'not-allowed' : 'pointer',
          opacity: isDisabled ? 0.65 : 1,
          transition: 'all 0.15s ease-in-out',
          outline: 'none',
          width: fullWidth ? '100%' : 'auto',
          ...sizeStyles,
          ...variantStyles,
          ...style,
        }}
        className={className}
        {...props}
      >
        {isLoading ? (
          <Loader2
            size={size === 'sm' ? 14 : size === 'lg' ? 18 : 16}
            style={{ animation: 'spin 1s linear infinite' }}
          />
        ) : (
          leftIcon
        )}
        <span>{children}</span>
        {!isLoading && rightIcon}
      </button>
    );
  }
);

Button.displayName = 'Button';
