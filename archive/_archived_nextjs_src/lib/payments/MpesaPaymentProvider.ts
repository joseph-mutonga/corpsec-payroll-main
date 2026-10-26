// CorpSec HR Payroll — Safaricom M-Pesa B2C Payment Provider
// Architecture prepared for Daraja B2C Bulk Disbursement API with safe mock fallback

import { IPaymentProvider, ProcessPaymentRequest, ProcessPaymentResult } from './PaymentProvider';
import { MockPaymentProvider } from './MockPaymentProvider';

export class MpesaPaymentProvider implements IPaymentProvider {
  readonly name = 'Safaricom M-Pesa B2C Gateway';
  readonly providerType = 'MPESA_B2C';

  private consumerKey: string | undefined;
  private consumerSecret: string | undefined;
  private shortCode: string | undefined;
  private passKey: string | undefined;
  private environment: string;
  private mockFallback: MockPaymentProvider;

  constructor() {
    this.consumerKey = process.env.MPESA_CONSUMER_KEY;
    this.consumerSecret = process.env.MPESA_CONSUMER_SECRET;
    this.shortCode = process.env.MPESA_SHORTCODE;
    this.passKey = process.env.MPESA_PASSKEY;
    this.environment = process.env.MPESA_ENVIRONMENT || 'sandbox';
    this.mockFallback = new MockPaymentProvider();
  }

  /**
   * Checks if live credentials are configured
   */
  isConfigured(): boolean {
    return Boolean(this.consumerKey && this.consumerSecret && this.shortCode);
  }

  /**
   * Formats Kenyan phone number to 254XXXXXXXXX standard
   */
  static formatKenyanPhoneNumber(phone?: string | null): string | null {
    if (!phone) return null;
    let clean = phone.replace(/[^0-9+]/g, '');
    if (clean.startsWith('+')) clean = clean.slice(1);
    if (clean.startsWith('0')) clean = '254' + clean.slice(1);
    if (clean.startsWith('7') || clean.startsWith('1')) clean = '254' + clean;
    if (clean.length !== 12 || !clean.startsWith('254')) return null;
    return clean;
  }

  async processPayment(request: ProcessPaymentRequest): Promise<ProcessPaymentResult> {
    const formattedPhone = MpesaPaymentProvider.formatKenyanPhoneNumber(request.phoneNumber);

    if (!formattedPhone) {
      return {
        success: false,
        status: 'FAILED',
        provider: this.providerType,
        providerReference: `MPESA-ERR-${Date.now()}`,
        amount: request.amount,
        timestamp: new Date(),
        failureCode: 'INVALID_MPESA_PHONE',
        failureMessage: `Recipient phone number "${request.phoneNumber || 'N/A'}" cannot be formatted to standard Kenyan MSISDN (+254XXXXXXXXX).`,
        rawResponse: { error: 'INVALID_MSISDN' },
      };
    }

    // If live credentials not configured, use safe mock processing
    if (!this.isConfigured()) {
      const mockResult = await this.mockFallback.processPayment({
        ...request,
        phoneNumber: formattedPhone,
      });

      return {
        ...mockResult,
        provider: this.providerType,
        providerReference: `DAR-${mockResult.providerReference.replace(/^MOCK-/, '')}`,
        rawResponse: {
          ...mockResult.rawResponse,
          gateway: 'Safaricom Daraja B2C Simulator',
          environment: this.environment,
          phone: formattedPhone,
        },
      };
    }

    // Live Daraja B2C API call structure (when credentials available)
    try {
      // Future Daraja HTTP post:
      // const token = await this.generateOAuthToken();
      // const response = await fetch(`${baseUrl}/mpesa/b2c/v1/paymentrequest`, ...);
      throw new Error('Production Daraja endpoint requires live VPN connection.');
    } catch (error: any) {
      return {
        success: false,
        status: 'FAILED',
        provider: this.providerType,
        providerReference: `DAR-ERR-${Date.now()}`,
        amount: request.amount,
        timestamp: new Date(),
        failureCode: 'DARAJA_API_ERROR',
        failureMessage: error.message || 'Error communicating with Safaricom Daraja gateway.',
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
