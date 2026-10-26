// CorpSec HR Payroll — Financial Data Masking Utilities
// Masks sensitive bank account, phone number, and national ID credentials

export class PaymentMasking {
  /**
   * Masks a bank account number showing only the last 4 digits
   * e.g. "1104892841" -> "****2841"
   */
  static maskBankAccount(account?: string | null): string {
    if (!account) return 'N/A';
    const trimmed = account.trim();
    if (trimmed.length <= 4) return `****${trimmed}`;
    const last4 = trimmed.slice(-4);
    return `****${last4}`;
  }

  /**
   * Masks a mobile phone number showing the prefix and last 4 digits
   * e.g. "+254712345678" -> "+254 7****5678"
   */
  static maskPhoneNumber(phone?: string | null): string {
    if (!phone) return 'N/A';
    const clean = phone.replace(/\s+/g, '');
    if (clean.length < 8) return '****' + clean.slice(-3);
    const prefix = clean.slice(0, 6);
    const suffix = clean.slice(-4);
    return `${prefix}****${suffix}`;
  }

  /**
   * Masks a national ID number showing only the last 3-4 digits
   * e.g. "28491024" -> "****1024"
   */
  static maskIdNumber(id?: string | null): string {
    if (!id) return 'N/A';
    const trimmed = id.trim();
    if (trimmed.length <= 4) return `****${trimmed}`;
    return `****${trimmed.slice(-4)}`;
  }

  static maskNationalId(id?: string | null): string {
    return this.maskIdNumber(id);
  }

  /**
   * Formats and masks the primary destination based on the payment method
   */
  static maskDestination(
    method: string,
    accountNumber?: string | null,
    phoneNumber?: string | null,
    bankName?: string | null
  ): string {
    const normMethod = (method || '').toUpperCase();
    if (normMethod === 'MPESA' || normMethod === 'MOBILE_MONEY') {
      return `M-Pesa: ${this.maskPhoneNumber(phoneNumber)}`;
    }
    if (normMethod === 'BANK' || normMethod === 'EFT') {
      const bank = bankName ? `${bankName} ` : '';
      return `${bank}${this.maskBankAccount(accountNumber)}`;
    }
    if (normMethod === 'CASH') {
      return 'Cash (Disbursement Desk)';
    }
    if (normMethod === 'CHEQUE') {
      return `Cheque ${accountNumber ? `(No: ${this.maskBankAccount(accountNumber)})` : ''}`;
    }
    return this.maskBankAccount(accountNumber || phoneNumber);
  }
}
