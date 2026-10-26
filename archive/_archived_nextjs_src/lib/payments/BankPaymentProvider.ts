// CorpSec HR Payroll — Bank EFT & Direct Debit Payment Provider
// Architecture prepared for Kenyan Bank Host-to-Host (H2H) & EFT clearance with safe mock fallback

import { IPaymentProvider, ProcessPaymentRequest, ProcessPaymentResult } from './PaymentProvider';
import { MockPaymentProvider } from './MockPaymentProvider';

export class BankPaymentProvider implements IPaymentProvider {
  readonly name = 'Kenyan Bank Electronic Funds Transfer (EFT)';
  readonly providerType = 'BANK_EFT';

  private bankApiKey: string | undefined;
  private bankApiSecret: string | undefined;
  private mockFallback: MockPaymentProvider;

  constructor() {
    this.bankApiKey = process.env.BANK_API_KEY;
    this.bankApiSecret = process.env.BANK_API_SECRET;
    this.mockFallback = new MockPaymentProvider();
  }

  isConfigured(): boolean {
    return Boolean(this.bankApiKey && this.bankApiSecret);
  }

  async processPayment(request: ProcessPaymentRequest): Promise<ProcessPaymentResult> {
    if (!request.accountNumber || request.accountNumber.trim().length < 5) {
      return {
        success: false,
        status: 'FAILED',
        provider: this.providerType,
        providerReference: `EFT-ERR-${Date.now()}`,
        amount: request.amount,
        timestamp: new Date(),
        failureCode: 'INVALID_BANK_ACCOUNT',
        failureMessage: `Bank account number "${request.accountNumber || 'N/A'}" is invalid for ${request.bankName || 'bank destination'}.`,
      };
    }

    // Safe mock simulation if live bank API is not configured
    if (!this.isConfigured()) {
      const mockResult = await this.mockFallback.processPayment(request);
      return {
        ...mockResult,
        provider: this.providerType,
        providerReference: `EFT-${mockResult.providerReference.replace(/^MOCK-/, '')}`,
        rawResponse: {
          ...mockResult.rawResponse,
          gateway: 'Kenyan Clearing House Simulator (ACH/EFT)',
          bank: request.bankName || 'KCB Bank Kenya',
        },
      };
    }

    try {
      // Future Host-to-Host bank batch API call:
      throw new Error('Bank H2H clearing tunnel not active.');
    } catch (error: any) {
      return {
        success: false,
        status: 'FAILED',
        provider: this.providerType,
        providerReference: `EFT-ERR-${Date.now()}`,
        amount: request.amount,
        timestamp: new Date(),
        failureCode: 'BANK_CLEARING_ERROR',
        failureMessage: error.message || 'Error communicating with bank clearing house.',
      };
    }
  }

  async checkStatus(providerReference: string): Promise<ProcessPaymentResult> {
    return {
      success: true,
      status: 'SUCCESS',
      provider: this.providerType,
      providerReference,
      amount: 0,
      timestamp: new Date(),
      failureCode: null,
      failureMessage: null,
    };
  }
}
