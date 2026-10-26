import type { Metadata } from 'next';
import './globals.css';
import { ToastProvider } from '@/components/ui/ToastContext';

export const metadata: Metadata = {
  title: 'CorpSec HR Payroll — Foundation Platform',
  description: 'Enterprise HR & Payroll Management System for CorpSec Investigations & Guarding Services',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
