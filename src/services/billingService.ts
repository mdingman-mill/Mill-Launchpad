import { APP_CONFIG } from '../config';
import { Plan, Invoice, User } from '../types';
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

  /**
   * Start checkout process.
   * In Mock Mode: Validates Stripe test card 4242 4242 4242 4242 with future expiry date.
   * Any other card number simulates a declined error.
   */
  public async startCheckout(options: CheckoutOptions): Promise<CheckoutResult> {
    if (APP_CONFIG.BILLING_MODE === 'stripe') {
      /* =========================================================================
       * TODO [STRIPE CHECKOUT INTEGRATION]:
       * Redirect to server endpoint creating Stripe Checkout Session:
       *
       * const res = await fetch('/api/stripe/create-checkout-session', {
       *   method: 'POST',
       *   headers: { 'Content-Type': 'application/json' },
       *   body: JSON.stringify({ planId: options.planId, userId: options.userId }),
       * });
       * const session = await res.json();
       * window.location.href = session.url;
       * return { success: true };
       * ========================================================================= */
      throw new Error('Production Stripe checkout requires live server webhook setup.');
    }

    // Mock Mode Validation:
    const cleanCard = (options.cardNumber || '').replace(/[\s-]/g, '');
    const user = dataService.getUserById(options.userId);

    if (!user) {
      return { success: false, error: 'User account not found.' };
    }

    const plan = this.getPlanById(options.planId);
    if (!plan) {
      return { success: false, error: 'Selected plan does not exist.' };
    }

    // Free plan downgrade/activation
    if (plan.id === 'free') {
      dataService.updateUser(user.id, {
        planId: 'free',
      });
      dataService.logAction('SUBSCRIPTION_CHANGED', `${user.name} switched to Free Starter plan`, user.id);
      return { success: true };
    }

    // Card Number Validation (Rule: 4242 4242 4242 4242)
    if (cleanCard !== '4242424242424242') {
      return {
        success: false,
        error:
          'Your card was declined. In this demo, please use Stripe test card 4242 4242 4242 4242 with any future expiry date and CVC.',
      };
    }

    // Expiry Date Validation
    const [monthStr, yearStr] = (options.expDate || '').split('/');
    const month = parseInt(monthStr, 10);
    const rawYear = parseInt(yearStr, 10);
    const fullYear = rawYear < 100 ? 2000 + rawYear : rawYear;
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;

    if (!month || isNaN(month) || month < 1 || month > 12) {
      return { success: false, error: 'Invalid card expiration month. Use MM/YY format.' };
    }

    if (!fullYear || isNaN(fullYear) || fullYear < currentYear || (fullYear === currentYear && month < currentMonth)) {
      return { success: false, error: 'Your card has expired. Please enter a valid future expiration date.' };
    }

    // CVC Validation
    if (!options.cvc || options.cvc.trim().length < 3) {
      return { success: false, error: 'Please enter a valid 3 or 4 digit security code (CVC).' };
    }

    // Calculate effective amount: Check if user org is Nonprofit and approved or pending
    const isNonprofit = user.organizationProfile?.type === 'Nonprofit';
    const hasDiscount = isNonprofit && user.nonprofitDiscountApproved;
    const baseAmount = hasDiscount ? plan.priceNonprofit : plan.price;

    let finalAmount = baseAmount;
    if (options.couponCode?.toUpperCase() === 'LAUNCHPAD100') {
      finalAmount = 0;
    } else if (options.couponCode?.toUpperCase() === 'MILLENNIUM50') {
      finalAmount = Math.round(finalAmount * 0.5 * 100) / 100;
    }

    // Update User Record
    dataService.updateUser(user.id, {
      planId: plan.id,
      paymentMethod: {
        brand: 'Visa',
        last4: '4242',
        expMonth: String(month).padStart(2, '0'),
        expYear: String(fullYear),
      },
      billingResetDate: new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
    });

    // Create Invoice Record
    const invoice = dataService.addInvoice({
      userId: user.id,
      userName: user.name,
      orgName: user.organizationProfile?.orgName || 'Independent',
      userEmail: user.email,
      date: new Date().toISOString().split('T')[0],
      amount: finalAmount,
      planId: plan.id,
      planName: `${plan.name}${hasDiscount ? ' (Nonprofit 25% Off)' : ''}`,
      status: 'paid',
      billingAddress: options.billingAddress || '75 State Street, Boston, MA 02109',
    });

    dataService.logAction(
      'PLAN_UPGRADED',
      `${user.name} upgraded to ${plan.name} ($${finalAmount}/mo). Stripe charge simulated successfully.`,
      user.id
    );

    return {
      success: true,
      invoice,
    };
  }

  public async cancelSubscription(userId: string): Promise<void> {
    if (APP_CONFIG.BILLING_MODE === 'stripe') {
      /* =========================================================================
       * TODO [STRIPE PORTAL CANCEL]:
       * Redirect to Stripe Billing Customer Portal or cancel subscription via API.
       * ========================================================================= */
    }

    const user = dataService.getUserById(userId);
    if (!user) return;

    dataService.updateUser(userId, {
      planId: 'free',
    });

    dataService.logAction('SUBSCRIPTION_CANCELED', `${user.name} canceled subscription, reverted to Free tier`, userId);
  }

  public async updatePaymentMethod(
    userId: string,
    paymentMethod: { brand: string; last4: string; expMonth: string; expYear: string }
  ): Promise<void> {
    const user = dataService.getUserById(userId);
    if (!user) return;

    dataService.updateUser(userId, { paymentMethod });
    dataService.logAction('PAYMENT_METHOD_UPDATED', `Updated default payment card for ${user.name}`, userId);
  }

  public async issueRefund(invoiceId: string): Promise<void> {
    const invoices = dataService.getInvoices();
    const inv = invoices.find((i) => i.id === invoiceId);
    if (!inv) return;

    dataService.updateInvoice(invoiceId, { status: 'refunded' });
    dataService.logAction('INVOICE_REFUNDED', `Issued mock refund of $${inv.amount} for invoice ${inv.id}`, inv.userId);
  }
}

export const billingService = new BillingService();
