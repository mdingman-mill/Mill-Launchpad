/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import {
  User,
  Organization,
  SavedOutput,
  Invoice,
  PlatformSettings,
  TeamSummary,
  TeamInvite,
} from './types';
import { authService } from './services/authService';
import { dataService } from './services/dataService';
import { Header } from './components/Header';
import { Footer } from './components/Footer';
import { MarketingStudio } from './components/MarketingStudio';
import { LibraryView } from './components/LibraryView';
import { HistoryView } from './components/HistoryView';
import { AccountBillingView } from './components/AccountBillingView';
import { AdminPanel } from './components/AdminPanel';
import { OnboardingModal } from './components/OnboardingModal';
import { UpgradeModal } from './components/UpgradeModal';
import { ReceiptModal } from './components/ReceiptModal';
import { StrategyCallModal } from './components/StrategyCallModal';
import { InviteAcceptView } from './components/InviteAcceptView';
import { APP_CONFIG } from './config';
import {
  Sparkles,
  Calendar,
  Lock,
  Layers,
  Zap,
  AlertCircle,
  ShieldCheck,
  Building2,
  HeartHandshake,
} from 'lucide-react';

export default function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [currentOrganization, setCurrentOrganization] = useState<Organization | null>(() =>
    dataService.getCachedOrganization()
  );
  const [teams, setTeams] = useState<TeamSummary[]>(() => dataService.getCachedTeams());
  const [pendingTeamInvites, setPendingTeamInvites] = useState<TeamInvite[]>(() =>
    dataService.getCachedPendingTeamInvites()
  );
  const [activeView, setActiveView] = useState<'tools' | 'library' | 'history' | 'account' | 'admin'>('tools');
  const [accountTabRequest, setAccountTabRequest] = useState<
    { tab: 'plan' | 'teams' | 'activity' | 'profile' | 'billing' | 'team' | 'danger'; key: number } | undefined
  >(undefined);
  const [pendingToolLaunch, setPendingToolLaunch] = useState<{
    toolId: string;
    inputs: Record<string, string>;
    key: number;
  } | null>(null);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [signInError, setSignInError] = useState<string | null>(null);
  const [platformSettings, setPlatformSettings] = useState<PlatformSettings>(() =>
    dataService.getPlatformSettings()
  );

  // Invite link routing
  const [currentInviteId, setCurrentInviteId] = useState<string | null>(() => {
    if (typeof window !== 'undefined') {
      const path = window.location.pathname;
      if (path.startsWith('/invite/')) {
        return path.split('/invite/')[1]?.split('/')[0]?.split('?')[0] || null;
      }
    }
    return null;
  });

  // Modals state
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [upgradeModalOpen, setUpgradeModalOpen] = useState(false);
  const [upgradeReason, setUpgradeReason] = useState<'limit_reached' | 'upgrade_click' | 'feature_locked'>('upgrade_click');
  const [activeReceipt, setActiveReceipt] = useState<Invoice | null>(null);
  const [strategyModalOpen, setStrategyModalOpen] = useState(false);

  // Completed tools count tracker
  const [completedToolsCount, setCompletedToolsCount] = useState<number>(() => {
    return Number(localStorage.getItem('mla_completed_tools_count') || 0);
  });

  useEffect(() => {
    const handlePopState = () => {
      const path = window.location.pathname;
      if (path.startsWith('/invite/')) {
        setCurrentInviteId(path.split('/invite/')[1]?.split('/')[0]?.split('?')[0] || null);
      } else {
        setCurrentInviteId(null);
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  useEffect(() => {
    dataService.fetchPlatformSettings().then(setPlatformSettings);
    dataService.fetchPlansConfig().catch(() => {});

    const unsubscribe = authService.onAuthChange((user) => {
      setCurrentUser(user);
      setPlatformSettings(dataService.getPlatformSettings());
      setTeams(dataService.getCachedTeams());
      setPendingTeamInvites(dataService.getCachedPendingTeamInvites());

      if (user) {
        const cachedOrg = dataService.getCachedOrganization();
        const activeOrg =
          cachedOrg && (!user.organizationId || cachedOrg.id === user.organizationId) ? cachedOrg : null;

        if (activeOrg) {
          setCurrentOrganization(activeOrg);
        } else if (user.organizationId) {
          dataService
            .getOrganization(user.organizationId)
            .then((org) => {
              if (org) setCurrentOrganization(org);
            })
            .catch(() => {});
        }

        dataService
          .fetchTeams()
          .then((res) => {
            setTeams(res.teams || []);
            setPendingTeamInvites(res.pendingInvites || []);
          })
          .catch(() => {});

        const isOwnerOfActiveOrg = activeOrg ? activeOrg.ownerId === user.id : user.orgRole !== 'member';
        const isPersonalWorkspace = !user.organizationId || user.organizationId === `org_${user.id}`;
        if (!user.organizationProfile && isOwnerOfActiveOrg && isPersonalWorkspace) {
          setOnboardingOpen(true);
        }
      } else {
        setCurrentOrganization(null);
        setTeams([]);
        setPendingTeamInvites([]);
      }
    });

    return () => unsubscribe();
  }, []);

  const handleGoogleSignIn = async () => {
    try {
      setIsSigningIn(true);
      setSignInError(null);
      const user = await authService.signIn();
      setCurrentUser(user);
      const cachedOrg = dataService.getCachedOrganization();
      if (cachedOrg) {
        setCurrentOrganization(cachedOrg);
      }
      setTeams(dataService.getCachedTeams());
      setPendingTeamInvites(dataService.getCachedPendingTeamInvites());

      const isOwnerOfActiveOrg = cachedOrg ? cachedOrg.ownerId === user.id : user.orgRole !== 'member';
      const isPersonalWorkspace = !user.organizationId || user.organizationId === `org_${user.id}`;
      if (!user.organizationProfile && isOwnerOfActiveOrg && isPersonalWorkspace) {
        setOnboardingOpen(true);
      }
    } catch (err: any) {
      if (err?.code !== 'auth/popup-closed-by-user') {
        console.error('Sign-in error:', err);
        if (err?.code === 'auth/unauthorized-domain') {
          setSignInError(
            `This domain (${window.location.hostname}) is not authorized for Google Sign-In. Add it in Firebase Console → Authentication → Settings → Authorized domains.`
          );
        } else {
          setSignInError(err?.message || 'Authentication failed. Please try again.');
        }
      }
    } finally {
      setIsSigningIn(false);
    }
  };

  const handleSwitchTeam = async (organizationId: string) => {
    const res = await dataService.switchTeam(organizationId);
    setCurrentUser(res.user);
    setCurrentOrganization(res.organization);
    setTeams(res.teams);
    setPendingTeamInvites(res.pendingTeamInvites);
  };

  const handleCreateTeam = async (name: string, switchActive = true) => {
    const res = await dataService.createTeam(name, switchActive);
    setCurrentUser(res.user);
    if (switchActive) {
      setCurrentOrganization(res.organization);
    }
    setTeams(res.teams);
    setPendingTeamInvites(res.pendingTeamInvites);
  };

  const handleAcceptTeamInvite = async (inviteId: string) => {
    const res = await dataService.acceptTeamInvite(inviteId);
    setCurrentUser(res.user);
    setTeams(res.teams);
    setPendingTeamInvites(res.pendingTeamInvites);
  };

  const handleDeclineTeamInvite = async (inviteId: string) => {
    const res = await dataService.declineTeamInvite(inviteId);
    setTeams(res.teams);
    setPendingTeamInvites(res.pendingTeamInvites);
  };

  const handleOpenManageTeams = () => {
    setAccountTabRequest({ tab: 'teams', key: Date.now() });
    setActiveView('account');
  };

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

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900 selection:bg-rose-500 selection:text-white">
      {/* Header */}
      <Header
        currentUser={currentUser}
        currentOrganization={currentOrganization}
        teams={teams}
        pendingTeamInvites={pendingTeamInvites}
        activeView={activeView}
        onChangeView={setActiveView}
        onOpenSignIn={handleGoogleSignIn}
        onOpenUpgrade={() => {
          setUpgradeReason('upgrade_click');
          setUpgradeModalOpen(true);
        }}
        onSwitchTeam={handleSwitchTeam}
        onCreateTeam={(name) => handleCreateTeam(name, true)}
        onAcceptTeamInvite={handleAcceptTeamInvite}
        onDeclineTeamInvite={handleDeclineTeamInvite}
        onOpenManageTeams={handleOpenManageTeams}
      />

      {/* Main Content Area */}
      {currentInviteId ? (
        <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <InviteAcceptView
            inviteId={currentInviteId}
            currentUser={currentUser}
            onSignedIn={(user) => {
              setCurrentUser(user);
              const cachedOrg = dataService.getCachedOrganization();
              if (cachedOrg) setCurrentOrganization(cachedOrg);
            }}
            onContinueToApp={() => {
              setCurrentInviteId(null);
              window.history.pushState({}, '', '/');
              setActiveView('tools');
            }}
          />
        </main>
      ) : (
        <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
          {currentUser ? (
            <>
              {activeView === 'tools' && (
              <MarketingStudio
                user={currentUser}
                organization={currentOrganization}
                inviteOnlyMode={platformSettings.inviteOnlyMode}
                initialToolLaunch={pendingToolLaunch}
                onClearInitialToolLaunch={() => setPendingToolLaunch(null)}
                onUsageUpdated={(newOrgUsage, newMemberUsage) => {
                  if (currentUser) {
                    setCurrentUser({
                      ...currentUser,
                      generationsUsedThisMonth:
                        typeof newMemberUsage === 'number'
                          ? newMemberUsage
                          : (currentUser.generationsUsedThisMonth || 0) + 1,
                      totalGenerations: (currentUser.totalGenerations ?? currentUser.generationsUsedThisMonth ?? 0) + 1,
                    });
                  }
                  if (currentOrganization) {
                    setCurrentOrganization({
                      ...currentOrganization,
                      generationsUsedThisMonth: newOrgUsage,
                    });
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
              <LibraryView
                user={currentUser}
                organization={currentOrganization}
                onOpenToolWithInputs={(toolId, inputs) => {
                  setPendingToolLaunch({ toolId, inputs, key: Date.now() });
                  setActiveView('tools');
                }}
              />
            )}

            {activeView === 'history' && (
              <HistoryView
                user={currentUser}
                organization={currentOrganization}
                onRerun={(toolId, inputs) => {
                  setPendingToolLaunch({ toolId, inputs, key: Date.now() });
                  setActiveView('tools');
                }}
              />
            )}

            {activeView === 'account' && (
              <AccountBillingView
                user={currentUser}
                organization={currentOrganization}
                teams={teams}
                pendingTeamInvites={pendingTeamInvites}
                requestedTab={accountTabRequest}
                inviteOnlyMode={platformSettings.inviteOnlyMode}
                onOpenUpgrade={() => {
                  setUpgradeReason('upgrade_click');
                  setUpgradeModalOpen(true);
                }}
                onEditProfile={() => setOnboardingOpen(true)}
                onViewReceipt={(inv) => setActiveReceipt(inv)}
                onUserUpdated={(u) => setCurrentUser(u)}
                onOrganizationUpdated={(org) => setCurrentOrganization(org)}
                onTeamsChanged={(nextTeams, nextInvites) => {
                  setTeams(nextTeams);
                  setPendingTeamInvites(nextInvites);
                }}
                onSwitchTeam={handleSwitchTeam}
                onCreateTeam={(name) => handleCreateTeam(name, true)}
                onAcceptTeamInvite={handleAcceptTeamInvite}
                onDeclineTeamInvite={handleDeclineTeamInvite}
                onNavigateToTools={() => setActiveView('tools')}
                onNavigateToLibrary={() => setActiveView('library')}
              />
            )}

            {activeView === 'admin' && currentUser.role === 'super_admin' && (
              <AdminPanel
                currentUser={currentUser}
                inviteOnlyMode={platformSettings.inviteOnlyMode}
                onPlatformSettingsChanged={setPlatformSettings}
                onImpersonateUser={() => {}}
                onViewReceipt={(inv) => setActiveReceipt(inv)}
                onDataReset={() => {}}
              />
            )}
          </>
        ) : (
          /* Branded Sign-In Page for Signed-Out Visitors */
          <div className="py-12 sm:py-24 text-center max-w-3xl mx-auto space-y-8 animate-in fade-in duration-300">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-rose-50 text-rose-700 text-xs font-bold border border-rose-200 shadow-xs">
              <Sparkles className="w-4 h-4 text-rose-600" />
              <span>Millennium Agency Client Marketing Suite</span>
            </div>

            <div className="space-y-4">
              <h1 className="text-4xl sm:text-6xl font-extrabold text-slate-900 tracking-tight font-heading leading-tight">
                Start Your Marketing with{' '}
                <span className="text-rose-600">Agency Guidance Built In</span>
              </h1>

              <p className="text-base sm:text-lg text-slate-600 max-w-2xl mx-auto leading-relaxed">
                Welcome to Millennium Agency Launchpad. Sign in with your Google account to access your organization's tailored brand foundations, messaging toolkits, and 90-day execution plans.
              </p>
            </div>

            {platformSettings.inviteOnlyMode && (
              <div className="max-w-xl mx-auto p-3.5 bg-amber-50 border border-amber-200 rounded-2xl text-xs text-amber-900 flex items-center gap-2.5 text-left">
                <Lock className="w-4 h-4 text-amber-600 shrink-0" />
                <span>
                  <strong>Invite-Only Access Active:</strong> New self-account registrations and paid plans are currently disabled. Existing members and invited organizations can sign in below.
                </span>
              </div>
            )}

            {signInError && (
              <div className="max-w-md mx-auto p-3.5 bg-rose-50 border border-rose-200 rounded-2xl text-xs text-rose-800 flex items-center gap-2 text-left">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>{signInError}</span>
              </div>
            )}

            {/* Official Google Sign In Button */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-2">
              <button
                onClick={handleGoogleSignIn}
                disabled={isSigningIn}
                className="w-full sm:w-auto px-8 py-4 rounded-2xl bg-white hover:bg-slate-50 text-slate-800 text-sm font-bold border border-slate-300 shadow-md hover:shadow-xl flex items-center justify-center gap-3 transition-all hover:scale-[1.02] cursor-pointer disabled:opacity-50"
              >
                {isSigningIn ? (
                  <div className="w-5 h-5 border-2 border-slate-400 border-t-rose-600 rounded-full animate-spin" />
                ) : (
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
                )}
                <span>{isSigningIn ? 'Signing in with Google...' : 'Sign in with Google'}</span>
              </button>

              <a
                href={APP_CONFIG.AGENCY_CALENDLY_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full sm:w-auto px-6 py-4 rounded-2xl bg-slate-900 hover:bg-slate-800 text-white text-sm font-bold shadow-md hover:shadow-lg flex items-center justify-center gap-2 transition-all"
              >
                <Calendar className="w-4 h-4 text-rose-400" />
                <span>Talk to Linda Fanaras (CEO)</span>
              </a>
            </div>

            {/* Value Highlights */}
            <div className="pt-12 grid grid-cols-1 md:grid-cols-3 gap-6 text-left">
              <div className="p-6 bg-white rounded-2xl border border-slate-200 shadow-xs space-y-2">
                <div className="w-9 h-9 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center font-bold">
                  1
                </div>
                <h3 className="font-bold text-slate-900 text-base">One Profile, 8 Tools</h3>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Enter your mission and audience once. Every tool generates cohesive brand assets tailored for your organization.
                </p>
              </div>

              <div className="p-6 bg-white rounded-2xl border border-slate-200 shadow-xs space-y-2">
                <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
                  2
                </div>
                <h3 className="font-bold text-slate-900 text-base">Nonprofit & Startup Tracks</h3>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Dedicated Donor Appeals & Grant narratives for 501(c)(3)s, and investor pitch scripts for fast-moving startups.
                </p>
              </div>

              <div className="p-6 bg-white rounded-2xl border border-slate-200 shadow-xs space-y-2">
                <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
                  3
                </div>
                <h3 className="font-bold text-slate-900 text-base">
                  {platformSettings.inviteOnlyMode ? 'Invite-Only Access' : 'Free Starter Plan'}
                </h3>
                <p className="text-xs text-slate-500 leading-relaxed">
                  {platformSettings.inviteOnlyMode
                    ? 'Access is provisioned by invitation from Millennium Agency with complimentary Launchpad entitlements.'
                    : 'Get 50 complimentary generations every month with all 8 tools included and save deliverables to your library.'}
                </p>
              </div>
            </div>
          </div>
        )}
      </main>
      )}

      {/* Footer */}
      <Footer />

      {/* =====================================================================
       * MODALS & OVERLAYS
       * ===================================================================== */}
      {/* Onboarding / Profile Setup Modal */}
      {currentUser && (
        <OnboardingModal
          user={currentUser}
          isOpen={onboardingOpen}
          isEditing={!!currentUser.organizationProfile}
          onCancel={() => setOnboardingOpen(false)}
          onComplete={(updatedUser) => {
            setCurrentUser(updatedUser);
            const cachedOrg = dataService.getCachedOrganization();
            if (cachedOrg) setCurrentOrganization(cachedOrg);
            setOnboardingOpen(false);
          }}
        />
      )}

      {/* Upgrade Modal */}
      {currentUser && (
        <UpgradeModal
          user={currentUser}
          inviteOnlyMode={platformSettings.inviteOnlyMode}
          isOpen={upgradeModalOpen}
          onClose={() => setUpgradeModalOpen(false)}
          reason={upgradeReason}
          onSelectPlan={() => setUpgradeModalOpen(false)}
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
