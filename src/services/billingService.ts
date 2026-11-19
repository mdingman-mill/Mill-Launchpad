import { Plan, Invoice } from '../types';
import { dataService } from './dataService';

export interface CheckoutOptions {
  userId: string;
  planId: 'free' | 'pro' | 'team';
  cardNumber: string;
  expDate: string;
  cvc: string;
  billingName: string;
  billingAddress?: string;
  zipCode?: string;
  couponCode?: string;
}

export interface CheckoutResult {
  success: boolean;
  invoice?: Invoice;
  error?: string;
}

class BillingService {
  public getPlans(): Plan[] {
    return dataService.getPlans();
  }

  public getPlanById(planId: string): Plan | undefined {
    return this.getPlans().find((p) => p.id === planId);
  }

  public async getInvoices(userId: string): Promise<Invoice[]> {
    return dataService.getInvoices(userId);
  }

  public async getAllInvoices(): Promise<Invoice[]> {
    return dataService.getInvoices();
  }

  public async startCheckout(_options: CheckoutOptions): Promise<CheckoutResult> {
    return {
      success: false,
      error: 'Paid subscriptions must be provisioned via server-verified Stripe billing or a super admin invite.',
    };
  }

  public async cancelSubscription(_userId: string): Promise<void> {
    throw new Error('Subscription changes are managed via server billing or your workspace administrator.');
  }

  public async updatePaymentMethod(
    _userId: string,
    _paymentMethod: { brand: string; last4: string; expMonth: string; expYear: string }
  ): Promise<void> {
    throw new Error('Payment methods cannot be modified directly from the client.');
  }

  public async issueRefund(invoiceId: string): Promise<void> {
    const invoices = dataService.getInvoices();
    const inv = invoices.find((i) => i.id === invoiceId);
    if (!inv) return;

    dataService.updateInvoice(invoiceId, { status: 'refunded' });
    dataService.logAction('INVOICE_REFUNDED', `Issued refund record of $${inv.amount} for invoice ${inv.id}`, inv.userId);
  }
}

export const billingService = new BillingService();
