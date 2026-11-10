import React, { useState } from 'react';
import { User } from '../types';
import { authService } from '../services/authService';
import { DemoModeBadge } from './DemoModeBadge';
import { APP_CONFIG } from '../config';
import {
  Sparkles,
  Calendar,
  LogOut,
  UserCheck,
  Shield,
  Layers,
  Bookmark,
  CreditCard,
  ChevronDown,
  Eye,
  ArrowRight,
  ExternalLink,
} from 'lucide-react';

interface HeaderProps {
  currentUser: User | null;
  activeView: 'tools' | 'library' | 'account' | 'admin';
  onChangeView: (view: 'tools' | 'library' | 'account' | 'admin') => void;
  onOpenSignIn: () => void;
  onOpenUpgrade: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentUser,
  activeView,
  onChangeView,
  onOpenSignIn,
  onOpenUpgrade,
}) => {
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);
  const impersonator = authService.getImpersonatingAdmin();

  const handleSignOut = () => {
    setUserDropdownOpen(false);
    authService.signOut();
  };

  const handleStopImpersonating = () => {
    authService.stopImpersonating();
    onChangeView('admin');
  };

  const isAdminRole =
    currentUser?.role === 'super_admin' ||
    currentUser?.role === 'admin' ||
    currentUser?.role === 'support';

  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200">
      {/* Impersonation Notification Banner */}
      {impersonator && currentUser && (
        <div className="bg-amber-500 text-slate-950 px-4 py-2 text-xs font-bold flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Eye className="w-4 h-4 animate-pulse" />
            <span>
              Impersonation Active: Currently viewing Launchpad as <strong>{currentUser.name}</strong> ({currentUser.organizationProfile?.orgName || currentUser.email})
            </span>
          </div>

          <button
            onClick={handleStopImpersonating}
            className="px-3 py-1 bg-slate-950 text-white rounded-lg text-xs font-bold hover:bg-slate-800 transition-colors flex items-center gap-1 shadow-xs"
          >
            <span>Exit to Admin View</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Left: Millennium Agency Brand Logo */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => onChangeView('tools')}
            className="flex items-center gap-2.5 text-left group"
          >
            {/* Custom stylized Millennium Agency Icon */}
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-slate-900 to-slate-950 border border-slate-800 flex items-center justify-center text-white font-extrabold text-base shadow-sm group-hover:scale-105 transition-transform">
              <span className="text-rose-500 font-heading">M</span>
            </div>

            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-extrabold text-sm sm:text-base text-slate-900 tracking-tight font-heading">
                  Millennium Agency
                </span>
                <span className="hidden sm:inline-block px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-rose-50 text-rose-700 border border-rose-200">
                  Launchpad
                </span>
              </div>
              <p className="text-[10px] text-slate-500 hidden md:block">
                AI Marketing Suite for Nonprofits & Startups
              </p>
            </div>
          </button>

          <div className="ml-2">
            <DemoModeBadge />
          </div>
        </div>

        {/* Center / Navigation Links (Desktop) */}
        {currentUser && (
          <nav className="hidden md:flex items-center gap-1 text-xs font-bold">
            <button
              onClick={() => onChangeView('tools')}
              className={`px-3 py-2 rounded-xl transition-colors flex items-center gap-1.5 ${
                activeView === 'tools'
                  ? 'bg-slate-100 text-slate-900 font-extrabold'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              <Layers className="w-4 h-4 text-rose-600" />
              <span>Marketing Tools</span>
            </button>

            <button
              onClick={() => onChangeView('library')}
              className={`px-3 py-2 rounded-xl transition-colors flex items-center gap-1.5 ${
                activeView === 'library'
                  ? 'bg-slate-100 text-slate-900 font-extrabold'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              <Bookmark className="w-4 h-4 text-blue-600" />
              <span>My Library</span>
            </button>

            <button
              onClick={() => onChangeView('account')}
              className={`px-3 py-2 rounded-xl transition-colors flex items-center gap-1.5 ${
                activeView === 'account'
                  ? 'bg-slate-100 text-slate-900 font-extrabold'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              <CreditCard className="w-4 h-4 text-emerald-600" />
              <span>Account & Billing</span>
            </button>

            {isAdminRole && (
              <button
                onClick={() => onChangeView('admin')}
                className={`px-3 py-2 rounded-xl transition-colors flex items-center gap-1.5 ${
                  activeView === 'admin'
                    ? 'bg-rose-50 text-rose-800 font-extrabold'
                    : 'text-slate-600 hover:text-rose-700 hover:bg-rose-50/50'
                }`}
              >
                <Shield className="w-4 h-4 text-rose-600" />
                <span>Admin Portal</span>
              </button>
            )}
          </nav>
        )}

        {/* Right: Agency Connection Button + User Avatar / Sign In */}
        <div className="flex items-center gap-3">
          {/* Persistent Agency Consultation Link */}
          <a
            href={APP_CONFIG.AGENCY_CALENDLY_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition-all shadow-xs"
            title="Book a free consultation with Linda Fanaras, CEO of Millennium Agency"
          >
            <Calendar className="w-3.5 h-3.5 text-rose-400" />
            <span>Need help? Talk to Millennium</span>
          </a>

          {currentUser ? (
            /* User profile dropdown */
            <div className="relative">
              <button
                onClick={() => setUserDropdownOpen(!userDropdownOpen)}
                className="flex items-center gap-2 p-1.5 rounded-xl hover:bg-slate-100 transition-colors border border-transparent hover:border-slate-200"
              >
                <img
                  src={currentUser.avatar}
                  alt={currentUser.name}
                  className="w-8 h-8 rounded-full object-cover border border-slate-200"
                />
                <div className="hidden lg:block text-left">
                  <div className="text-xs font-bold text-slate-900 leading-tight">
                    {currentUser.name}
                  </div>
                  <div className="text-[10px] text-slate-500 uppercase font-mono">
                    {currentUser.planId} Plan
                  </div>
                </div>
                <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
              </button>

              {userDropdownOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setUserDropdownOpen(false)} />
                  <div className="absolute right-0 mt-2 w-64 bg-white rounded-2xl shadow-xl border border-slate-200 z-50 p-2 text-xs text-slate-700 animate-in fade-in zoom-in-95 duration-150">
                    <div className="p-3 border-b border-slate-100">
                      <p className="font-bold text-slate-900">{currentUser.name}</p>
                      <p className="text-[11px] text-slate-500 truncate">{currentUser.email}</p>
                      <p className="text-[11px] text-rose-600 font-semibold mt-0.5">
                        {currentUser.organizationProfile?.orgName}
                      </p>
                    </div>

                    <div className="py-1">
                      <button
                        onClick={() => {
                          setUserDropdownOpen(false);
                          onChangeView('account');
                        }}
                        className="w-full text-left px-3 py-2 rounded-lg hover:bg-slate-50 font-medium flex items-center justify-between"
                      >
                        <span>Subscription & Usage</span>
                        <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-slate-100 text-slate-700">
                          {currentUser.planId}
                        </span>
                      </button>

                      {isAdminRole && (
                        <button
                          onClick={() => {
                            setUserDropdownOpen(false);
                            onChangeView('admin');
                          }}
                          className="w-full text-left px-3 py-2 rounded-lg hover:bg-slate-50 font-medium text-rose-700 flex items-center gap-2"
                        >
                          <Shield className="w-3.5 h-3.5" />
                          <span>Admin Control Panel</span>
                        </button>
                      )}

                      <button
                        onClick={() => {
                          setUserDropdownOpen(false);
                          onOpenSignIn();
                        }}
                        className="w-full text-left px-3 py-2 rounded-lg hover:bg-slate-50 font-medium text-blue-700 flex items-center gap-2"
                      >
                        <UserCheck className="w-3.5 h-3.5" />
                        <span>Switch Simulated Account</span>
                      </button>
                    </div>

                    <div className="pt-1 border-t border-slate-100">
                      <button
                        onClick={handleSignOut}
                        className="w-full text-left px-3 py-2 rounded-lg hover:bg-rose-50 text-rose-600 font-medium flex items-center gap-2"
                      >
                        <LogOut className="w-3.5 h-3.5" />
                        <span>Sign Out</span>
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          ) : (
            /* Styled Google Sign-In Button on Header */
            <button
              onClick={onOpenSignIn}
              className="px-3.5 py-2 rounded-xl bg-white hover:bg-slate-50 text-slate-800 text-xs font-bold border border-slate-300 shadow-xs flex items-center gap-2 transition-all hover:shadow-sm"
            >
              <svg className="w-4 h-4" viewBox="0 0 48 48">
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
          )}
        </div>
      </div>

      {/* Mobile subnavigation bar */}
      {currentUser && (
        <div className="md:hidden border-t border-slate-100 px-4 py-2 flex items-center justify-around bg-slate-50 text-[11px] font-bold">
          <button
            onClick={() => onChangeView('tools')}
            className={`px-2 py-1 rounded-lg ${activeView === 'tools' ? 'bg-white shadow-xs text-rose-600' : 'text-slate-600'}`}
          >
            Tools
          </button>
          <button
            onClick={() => onChangeView('library')}
            className={`px-2 py-1 rounded-lg ${activeView === 'library' ? 'bg-white shadow-xs text-blue-600' : 'text-slate-600'}`}
          >
            Library
          </button>
          <button
            onClick={() => onChangeView('account')}
            className={`px-2 py-1 rounded-lg ${activeView === 'account' ? 'bg-white shadow-xs text-emerald-600' : 'text-slate-600'}`}
          >
            Billing
          </button>
          {isAdminRole && (
            <button
              onClick={() => onChangeView('admin')}
              className={`px-2 py-1 rounded-lg ${activeView === 'admin' ? 'bg-white shadow-xs text-rose-600' : 'text-slate-600'}`}
            >
              Admin
            </button>
          )}
        </div>
      )}
    </header>
  );
};
