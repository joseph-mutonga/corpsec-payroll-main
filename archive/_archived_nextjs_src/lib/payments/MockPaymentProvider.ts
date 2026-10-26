// CorpSec HR Payroll — Mock Payment Provider (TEST MODE)
// Provides realistic deterministic payment simulation for development & verification without real financial movement

import { IPaymentProvider, ProcessPaymentRequest, ProcessPaymentResult } from './PaymentProvider';

export class MockPaymentProvider implements IPaymentProvider {
  readonly name = 'CorpSec Mock Payment Gateway (TEST MODE)';
  readonly providerType = 'MOCK';

  // Configurable failure injection for testing
  private simulatedFailures: Set<string> = new Set();

  setSimulateFailure(idempotencyKeyOrEmployeeNumber: string, shouldFail = true) {
    if (shouldFail) {
      this.simulatedFailures.add(idempotencyKeyOrEmployeeNumber);
    } else {
      this.simulatedFailures.delete(idempotencyKeyOrEmployeeNumber);
    }
  }

  async processPayment(request: ProcessPaymentRequest): Promise<ProcessPaymentResult> {
    const isExplicitFailure =
      this.simulatedFailures.has(request.idempotencyKey) ||
      this.simulatedFailures.has(request.employeeNumber) ||
      this.simulatedFailures.has(request.transactionNumber);

    // Validate destination parameters
    if (request.paymentMethod === 'MPESA' && (!request.phoneNumber || request.phoneNumber.length < 9)) {
      return {
        success: false,
        status: 'FAILED',
        provider: this.providerType,
        providerReference: `MCK-ERR-${Date.now().toString(36).toUpperCase()}`,
        amount: request.amount,
        timestamp: new Date(),
        failureCode: 'INVALID_PHONE_NUMBER',
        failureMessage: 'Destination M-Pesa phone number is missing or invalid format.',
        rawResponse: { mode: 'TEST_MODE', error: 'INVALID_PHONE_NUMBER' },
      };
    }

    if (request.paymentMethod === 'BANK' && (!request.accountNumber || request.accountNumber.length < 4)) {
      return {
        success: false,
        status: 'FAILED',
        provider: this.providerType,
        providerReference: `MCK-ERR-${Date.now().toString(36).toUpperCase()}`,
        amount: request.amount,
        timestamp: new Date(),
        failureCode: 'INVALID_BANK_ACCOUNT',
        failureMessage: 'Destination bank account number is missing or invalid.',
        rawResponse: { mode: 'TEST_MODE', error: 'INVALID_BANK_ACCOUNT' },
      };
    }

    if (isExplicitFailure) {
      return {
        success: false,
        status: 'FAILED',
        provider: this.providerType,
        providerReference: `MCK-FAIL-${Date.now().toString(36).toUpperCase()}`,
        amount: request.amount,
        timestamp: new Date(),
        failureCode: 'PROVIDER_SIMULATED_REJECTION',
        failureMessage: 'Simulated payment gateway timeout/insufficient float error.',
        rawResponse: { mode: 'TEST_MODE', simulatedFailure: true },
      };
    }

    // Generate realistic provider reference
    const prefix = request.paymentMethod === 'MPESA' ? 'MPESA' : request.paymentMethod === 'BANK' ? 'EFT' : 'MOCK';
    const randomHex = Math.random().toString(36).substring(2, 9).toUpperCase();
    const providerReference = `${prefix}-${Date.now().toString(36).toUpperCase()}-${randomHex}`;

    return {
      success: true,
      status: 'SUCCESS',
      provider: this.providerType,
      providerReference,
      amount: request.amount,
      timestamp: new Date(),
      failureCode: null,
      failureMessage: null,
      rawResponse: {
        mode: 'TEST_MODE',
        gateway: 'CorpSec Mock Gateway',
        reference: providerReference,
        status: 'SUCCESS',
        processedAt: new Date().toISOString(),
      },
    };
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
      rawResponse: { mode: 'TEST_MODE', verified: true },
    };
  }
}
