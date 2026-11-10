import React, { useState } from 'react';
import { User, Plan, Invoice } from '../types';
import { billingService } from '../services/billingService';
import { Lock, CreditCard, ShieldCheck, AlertCircle, CheckCircle2, X, Sparkles, Building2 } from 'lucide-react';

interface StripeCheckoutModalProps {
  user: User;
  targetPlanId: 'free' | 'pro' | 'team';
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (invoice?: Invoice) => void;
}

export const StripeCheckoutModal: React.FC<StripeCheckoutModalProps> = ({
  user,
  targetPlanId,
  isOpen,
  onClose,
  onSuccess,
}) => {
  const plan = billingService.getPlanById(targetPlanId);

  const [cardNumber, setCardNumber] = useState('4242 4242 4242 4242');
  const [expDate, setExpDate] = useState('12/28');
  const [cvc, setCvc] = useState('123');
  const [billingName, setBillingName] = useState(user.name || '');
  const [billingAddress, setBillingAddress] = useState('100 High Street, Boston, MA 02110');
  const [couponCode, setCouponCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen || !plan) return null;

  const isNonprofit = user.organizationProfile?.type === 'Nonprofit';
  const hasDiscount = isNonprofit && user.nonprofitDiscountApproved;
  const basePrice = hasDiscount ? plan.priceNonprofit : plan.price;

  let effectivePrice = basePrice;
  if (couponCode.toUpperCase() === 'LAUNCHPAD100') {
    effectivePrice = 0;
  } else if (couponCode.toUpperCase() === 'MILLENNIUM50') {
    effectivePrice = Math.round(effectivePrice * 0.5 * 100) / 100;
  }

  const formatCardInput = (val: string) => {
    const raw = val.replace(/\D/g, '').slice(0, 16);
    const parts = raw.match(/[\s\S]{1,4}/g) || [];
    setCardNumber(parts.join(' '));
  };

  const formatExpInput = (val: string) => {
    const raw = val.replace(/\D/g, '').slice(0, 4);
    if (raw.length >= 3) {
      setExpDate(`${raw.slice(0, 2)}/${raw.slice(2, 4)}`);
    } else {
      setExpDate(raw);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const result = await billingService.startCheckout({
        userId: user.id,
        planId: plan.id,
        cardNumber,
        expDate,
        cvc,
        billingName,
        billingAddress,
        couponCode,
      });

      if (result.success) {
        onSuccess(result.invoice);
        onClose();
      } else {
        setError(result.error || 'Payment failed. Please try again.');
      }
    } catch (err: any) {
      setError(err?.message || 'An error occurred during checkout.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm overflow-y-auto">
      <div className="relative w-full max-w-3xl bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden my-8 animate-in fade-in zoom-in-95 duration-200 flex flex-col md:flex-row">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors z-20"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Left Column: Stripe-style Order Summary */}
        <div className="md:w-5/12 bg-slate-900 text-white p-6 sm:p-8 flex flex-col justify-between border-b md:border-b-0 md:border-r border-slate-800">
          <div>
            <div className="flex items-center gap-2 mb-6">
              <div className="w-8 h-8 rounded-lg bg-rose-600 flex items-center justify-center font-extrabold text-white text-base">
                M
              </div>
              <div>
                <div className="font-bold text-sm tracking-tight">Millennium Agency</div>
                <div className="text-[10px] text-slate-400">Launchpad Subscription</div>
              </div>
            </div>

            <div className="text-xs text-slate-400 uppercase tracking-wider font-semibold">
              Subscribe to
            </div>
            <h3 className="text-2xl font-extrabold text-white font-heading mt-0.5 mb-1">
              {plan.name}
            </h3>

            <div className="flex items-baseline gap-2 my-4">
              <span className="text-4xl font-extrabold">${effectivePrice}</span>
              <span className="text-xs text-slate-400">per month</span>
            </div>

            {hasDiscount && (
              <div className="mb-4 p-2.5 rounded-xl bg-emerald-950/80 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Nonprofit 25% discount applied (-${(plan.price - plan.priceNonprofit).toFixed(2)})</span>
              </div>
            )}

            <div className="space-y-2 py-4 border-t border-slate-800 text-xs text-slate-300">
              <div className="flex justify-between">
                <span>Monthly AI limit</span>
                <span className="font-semibold text-white">{plan.generationLimit} generations</span>
              </div>
              <div className="flex justify-between">
                <span>Billed to</span>
                <span className="font-semibold text-white truncate max-w-[140px]">{user.email}</span>
              </div>
              <div className="flex justify-between">
                <span>Organization</span>
                <span className="font-semibold text-white truncate max-w-[140px]">
                  {user.organizationProfile?.orgName || 'Independent'}
                </span>
              </div>
            </div>
          </div>

          <div className="pt-6 border-t border-slate-800/80 text-[11px] text-slate-400 space-y-1">
            <div className="flex items-center gap-1.5 text-slate-300 font-medium">
              <Lock className="w-3.5 h-3.5 text-emerald-400" />
              <span>Simulated Stripe Checkout Session</span>
            </div>
            <p className="text-[10px]">
              Ready for production Stripe Webhooks when BILLING_MODE="stripe".
            </p>
          </div>
        </div>

        {/* Right Column: Payment Form */}
        <div className="md:w-7/12 p-6 sm:p-8 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-4 mb-4 border-b border-slate-100">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-800 uppercase tracking-wide">
                <CreditCard className="w-4 h-4 text-blue-600" />
                <span>Payment Details</span>
              </div>
              <span className="text-[11px] font-semibold text-slate-500 flex items-center gap-1">
                <Lock className="w-3 h-3 text-emerald-600" /> 256-bit SSL
              </span>
            </div>

            {/* Test Card Banner */}
            <div className="mb-4 p-3 bg-amber-50 rounded-xl border border-amber-200 text-[11px] text-amber-900 flex items-start gap-2">
              <Sparkles className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold">Test Mode:</span> Use card{' '}
                <code className="font-mono font-bold bg-white px-1.5 py-0.5 rounded border border-amber-200 text-slate-900">
                  4242 4242 4242 4242
                </code>{' '}
                with any future date (e.g. 12/28) & CVC. Any other number triggers a declined card error.
              </div>
            </div>

            {error && (
              <div className="mb-4 p-3 bg-red-50 text-red-800 text-xs rounded-xl border border-red-200 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                <div className="font-medium">{error}</div>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Card Information
                </label>
                <div className="relative">
                  <input
                    type="text"
                    required
                    value={cardNumber}
                    onChange={(e) => formatCardInput(e.target.value)}
                    placeholder="4242 4242 4242 4242"
                    className="w-full pl-10 pr-3 py-2 text-xs font-mono rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-600 tracking-wider"
                  />
                  <CreditCard className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Expiration (MM/YY)
                  </label>
                  <input
                    type="text"
                    required
                    value={expDate}
                    onChange={(e) => formatExpInput(e.target.value)}
                    placeholder="12/28"
                    className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-600 text-center"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    CVC
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={4}
                    value={cvc}
                    onChange={(e) => setCvc(e.target.value.replace(/\D/g, ''))}
                    placeholder="123"
                    className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-600 text-center"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Name on Card
                </label>
                <input
                  type="text"
                  required
                  value={billingName}
                  onChange={(e) => setBillingName(e.target.value)}
                  placeholder="e.g. Sarah Jenkins"
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Billing Address
                </label>
                <input
                  type="text"
                  required
                  value={billingAddress}
                  onChange={(e) => setBillingAddress(e.target.value)}
                  placeholder="Street address, City, State, ZIP"
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Discount Code (Try <code className="text-rose-600 font-mono">LAUNCHPAD100</code>)
                </label>
                <input
                  type="text"
                  value={couponCode}
                  onChange={(e) => setCouponCode(e.target.value)}
                  placeholder="Promo code"
                  className="w-full px-3 py-2 text-xs uppercase font-mono rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full mt-4 py-3 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs transition-all shadow-md hover:shadow-lg flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Processing simulated payment...</span>
                  </>
                ) : (
                  <>
                    <Lock className="w-3.5 h-3.5" />
                    <span>Pay ${effectivePrice}.00 & Activate {plan.name}</span>
                  </>
                )}
              </button>
            </form>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-400">
            <span>Powered by simulated Stripe</span>
            <span className="flex items-center gap-1 text-slate-500">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" /> Instant activation
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
