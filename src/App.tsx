/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { User, ToolDefinition, SavedOutput, Invoice } from './types';
import { authService } from './services/authService';
import { dataService } from './services/dataService';
import { Header } from './components/Header';
import { Footer } from './components/Footer';
import { MarketingStudio } from './components/MarketingStudio';
import { LibraryView } from './components/LibraryView';
import { AccountBillingView } from './components/AccountBillingView';
import { AdminPanel } from './components/AdminPanel';
import { GoogleSignInModal } from './components/GoogleSignInModal';
import { OnboardingModal } from './components/OnboardingModal';
import { UpgradeModal } from './components/UpgradeModal';
import { StripeCheckoutModal } from './components/StripeCheckoutModal';
import { ReceiptModal } from './components/ReceiptModal';
import { StrategyCallModal } from './components/StrategyCallModal';
import { APP_CONFIG } from './config';
import {
  Sparkles,
  ArrowRight,
  ShieldCheck,
  Calendar,
  Building2,
  HeartHandshake,
  CheckCircle2,
  Lock,
  Layers,
  Zap,
} from 'lucide-react';

export default function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [activeView, setActiveView] = useState<'tools' | 'library' | 'account' | 'admin'>('tools');

  // Modals state
  const [signInModalOpen, setSignInModalOpen] = useState(false);
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [upgradeModalOpen, setUpgradeModalOpen] = useState(false);
  const [upgradeReason, setUpgradeReason] = useState<'limit_reached' | 'upgrade_click' | 'feature_locked'>('upgrade_click');
  const [stripeCheckoutPlan, setStripeCheckoutPlan] = useState<'free' | 'pro' | 'team' | null>(null);
  const [activeReceipt, setActiveReceipt] = useState<Invoice | null>(null);
  const [strategyModalOpen, setStrategyModalOpen] = useState(false);

  // Completed tools count tracker
  const [completedToolsCount, setCompletedToolsCount] = useState<number>(() => {
    return Number(localStorage.getItem('mla_completed_tools_count') || 0);
  });

  useEffect(() => {
    const unsubscribe = authService.onAuthChange((user) => {
      setCurrentUser(user);

      // If signed in but no organization profile set yet, prompt onboarding
      if (user && !user.organizationProfile) {
        setOnboardingOpen(true);
      }
    });

    return () => unsubscribe();
  }, []);

  const handleToolCompleted = () => {
    const nextCount = completedToolsCount + 1;
    setCompletedToolsCount(nextCount);
    localStorage.setItem('mla_completed_tools_count', String(nextCount));

    // One-time prompt offering free 30-minute strategy call after 3 tools
    const hasSeenStrategyModal = localStorage.getItem('mla_seen_strategy_modal');
    if (nextCount >= 3 && !hasSeenStrategyModal) {
      localStorage.setItem('mla_seen_strategy_modal', 'true');
      setTimeout(() => {
        setStrategyModalOpen(true);
      }, 1200);
    }
  };

  const handlePlanSelectedForCheckout = (planId: 'free' | 'pro' | 'team') => {
    setUpgradeModalOpen(false);
    if (planId === 'free') {
      // Free downgrade
      if (currentUser) {
        dataService.updateUser(currentUser.id, { planId: 'free' });
        setCurrentUser(dataService.getUserById(currentUser.id));
      }
      return;
    }
    setStripeCheckoutPlan(planId);
  };

  const handleCheckoutSuccess = (invoice?: Invoice) => {
    setStripeCheckoutPlan(null);
    if (currentUser) {
      setCurrentUser(dataService.getUserById(currentUser.id));
    }
    if (invoice) {
      setActiveReceipt(invoice);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900 selection:bg-rose-500 selection:text-white">
      {/* Header */}
      <Header
        currentUser={currentUser}
        activeView={activeView}
        onChangeView={setActiveView}
        onOpenSignIn={() => setSignInModalOpen(true)}
        onOpenUpgrade={() => {
          setUpgradeReason('upgrade_click');
          setUpgradeModalOpen(true);
        }}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {currentUser ? (
          <>
            {activeView === 'tools' && (
              <MarketingStudio
                user={currentUser}
                onUsageUpdated={(newUsage) => {
                  if (currentUser) {
                    setCurrentUser({ ...currentUser, generationsUsedThisMonth: newUsage });
                  }
                }}
                onRequireUpgrade={() => {
                  setUpgradeReason('upgrade_click');
                  setUpgradeModalOpen(true);
                }}
                onEditProfile={() => setOnboardingOpen(true)}
                onSavedToLibrary={() => {}}
                onToolCompleted={handleToolCompleted}
              />
            )}

            {activeView === 'library' && (
              <LibraryView user={currentUser} />
            )}

            {activeView === 'account' && (
              <AccountBillingView
                user={currentUser}
                onOpenUpgrade={() => {
                  setUpgradeReason('upgrade_click');
                  setUpgradeModalOpen(true);
                }}
                onEditProfile={() => setOnboardingOpen(true)}
                onViewReceipt={(inv) => setActiveReceipt(inv)}
                onUserUpdated={(u) => setCurrentUser(u)}
                onNavigateToTools={() => setActiveView('tools')}
                onNavigateToLibrary={() => setActiveView('library')}
              />
            )}

            {activeView === 'admin' && (
              <AdminPanel
                currentUser={currentUser}
                onImpersonateUser={(target) => {
                  authService.impersonateUser(target);
                  setActiveView('tools');
                }}
                onViewReceipt={(inv) => setActiveReceipt(inv)}
                onDataReset={() => {
                  setCurrentUser(authService.getCurrentUser());
                }}
              />
            )}
          </>
        ) : (
          /* Landing Screen when Signed Out */
          <div className="py-12 sm:py-20 text-center max-w-4xl mx-auto space-y-8">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-rose-50 text-rose-700 text-xs font-bold border border-rose-200">
              <Sparkles className="w-4 h-4 text-rose-600" />
              <span>Millennium Agency Client Marketing Suite</span>
            </div>

            <h1 className="text-4xl sm:text-6xl font-extrabold text-slate-900 tracking-tight font-heading leading-tight">
              Start Your Own Marketing with{' '}
              <span className="text-rose-600">Professional Agency Guidance</span>
            </h1>

            <p className="text-base sm:text-lg text-slate-600 max-w-2xl mx-auto leading-relaxed">
              Millennium Agency puts our battle-tested brand strategy, positioning, and 90-day execution blueprints into your hands—calibrated specifically for purpose-driven nonprofits and early-stage startups.
            </p>

            {/* Official Google Sign In Button */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
              <button
                onClick={() => setSignInModalOpen(true)}
                className="w-full sm:w-auto px-6 py-3.5 rounded-2xl bg-white hover:bg-slate-50 text-slate-800 text-sm font-bold border border-slate-300 shadow-md hover:shadow-lg flex items-center justify-center gap-3 transition-all hover:scale-[1.02]"
              >
                <svg className="w-5 h-5" viewBox="0 0 48 48">
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
                <span>Sign in with Google</span>
              </button>

              <a
                href={APP_CONFIG.AGENCY_CALENDLY_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full sm:w-auto px-6 py-3.5 rounded-2xl bg-slate-900 hover:bg-slate-800 text-white text-sm font-bold shadow-md hover:shadow-lg flex items-center justify-center gap-2 transition-all"
              >
                <Calendar className="w-4 h-4 text-rose-400" />
                <span>Talk to Linda Fanaras (CEO)</span>
              </a>
            </div>

            {/* Feature preview cards */}
            <div className="pt-12 grid grid-cols-1 md:grid-cols-3 gap-6 text-left">
              <div className="p-6 bg-white rounded-2xl border border-slate-200 shadow-xs space-y-2">
                <div className="w-9 h-9 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center font-bold">
                  1
                </div>
                <h3 className="font-bold text-slate-900 text-base">One Profile, 8 Tools</h3>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Enter your mission and audience once. Every tool generates cohesive brand assets without starting from scratch.
                </p>
              </div>

              <div className="p-6 bg-white rounded-2xl border border-slate-200 shadow-xs space-y-2">
                <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
                  2
                </div>
                <h3 className="font-bold text-slate-900 text-base">Nonprofit & Startup Specialization</h3>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Dedicated Donor Appeals & Grant narratives for 501(c)(3)s, and investor pitch scripts for fast-moving startups.
                </p>
              </div>

              <div className="p-6 bg-white rounded-2xl border border-slate-200 shadow-xs space-y-2">
                <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
                  3
                </div>
                <h3 className="font-bold text-slate-900 text-base">Production Ready Architecture</h3>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Clean service interfaces for Firebase Google Auth, Cloud Firestore, and Stripe Checkout ready for production deployment.
                </p>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <Footer />

      {/* =====================================================================
       * MODALS & OVERLAYS
       * ===================================================================== */}
      {/* Google Sign In Modal */}
      <GoogleSignInModal
        isOpen={signInModalOpen}
        onClose={() => setSignInModalOpen(false)}
        onSuccess={(user) => {
          setCurrentUser(user);
          if (!user.organizationProfile) {
            setOnboardingOpen(true);
          }
        }}
      />

      {/* Onboarding / Profile Setup Modal */}
      {currentUser && (
        <OnboardingModal
          user={currentUser}
          isOpen={onboardingOpen}
          isEditing={!!currentUser.organizationProfile}
          onCancel={() => setOnboardingOpen(false)}
          onComplete={(updatedUser) => {
            setCurrentUser(updatedUser);
            setOnboardingOpen(false);
          }}
        />
      )}

      {/* Upgrade Modal */}
      {currentUser && (
        <UpgradeModal
          user={currentUser}
          isOpen={upgradeModalOpen}
          onClose={() => setUpgradeModalOpen(false)}
          reason={upgradeReason}
          onSelectPlan={handlePlanSelectedForCheckout}
        />
      )}

      {/* Stripe Simulated Checkout Modal */}
      {stripeCheckoutPlan && currentUser && (
        <StripeCheckoutModal
          user={currentUser}
          targetPlanId={stripeCheckoutPlan}
          isOpen={!!stripeCheckoutPlan}
          onClose={() => setStripeCheckoutPlan(null)}
          onSuccess={handleCheckoutSuccess}
        />
      )}

      {/* Receipt Modal */}
      <ReceiptModal
        invoice={activeReceipt}
        isOpen={!!activeReceipt}
        onClose={() => setActiveReceipt(null)}
      />

      {/* Strategy Call Milestone Modal (Triggered after 3 tools) */}
      <StrategyCallModal
        isOpen={strategyModalOpen}
        onClose={() => setStrategyModalOpen(false)}
        orgName={currentUser?.organizationProfile?.orgName}
      />
    </div>
  );
}
