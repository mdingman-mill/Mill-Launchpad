import React, { useState, useEffect } from 'react';
import { User, Invite } from '../types';
import { dataService } from '../services/dataService';
import { authService } from '../services/authService';
import {
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Clock,
  ShieldCheck,
  Zap,
  ArrowRight,
  LogOut,
  Layers,
  Wand2,
} from 'lucide-react';

interface InviteAcceptViewProps {
  inviteId: string;
  currentUser: User | null;
  onSignedIn: (user: User) => void;
  onContinueToApp: () => void;
}

export const InviteAcceptView: React.FC<InviteAcceptViewProps> = ({
  inviteId,
  currentUser,
  onSignedIn,
  onContinueToApp,
}) => {
  const [invite, setInvite] = useState<Invite | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isClaiming, setIsClaiming] = useState(false);
  const [claimedSuccess, setClaimedSuccess] = useState(false);
  const [isSigningIn, setIsSigningIn] = useState(false);

  useEffect(() => {
    let isMounted = true;
    async function loadInvite() {
      try {
        setLoading(true);
        setError(null);
        const data = await dataService.getInvite(inviteId);
        if (!isMounted) return;
        if (!data) {
          setError('Invitation not found or invalid link. Please verify the link with your Millennium Agency contact.');
        } else {
          setInvite(data);
          // If already signed in with matching email and invite is pending, auto-accept
          if (currentUser && currentUser.email.toLowerCase() === data.email.toLowerCase() && data.status === 'pending') {
            handleAutoClaim();
          }
        }
      } catch (err: any) {
        if (!isMounted) return;
        setError(err.message || 'Failed to load invitation.');
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    loadInvite();
    return () => {
      isMounted = false;
    };
  }, [inviteId, currentUser?.email]);

  const handleAutoClaim = async () => {
    try {
      setIsClaiming(true);
      const updatedUser = await dataService.acceptInvite(inviteId);
      onSignedIn(updatedUser);
      setClaimedSuccess(true);
      setInvite((prev) => (prev ? { ...prev, status: 'accepted' } : null));
    } catch (err: any) {
      console.warn('Auto-claim warning:', err.message);
    } finally {
      setIsClaiming(false);
    }
  };

  const handleGoogleSignIn = async () => {
    try {
      setIsSigningIn(true);
      setError(null);
      const user = await authService.signIn();
      onSignedIn(user);
    } catch (err: any) {
      if (err?.code !== 'auth/popup-closed-by-user') {
        if (err?.code === 'auth/unauthorized-domain') {
          setError(
            `This domain (${window.location.hostname}) is not authorized for Google Sign-In. Add it in Firebase Console → Authentication → Settings → Authorized domains.`
          );
        } else {
          setError(err?.message || 'Authentication failed. Please try again.');
        }
      }
    } finally {
      setIsSigningIn(false);
    }
  };

  const handleManualClaim = async () => {
    try {
      setIsClaiming(true);
      setError(null);
      const updatedUser = await dataService.acceptInvite(inviteId);
      onSignedIn(updatedUser);
      setClaimedSuccess(true);
      setInvite((prev) => (prev ? { ...prev, status: 'accepted' } : null));
    } catch (err: any) {
      setError(err?.message || 'Failed to claim invitation.');
    } finally {
      setIsClaiming(false);
    }
  };

  const handleSignOutAndSwitch = async () => {
    await authService.signOut();
  };

  if (loading) {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center space-y-4">
        <div className="w-10 h-10 border-4 border-slate-200 border-t-rose-600 rounded-full animate-spin" />
        <p className="text-sm font-semibold text-slate-500">Verifying invitation...</p>
      </div>
    );
  }

  if (error && !invite) {
    return (
      <div className="max-w-md mx-auto my-12 p-8 bg-white rounded-3xl border border-slate-200 shadow-xl text-center space-y-6">
        <div className="w-14 h-14 mx-auto rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center">
          <AlertCircle className="w-7 h-7" />
        </div>
        <div className="space-y-2">
          <h2 className="text-xl font-extrabold text-slate-900 font-heading">Invalid Invitation</h2>
          <p className="text-xs text-slate-500 leading-relaxed">{error}</p>
        </div>
        <button
          onClick={onContinueToApp}
          className="w-full py-3 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl transition-all"
        >
          Return to Launchpad
        </button>
      </div>
    );
  }

  const isEmailMatching = currentUser && invite && currentUser.email.toLowerCase() === invite.email.toLowerCase();
  const isExpired = invite?.status === 'expired' || (invite?.expiresAt && new Date(invite.expiresAt).getTime() <= Date.now());
  const isRevoked = invite?.status === 'revoked';
  const isAlreadyAccepted = invite?.status === 'accepted' || currentUser?.planId === 'complimentary';

  return (
    <div className="max-w-xl mx-auto my-8 sm:my-16 px-4 animate-in fade-in duration-300">
      <div className="bg-white rounded-3xl border border-slate-200 shadow-xl overflow-hidden">
        {/* Header Ribbon */}
        <div className="bg-gradient-to-r from-slate-900 via-rose-950 to-slate-900 p-6 sm:p-8 text-white text-center space-y-2">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30 text-[11px] font-bold tracking-wide uppercase">
            <Sparkles className="w-3.5 h-3.5 text-rose-400" />
            <span>VIP Complimentary Access</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold font-heading tracking-tight">
            You've Been Invited
          </h1>
          <p className="text-xs sm:text-sm text-slate-300 max-w-md mx-auto">
            Millennium Agency has invited you to access the Launchpad Marketing Suite with full Complimentary benefits.
          </p>
        </div>

        {/* Content Body */}
        <div className="p-6 sm:p-8 space-y-6">
          {/* Plan Feature Highlight */}
          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Included Plan</span>
              <span className="px-2.5 py-1 rounded-full text-xs font-extrabold bg-rose-100 text-rose-800 border border-rose-200">
                Complimentary
              </span>
            </div>
            <div className="grid grid-cols-2 gap-3 pt-1">
              <div className="p-3 bg-white rounded-xl border border-slate-200 shadow-2xs">
                <div className="flex items-center gap-2 text-rose-600 mb-1">
                  <Zap className="w-4 h-4" />
                  <span className="text-xs font-bold text-slate-900">2,000 / mo</span>
                </div>
                <span className="text-[11px] text-slate-500 block">AI Generations</span>
              </div>
              <div className="p-3 bg-white rounded-xl border border-slate-200 shadow-2xs">
                <div className="flex items-center gap-2 text-rose-600 mb-1">
                  <Wand2 className="w-4 h-4" />
                  <span className="text-xs font-bold text-slate-900">Full Access</span>
                </div>
                <span className="text-[11px] text-slate-500 block">All 8 Marketing Tools</span>
              </div>
            </div>
            {invite?.note && (
              <div className="pt-2 border-t border-slate-200 text-xs text-slate-600 italic">
                <span className="font-semibold text-slate-700 not-italic">Note: </span>"{invite.note}"
              </div>
            )}
          </div>

          {/* Invited Email Badge */}
          <div className="text-center space-y-1">
            <span className="text-[11px] text-slate-400 uppercase font-bold tracking-wider">Invitation Issued For</span>
            <div className="font-mono text-sm font-bold text-slate-900 bg-slate-100 py-1.5 px-4 rounded-xl inline-block border border-slate-200">
              {invite?.email}
            </div>
          </div>

          {/* Error notice if any */}
          {error && (
            <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-2xl text-xs text-rose-800 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* STATUS FLOWS */}
          {isRevoked ? (
            <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl text-center space-y-3">
              <div className="w-10 h-10 mx-auto rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center">
                <AlertCircle className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <h3 className="text-sm font-bold text-rose-900">Invitation Revoked</h3>
                <p className="text-xs text-rose-700">
                  This invitation has been revoked by a Millennium Agency super administrator.
                </p>
              </div>
              <button
                onClick={onContinueToApp}
                className="px-4 py-2 bg-slate-900 text-white text-xs font-bold rounded-xl"
              >
                Go to Launchpad Home
              </button>
            </div>
          ) : isExpired ? (
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl text-center space-y-3">
              <div className="w-10 h-10 mx-auto rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center">
                <Clock className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <h3 className="text-sm font-bold text-amber-900">Invitation Expired</h3>
                <p className="text-xs text-amber-700">
                  This invitation has expired. Please reach out to your administrator to request a new invite.
                </p>
              </div>
              <button
                onClick={onContinueToApp}
                className="px-4 py-2 bg-slate-900 text-white text-xs font-bold rounded-xl"
              >
                Go to Launchpad Home
              </button>
            </div>
          ) : (claimedSuccess || isAlreadyAccepted) && isEmailMatching ? (
            /* Successful Acceptance State */
            <div className="p-6 bg-emerald-50 border border-emerald-200 rounded-2xl text-center space-y-4">
              <div className="w-12 h-12 mx-auto rounded-2xl bg-emerald-600 text-white flex items-center justify-center shadow-md">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h3 className="text-lg font-bold text-emerald-950 font-heading">
                  Complimentary Plan Active
                </h3>
                <p className="text-xs text-emerald-800 max-w-sm mx-auto">
                  Your account is upgraded to the Complimentary plan with 2,000 monthly generations and full tool access.
                </p>
              </div>
              <button
                onClick={onContinueToApp}
                className="w-full py-3.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl flex items-center justify-center gap-2 transition-all shadow-md cursor-pointer"
              >
                <span>Enter Millennium Launchpad</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          ) : !currentUser ? (
            /* Signed Out State -> Prompt Google Sign In */
            <div className="space-y-4 text-center">
              <p className="text-xs text-slate-500">
                To claim this invitation, sign in with your Google account matching <strong className="text-slate-800">{invite?.email}</strong>.
              </p>
              <button
                onClick={handleGoogleSignIn}
                disabled={isSigningIn}
                className="w-full py-3.5 px-6 rounded-2xl bg-white hover:bg-slate-50 text-slate-800 text-sm font-bold border border-slate-300 shadow-md flex items-center justify-center gap-3 transition-all hover:scale-[1.01] cursor-pointer disabled:opacity-50"
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
                <span>Sign in with Google to Claim</span>
              </button>
            </div>
          ) : !isEmailMatching ? (
            /* Signed in with DIFFERENT Email -> Warning */
            <div className="p-5 bg-amber-50 border border-amber-200 rounded-2xl space-y-3">
              <div className="flex items-center gap-2 text-amber-900 font-bold text-xs">
                <AlertCircle className="w-4 h-4 text-amber-700 shrink-0" />
                <span>Signed in as a different user</span>
              </div>
              <p className="text-xs text-amber-800 leading-relaxed">
                This invitation is strictly designated for <strong className="font-semibold">{invite?.email}</strong>. You are currently signed in as <strong className="font-semibold">{currentUser.email}</strong>.
              </p>
              <div className="pt-2 flex items-center gap-3">
                <button
                  onClick={handleSignOutAndSwitch}
                  className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Switch Account</span>
                </button>
                <button
                  onClick={onContinueToApp}
                  className="px-4 py-2 text-slate-600 hover:text-slate-900 text-xs font-semibold"
                >
                  Continue as {currentUser.name}
                </button>
              </div>
            </div>
          ) : (
            /* Signed in with MATCHING email -> Claim Button */
            <div className="space-y-4">
              <div className="p-3 bg-emerald-50 text-emerald-800 text-xs rounded-xl border border-emerald-200 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>Signed in as <strong>{currentUser.email}</strong> (Matches invitation)</span>
              </div>
              <button
                onClick={handleManualClaim}
                disabled={isClaiming}
                className="w-full py-3.5 bg-rose-600 hover:bg-rose-700 text-white text-sm font-bold rounded-xl shadow-md flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50"
              >
                {isClaiming ? (
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    <span>Activate Complimentary Access</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
