import React from 'react';
import { APP_CONFIG } from '../config';
import { Calendar, ExternalLink, Heart, Sparkles } from 'lucide-react';

export const Footer: React.FC = () => {
  return (
    <footer className="bg-slate-900 text-white border-t border-slate-800 text-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
          {/* Left Brand */}
          <div className="text-center md:text-left space-y-1">
            <div className="flex items-center justify-center md:justify-start gap-2">
              <div className="w-6 h-6 rounded-md bg-rose-600 flex items-center justify-center text-white font-extrabold text-xs">
                M
              </div>
              <span className="font-extrabold text-white tracking-tight font-heading text-sm">
                Millennium Agency Launchpad
              </span>
            </div>
            <p className="text-slate-400 text-[11px]">
              Empowering purpose-driven nonprofits and high-velocity startups with guided marketing excellence.
            </p>
          </div>

          {/* Center Agency Connection Link */}
          <div className="flex flex-wrap items-center justify-center gap-4 text-slate-300 text-xs">
            <a
              href="https://mill.agency"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-white transition-colors flex items-center gap-1 font-medium"
            >
              <span>Millennium Agency Website</span>
              <ExternalLink className="w-3 h-3 text-slate-500" />
            </a>

            <span>•</span>

            <a
              href={APP_CONFIG.AGENCY_CALENDLY_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="text-rose-400 hover:text-rose-300 transition-colors flex items-center gap-1 font-bold"
            >
              <Calendar className="w-3.5 h-3.5" />
              <span>Book Strategy Call with Linda Fanaras</span>
            </a>
          </div>

          {/* Right Attribution */}
          <div className="text-center md:text-right text-[11px] text-slate-400">
            <p className="font-semibold text-slate-200">Powered by Millennium Agency.</p>
            <p className="text-slate-500 text-[10px] mt-0.5">
              Proof of Concept • Simulated Google Auth & Stripe Billing
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
};
