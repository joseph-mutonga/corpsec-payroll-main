// CorpSec HR Payroll — Payment Provider Interface & Contracts

export interface ProcessPaymentRequest {
  transactionId: string;
  transactionNumber: string;
  internalReference: string;
  idempotencyKey: string;
  employeeId: string;
  employeeNumber: string;
  employeeName: string;
  paymentMethod: string; // BANK, MPESA, CASH, CHEQUE
  accountNumber?: string | null;
  bankName?: string | null;
  phoneNumber?: string | null;
  amount: number;
  currency: string; // KES
  description: string;
}

export interface ProcessPaymentResult {
  success: boolean;
  status: 'SUCCESS' | 'FAILED' | 'PENDING';
  provider: string; // MOCK, MPESA_B2C, BANK_EFT
  providerReference: string;
  amount: number;
  timestamp: Date;
  failureCode?: string | null;
  failureMessage?: string | null;
  rawResponse?: Record<string, any>;
}

export interface IPaymentProvider {
  readonly name: string;
  readonly providerType: string;

  /**
   * Disburses a single payment through the provider
   */
  processPayment(request: ProcessPaymentRequest): Promise<ProcessPaymentResult>;

  /**
   * Queries the status of an existing transaction by reference
   */
  checkStatus(providerReference: string): Promise<ProcessPaymentResult>;
}
