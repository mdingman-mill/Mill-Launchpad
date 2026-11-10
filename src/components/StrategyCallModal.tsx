import React from 'react';
import { Sparkles, Calendar, ArrowRight, X, CheckCircle2 } from 'lucide-react';
import { APP_CONFIG } from '../config';

interface StrategyCallModalProps {
  isOpen: boolean;
  onClose: () => void;
  orgName?: string;
}

export const StrategyCallModal: React.FC<StrategyCallModalProps> = ({ isOpen, onClose, orgName }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-xs">
      <div className="relative w-full max-w-lg bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors z-10"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header Banner */}
        <div className="bg-gradient-to-br from-slate-900 via-rose-950 to-slate-900 p-6 sm:p-8 text-white relative">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-500/20 text-rose-300 text-xs font-bold border border-rose-400/30 mb-3">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Milestone Unlocked: 3 Tools Completed!</span>
          </div>

          <h3 className="text-xl sm:text-2xl font-extrabold font-heading">
            Turn Your AI Strategy into Market Momentum
          </h3>
          <p className="text-xs sm:text-sm text-slate-300 mt-2 leading-relaxed">
            You&apos;ve built core marketing foundations for <strong className="text-white">{orgName || 'your organization'}</strong>. Take the next leap with personalized executive guidance.
          </p>
        </div>

        {/* Content */}
        <div className="p-6 sm:p-8 space-y-4">
          <div className="p-4 rounded-2xl bg-rose-50/70 border border-rose-200 text-xs text-rose-950 space-y-2">
            <div className="font-bold text-rose-900 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-rose-600" />
              <span>Complimentary 30-Minute Growth Session</span>
            </div>
            <p className="text-rose-800/90 leading-relaxed">
              Sit down with Linda Fanaras, CEO of Millennium Agency, to review your generated positioning, optimize your 90-day plan, and identify high-leverage growth channels.
            </p>
          </div>

          <ul className="space-y-2 text-xs text-slate-600">
            <li className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>1-on-1 critique of your generated brand & messaging</span>
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>Tailored recommendations for donor acquisition or B2B sales pipeline</span>
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>Zero sales pressure—100% focused on actionable next steps</span>
            </li>
          </ul>

          <div className="pt-2 flex flex-col sm:flex-row gap-2">
            <a
              href={APP_CONFIG.AGENCY_CALENDLY_URL}
              target="_blank"
              rel="noopener noreferrer"
              onClick={onClose}
              className="flex-1 py-3 px-4 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs transition-all shadow-md hover:shadow-lg flex items-center justify-center gap-2"
            >
              <Calendar className="w-4 h-4" />
              <span>Book Free 30-Min Strategy Call</span>
              <ArrowRight className="w-4 h-4" />
            </a>
            <button
              onClick={onClose}
              className="py-3 px-4 rounded-xl text-xs font-semibold text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors"
            >
              Maybe Later
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
