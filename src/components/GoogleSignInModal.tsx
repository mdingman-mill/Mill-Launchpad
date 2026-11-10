import React, { useState } from 'react';
import { User, OrganizationType } from '../types';
import { authService } from '../services/authService';
import { UserPlus, ShieldAlert, ArrowLeft, X, Sparkles, Building2, HeartHandshake } from 'lucide-react';

interface GoogleSignInModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (user: User) => void;
}

export const GoogleSignInModal: React.FC<GoogleSignInModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const [view, setView] = useState<'picker' | 'custom'>('picker');
  const [customName, setCustomName] = useState('');
  const [customEmail, setCustomEmail] = useState('');
  const [customOrgName, setCustomOrgName] = useState('');
  const [customOrgType, setCustomOrgType] = useState<OrganizationType>('Startup');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const sampleAccounts = authService.getSampleAccounts();

  const handleSelectSample = async (userId: string) => {
    try {
      setLoading(true);
      setError(null);
      const user = await authService.signIn('mock', { targetUserId: userId });
      onSuccess(user);
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Failed to sign in');
    } finally {
      setLoading(false);
    }
  };

  const handleCustomSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customEmail || !customName) {
      setError('Please provide both name and email.');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const user = await authService.signIn('mock', {
        customUser: {
          name: customName,
          email: customEmail,
          orgName: customOrgName || undefined,
          orgType: customOrgType,
        },
      });
      onSuccess(user);
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Failed to create simulated user');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Top Google Header */}
        <div className="p-6 text-center border-b border-slate-100 relative">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-1 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>

          {/* Official Google G Logo */}
          <div className="flex justify-center mb-3">
            <svg className="w-9 h-9" viewBox="0 0 48 48">
              <path
                fill="#EA4335"
                d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
              />
              <path
                fill="#4285F4"
                d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
              />
              <path
                fill="#FBBC05"
                d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
              />
              <path
                fill="#34A853"
                d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
              />
            </svg>
          </div>

          <h2 className="text-xl font-bold text-slate-900 tracking-tight">
            Sign in with Google
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Choose an account to continue to <span className="font-semibold text-slate-800">Millennium Launchpad</span>
          </p>

          <div className="mt-3 px-3 py-1.5 rounded-lg bg-amber-50 text-amber-800 border border-amber-200 text-[11px] inline-flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-amber-600 shrink-0" />
            <span>Simulated Google Auth for live interactive demo</span>
          </div>
        </div>

        {error && (
          <div className="mx-6 mt-4 p-3 bg-red-50 text-red-700 text-xs rounded-lg border border-red-200 flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-red-600 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* View 1: Sample Account Picker */}
        {view === 'picker' ? (
          <div className="p-6">
            <div className="space-y-2.5">
              {sampleAccounts.map((account) => {
                const isAdmin = account.role === 'super_admin' || account.role === 'admin';
                const isNonprofit = account.organizationProfile?.type === 'Nonprofit';

                return (
                  <button
                    key={account.id}
                    onClick={() => handleSelectSample(account.id)}
                    disabled={loading}
                    className="w-full text-left p-3.5 rounded-xl border border-slate-200 hover:border-blue-400 hover:bg-blue-50/40 transition-all flex items-center gap-3.5 group relative"
                  >
                    <img
                      src={account.avatar}
                      alt={account.name}
                      className="w-11 h-11 rounded-full object-cover border border-slate-200 group-hover:scale-105 transition-transform"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-slate-900 text-sm truncate">
                          {account.name}
                        </span>
                        {isAdmin && (
                          <span className="px-1.5 py-0.5 text-[10px] font-bold rounded-md bg-rose-100 text-rose-800 border border-rose-200">
                            Super Admin
                          </span>
                        )}
                        {!isAdmin && isNonprofit && (
                          <span className="px-1.5 py-0.5 text-[10px] font-semibold rounded-md bg-emerald-100 text-emerald-800 border border-emerald-200">
                            Nonprofit
                          </span>
                        )}
                        {!isAdmin && !isNonprofit && (
                          <span className="px-1.5 py-0.5 text-[10px] font-semibold rounded-md bg-indigo-100 text-indigo-800 border border-indigo-200">
                            Startup
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 truncate">{account.email}</p>
                      <p className="text-[11px] text-slate-400 truncate mt-0.5">
                        {account.organizationProfile?.orgName} • {account.planId.toUpperCase()} Plan
                      </p>
                    </div>
                  </button>
                );
              })}

              {/* Use Another Account Button */}
              <button
                onClick={() => {
                  setView('custom');
                  setError(null);
                }}
                className="w-full p-3.5 rounded-xl border border-dashed border-slate-300 hover:border-slate-400 hover:bg-slate-50 transition-colors flex items-center justify-center gap-2 text-slate-700 font-medium text-xs mt-3"
              >
                <UserPlus className="w-4 h-4 text-slate-500" />
                <span>Use another account (New User onboarding)</span>
              </button>
            </div>
          </div>
        ) : (
          /* View 2: Custom User Form */
          <form onSubmit={handleCustomSubmit} className="p-6 space-y-3.5">
            <button
              type="button"
              onClick={() => {
                setView('picker');
                setError(null);
              }}
              className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-800 mb-1"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Back to account picker
            </button>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Full Name</label>
              <input
                type="text"
                required
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                placeholder="e.g. Jordan Miller"
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Email Address</label>
              <input
                type="email"
                required
                value={customEmail}
                onChange={(e) => setCustomEmail(e.target.value)}
                placeholder="jordan@example.com"
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Organization Name (Optional)</label>
              <input
                type="text"
                value={customOrgName}
                onChange={(e) => setCustomOrgName(e.target.value)}
                placeholder="e.g. NextWave Labs"
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">Organization Category</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setCustomOrgType('Nonprofit')}
                  className={`p-2.5 rounded-lg border text-left text-xs transition-all flex items-center gap-2 ${
                    customOrgType === 'Nonprofit'
                      ? 'border-emerald-500 bg-emerald-50/60 font-semibold text-emerald-900 ring-1 ring-emerald-500'
                      : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <HeartHandshake className="w-4 h-4 text-emerald-600" />
                  <div>
                    <div>Nonprofit</div>
                    <div className="text-[10px] text-slate-400 font-normal">25% discount eligible</div>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => setCustomOrgType('Startup')}
                  className={`p-2.5 rounded-lg border text-left text-xs transition-all flex items-center gap-2 ${
                    customOrgType === 'Startup'
                      ? 'border-indigo-500 bg-indigo-50/60 font-semibold text-indigo-900 ring-1 ring-indigo-500'
                      : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <Building2 className="w-4 h-4 text-indigo-600" />
                  <div>
                    <div>Startup</div>
                    <div className="text-[10px] text-slate-400 font-normal">Pitch & launch focus</div>
                  </div>
                </button>
              </div>
            </div>

            <p className="text-[11px] text-slate-500 pt-1">
              New accounts will be directed to the Organization Onboarding step to set brand tone and target goals.
            </p>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs transition-colors shadow-xs"
            >
              {loading ? 'Creating simulated session...' : 'Continue to Onboarding'}
            </button>
          </form>
        )}

        {/* Footer info */}
        <div className="px-6 py-3 bg-slate-50 border-t border-slate-100 text-center">
          <p className="text-[11px] text-slate-400">
            To switch to live Google OAuth, update <code className="text-slate-600 font-mono">AUTH_MODE="google"</code> in <code className="text-slate-600 font-mono">src/config.ts</code>
          </p>
        </div>
      </div>
    </div>
  );
};
