'use client';

import React, { createContext, useContext, useState, useCallback } from 'react';
import { CheckCircle2, AlertTriangle, XCircle, Info, X } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface ToastItem {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
  duration?: number;
}

export type ToastFunction = ((options: {
  title: string;
  message?: string;
  type?: ToastType;
  duration?: number;
}) => void) & {
  success: (title: string, message?: string) => void;
  error: (title: string, message?: string) => void;
  warning: (title: string, message?: string) => void;
  info: (title: string, message?: string) => void;
};

interface ToastContextValue {
  showToast: (toast: Omit<ToastItem, 'id'>) => void;
  success: (title: string, message?: string) => void;
  error: (title: string, message?: string) => void;
  warning: (title: string, message?: string) => void;
  info: (title: string, message?: string) => void;
  removeToast: (id: string) => void;
  toast: ToastFunction;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback(
    ({ type, title, message, duration = 4000 }: Omit<ToastItem, 'id'>) => {
      const id = Math.random().toString(36).substring(2, 9);
      setToasts((prev) => [...prev, { id, type, title, message, duration }]);

      if (duration > 0) {
        setTimeout(() => {
          removeToast(id);
        }, duration);
      }
    },
    [removeToast]
  );

  const success = useCallback(
    (title: string, message?: string) => showToast({ type: 'success', title, message }),
    [showToast]
  );
  const error = useCallback(
    (title: string, message?: string) => showToast({ type: 'error', title, message, duration: 6000 }),
    [showToast]
  );
  const warning = useCallback(
    (title: string, message?: string) => showToast({ type: 'warning', title, message }),
    [showToast]
  );
  const info = useCallback(
    (title: string, message?: string) => showToast({ type: 'info', title, message }),
    [showToast]
  );

  const toastObj: any = useCallback(
    (opts: { title: string; message?: string; type?: ToastType; duration?: number }) => {
      showToast({
        type: opts.type || 'info',
        title: opts.title,
        message: opts.message,
        duration: opts.duration,
      });
    },
    [showToast]
  );
  toastObj.success = success;
  toastObj.error = error;
  toastObj.warning = warning;
  toastObj.info = info;

  return (
    <ToastContext.Provider
      value={{
        showToast,
        success,
        error,
        warning,
        info,
        removeToast,
        toast: toastObj,
      }}
    >
      {children}
      {/* Toast Render Container */}
      <div
        style={{
          position: 'fixed',
          bottom: '1.5rem',
          right: '1.5rem',
          zIndex: 9999,
          display: 'flex',
          flexDirection: 'column',
          gap: '0.625rem',
          maxWidth: '420px',
          width: '100%',
          pointerEvents: 'none',
        }}
      >
        {toasts.map((toast) => {
          const config = {
            success: {
              bg: '#ffffff',
              border: '#a7f3d0',
              icon: <CheckCircle2 size={20} color="#059669" />,
              bar: '#10b981',
            },
            error: {
              bg: '#ffffff',
              border: '#fecaca',
              icon: <XCircle size={20} color="#dc2626" />,
              bar: '#ef4444',
            },
            warning: {
              bg: '#ffffff',
              border: '#fde68a',
              icon: <AlertTriangle size={20} color="#d97706" />,
              bar: '#f59e0b',
            },
            info: {
              bg: '#ffffff',
              border: '#bfdbfe',
              icon: <Info size={20} color="#2563eb" />,
              bar: '#3b82f6',
            },
          }[toast.type];

          return (
            <div
              key={toast.id}
              className="animate-fade-in"
              style={{
                pointerEvents: 'auto',
                backgroundColor: config.bg,
                border: `1px solid ${config.border}`,
                borderLeft: `4px solid ${config.bar}`,
                borderRadius: '8px',
                padding: '0.875rem 1rem',
                boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '0.75rem',
              }}
            >
              <div style={{ flexShrink: 0, marginTop: '2px' }}>{config.icon}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: '0.875rem', color: '#0f172a' }}>
                  {toast.title}
                </div>
                {toast.message && (
                  <div style={{ fontSize: '0.8125rem', color: '#475569', marginTop: '0.2rem' }}>
                    {toast.message}
                  </div>
                )}
              </div>
              <button
                onClick={() => removeToast(toast.id)}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: '#94a3b8',
                  padding: '2px',
                  lineHeight: 1,
                  display: 'flex',
                }}
              >
                <X size={16} />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}
