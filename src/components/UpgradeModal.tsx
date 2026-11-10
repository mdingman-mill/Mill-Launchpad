import React from 'react';
import { User, Plan } from '../types';
import { billingService } from '../services/billingService';
import { Check, Sparkles, X, ShieldCheck, Zap, HeartHandshake } from 'lucide-react';

interface UpgradeModalProps {
  user: User;
  isOpen: boolean;
  onClose: () => void;
  onSelectPlan: (planId: 'free' | 'pro' | 'team') => void;
  reason?: 'limit_reached' | 'upgrade_click' | 'feature_locked';
}

export const UpgradeModal: React.FC<UpgradeModalProps> = ({
  user,
  isOpen,
  onClose,
  onSelectPlan,
  reason = 'upgrade_click',
}) => {
  if (!isOpen) return null;

  const plans = billingService.getPlans();
  const isNonprofit = user.organizationProfile?.type === 'Nonprofit';
  const hasDiscount = isNonprofit && user.nonprofitDiscountApproved;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-xs overflow-y-auto">
      <div className="relative w-full max-w-4xl bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden my-8 animate-in fade-in zoom-in-95 duration-200">
        <button
          onClick={onClose}
          className="absolute top-5 right-5 p-2 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors z-10"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Top Header */}
        <div className="p-8 text-center bg-gradient-to-b from-slate-50 to-white border-b border-slate-100">
          {reason === 'limit_reached' && (
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-100 text-rose-800 text-xs font-bold mb-3">
              <Zap className="w-3.5 h-3.5" />
              <span>Generation Limit Reached (100%)</span>
            </div>
          )}

          <div className="flex items-center justify-center gap-2 text-rose-600 font-bold text-xs uppercase tracking-widest mb-1">
            <Sparkles className="w-4 h-4" />
            <span>Millennium Agency Launchpad Plans</span>
          </div>

          <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 font-heading">
            Upgrade Your Marketing Capabilities
          </h2>
          <p className="text-sm text-slate-600 max-w-xl mx-auto mt-2">
            Unlock high-volume AI generations, unlimited library storage, and collaborative team seats tailored for mission-driven leaders.
          </p>

          {isNonprofit && (
            <div className="mt-4 inline-flex items-center gap-2 px-3.5 py-1.5 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-full text-xs font-semibold">
              <HeartHandshake className="w-4 h-4 text-emerald-600" />
              <span>
                {hasDiscount
                  ? 'Nonprofit 25% discount is active on all paid tiers!'
                  : 'Nonprofit organization detected. Admin approval enables 25% off paid plans.'}
              </span>
            </div>
          )}
        </div>

        {/* Plans Grid */}
        <div className="p-6 sm:p-8 grid grid-cols-1 md:grid-cols-3 gap-6">
          {plans.map((plan) => {
            const isCurrent = user.planId === plan.id;
            const price = hasDiscount ? plan.priceNonprofit : plan.price;

            return (
              <div
                key={plan.id}
                className={`relative rounded-2xl p-6 transition-all flex flex-col justify-between border ${
                  plan.popular
                    ? 'border-rose-500 bg-gradient-to-b from-rose-50/40 to-white shadow-xl shadow-rose-500/5 ring-2 ring-rose-500'
                    : 'border-slate-200 bg-white hover:border-slate-300 shadow-sm'
                }`}
              >
                {plan.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full bg-rose-600 text-white font-bold text-[10px] uppercase tracking-wider shadow-sm">
                    Most Popular
                  </div>
                )}

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-base font-bold text-slate-900">{plan.name}</h3>
                    {isCurrent && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-slate-100 text-slate-700">
                        Current Plan
                      </span>
                    )}
                  </div>

                  <p className="text-xs text-slate-500 mb-4 min-h-[32px]">{plan.description}</p>

                  <div className="mb-6 flex items-baseline gap-1.5">
                    <span className="text-3xl font-extrabold text-slate-900">${price}</span>
                    <span className="text-xs text-slate-500 font-medium">/ month</span>
                    {hasDiscount && plan.price > 0 && (
                      <span className="text-xs text-slate-400 line-through ml-1.5">${plan.price}</span>
                    )}
                  </div>

                  <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100 mb-6 flex items-center gap-2">
                    <Zap className="w-4 h-4 text-rose-600 shrink-0" />
                    <span className="text-xs font-bold text-slate-800">
                      {plan.generationLimit} generations / month
                    </span>
                  </div>

                  <ul className="space-y-2.5 mb-6 text-xs text-slate-600">
                    {plan.features.map((feature, idx) => (
                      <li key={idx} className="flex items-start gap-2">
                        <Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div>
                  {isCurrent ? (
                    <button
                      disabled
                      className="w-full py-2.5 px-4 rounded-xl bg-slate-100 text-slate-500 text-xs font-bold cursor-default"
                    >
                      Active Plan
                    </button>
                  ) : plan.price > 0 ? (
                    <button
                      disabled
                      className="w-full py-2.5 px-4 rounded-xl bg-slate-100 text-slate-500 text-xs font-bold cursor-not-allowed border border-slate-200"
                    >
                      Paid plans coming soon
                    </button>
                  ) : (
                    <button
                      onClick={() => onSelectPlan(plan.id)}
                      className="w-full py-2.5 px-4 rounded-xl text-xs font-bold transition-all shadow-xs bg-slate-900 hover:bg-slate-800 text-white"
                    >
                      Downgrade to Starter
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer guarantee */}
        <div className="p-4 bg-slate-50 border-t border-slate-100 text-center flex items-center justify-center gap-4 text-xs text-slate-500">
          <span className="flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-slate-400" />
            All accounts start on the Free Starter plan (50 generations/month)
          </span>
          <span>•</span>
          <span>Contact Millennium Agency for custom team tiers</span>
        </div>
      </div>
    </div>
  );
};
