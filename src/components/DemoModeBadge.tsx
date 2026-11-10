import React, { useState } from 'react';
import { APP_CONFIG, isDemoModeActive } from '../config';
import { AlertCircle, CheckCircle2, ChevronDown, Server, CreditCard, ShieldCheck } from 'lucide-react';

export const DemoModeBadge: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const isDemo = isDemoModeActive();

  if (!isDemo) return null;

  return (
    <div className="relative inline-block text-left">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-full bg-amber-50 text-amber-800 border border-amber-300 hover:bg-amber-100 transition-colors shadow-xs"
        title="Click to view Demo Architecture details"
      >
        <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span>
        <span>Demo Mode</span>
        <ChevronDown className="w-3 h-3 text-amber-700" />
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <div className="absolute right-0 mt-2 w-80 bg-white rounded-xl shadow-xl border border-slate-200 z-50 p-4 text-xs text-slate-700 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-2 mb-3 border-b border-slate-100">
              <span className="font-bold text-slate-900 flex items-center gap-1.5">
                <AlertCircle className="w-4 h-4 text-amber-600" />
                Proof of Concept Architecture
              </span>
              <span className="px-2 py-0.5 text-[10px] bg-slate-100 text-slate-600 rounded-md font-mono">
                POC v1.0
              </span>
            </div>

            <p className="text-slate-600 mb-3 text-[11px] leading-relaxed">
              Google sign-in and Stripe payments are simulated for this demo. The service layer is architected so real Firebase & Stripe can be connected by flipping configuration flags.
            </p>

            <div className="space-y-2">
              <div className="flex items-center justify-between p-2 rounded-lg bg-slate-50 border border-slate-100">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-blue-600" />
                  <span className="font-medium">Authentication</span>
                </div>
                <span className="font-mono text-[11px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 font-semibold">
                  {APP_CONFIG.AUTH_MODE === 'mock' ? 'Simulated Google' : 'Firebase Google'}
                </span>
              </div>

              <div className="flex items-center justify-between p-2 rounded-lg bg-slate-50 border border-slate-100">
                <div className="flex items-center gap-2">
                  <CreditCard className="w-4 h-4 text-emerald-600" />
                  <span className="font-medium">Billing & Payments</span>
                </div>
                <span className="font-mono text-[11px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 font-semibold">
                  {APP_CONFIG.BILLING_MODE === 'mock' ? 'Simulated Stripe' : 'Stripe Live'}
                </span>
              </div>

              <div className="flex items-center justify-between p-2 rounded-lg bg-slate-50 border border-slate-100">
                <div className="flex items-center gap-2">
                  <Server className="w-4 h-4 text-indigo-600" />
                  <span className="font-medium">Data Persistence</span>
                </div>
                <span className="font-mono text-[11px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-800 font-semibold">
                  {APP_CONFIG.DATA_MODE === 'local' ? 'Browser LocalStorage' : 'Cloud Firestore'}
                </span>
              </div>
            </div>

            <div className="mt-3 pt-2 border-t border-slate-100 text-[10px] text-slate-500 flex items-center justify-between">
              <span>Card: 4242 4242 4242 4242</span>
              <span className="text-emerald-700 font-medium flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" /> State Persisted
              </span>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
