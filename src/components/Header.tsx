import React, { useState, useMemo, useEffect, useRef } from 'react';
import { User, Organization, TeamSummary, TeamInvite } from '../types';
import { authService } from '../services/authService';
import { APP_CONFIG } from '../config';
import {
  Calendar,
  LogOut,
  UserCheck,
  Shield,
  Layers,
  Bookmark,
  History,
  CreditCard,
  ChevronDown,
  Users,
  Check,
  Plus,
  Settings,
  Building2,
  Mail,
  ShieldCheck,
} from 'lucide-react';

interface HeaderProps {
  currentUser: User | null;
  currentOrganization?: Organization | null;
  teams?: TeamSummary[];
  pendingTeamInvites?: TeamInvite[];
  activeView: 'tools' | 'library' | 'history' | 'account' | 'admin';
  onChangeView: (view: 'tools' | 'library' | 'history' | 'account' | 'admin') => void;
  onOpenSignIn: () => void;
  onOpenUpgrade: () => void;
  onSwitchTeam?: (organizationId: string) => Promise<void> | void;
  onCreateTeam?: (name: string) => Promise<void> | void;
  onAcceptTeamInvite?: (inviteId: string) => Promise<void> | void;
  onDeclineTeamInvite?: (inviteId: string) => Promise<void> | void;
  onOpenManageTeams?: () => void;
  onOpenAccountTab?: (tab: 'plan' | 'teams' | 'activity' | 'profile' | 'billing' | 'team' | 'danger') => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentUser,
  currentOrganization,
  teams = [],
  pendingTeamInvites = [],
  activeView,
  onChangeView,
  onOpenSignIn,
  onSwitchTeam,
  onCreateTeam,
  onAcceptTeamInvite,
  onDeclineTeamInvite,
  onOpenManageTeams,
  onOpenAccountTab,
}) => {
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);
  const [teamDropdownOpen, setTeamDropdownOpen] = useState(false);
  const [creatingTeam, setCreatingTeam] = useState(false);
  const [newTeamName, setNewTeamName] = useState('');
  const [teamBusyId, setTeamBusyId] = useState<string | null>(null);
  const [teamSwitchError, setTeamSwitchError] = useState<string | null>(null);

  const userMenuRef = useRef<HTMLDivElement>(null);
  const teamMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!userDropdownOpen && !teamDropdownOpen) return;

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (userDropdownOpen && userMenuRef.current && !userMenuRef.current.contains(target)) {
        setUserDropdownOpen(false);
      }
      if (teamDropdownOpen && teamMenuRef.current && !teamMenuRef.current.contains(target)) {
        setTeamDropdownOpen(false);
        setCreatingTeam(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setUserDropdownOpen(false);
        setTeamDropdownOpen(false);
        setCreatingTeam(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [userDropdownOpen, teamDropdownOpen]);

  const handleSignOut = () => {
    setUserDropdownOpen(false);
    setTeamDropdownOpen(false);
    authService.signOut();
  };

  const isAdminRole = currentUser?.role === 'super_admin';
  const activeOrgId = currentOrganization?.id || currentUser?.organizationId || (currentUser ? `org_${currentUser.id}` : '');

  const orderedTeams = useMemo(() => {
    const list = [...teams];
    list.sort((a, b) => {
      if (a.isPersonal && !b.isPersonal) return -1;
      if (!a.isPersonal && b.isPersonal) return 1;
      return (a.name || '').localeCompare(b.name || '');
    });
    return list;
  }, [teams]);

  const activeTeamSummary = orderedTeams.find((t) => t.id === activeOrgId) || null;
  const activeTeamName =
    currentOrganization?.name ||
    activeTeamSummary?.name ||
    currentUser?.organizationProfile?.orgName ||
    'Personal Workspace';
  const activePlanId = currentOrganization?.planId || activeTeamSummary?.planId || currentUser?.planId || 'free';
  const atMaxTeams = orderedTeams.length >= 10;

  const handleSelectTeam = async (orgId: string) => {
    if (!onSwitchTeam || orgId === activeOrgId || teamBusyId) {
      if (orgId === activeOrgId) setTeamDropdownOpen(false);
      return;
    }
    try {
      setTeamBusyId(orgId);
      setTeamSwitchError(null);
      await onSwitchTeam(orgId);
      setTeamDropdownOpen(false);
    } catch (err: any) {
      setTeamSwitchError(err?.message || 'Unable to switch team.');
    } finally {
      setTeamBusyId(null);
    }
  };

  const handleQuickCreateTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = newTeamName.trim();
    if (!cleaned || !onCreateTeam || teamBusyId) return;
    try {
      setTeamBusyId('create');
      setTeamSwitchError(null);
      await onCreateTeam(cleaned);
      setNewTeamName('');
      setCreatingTeam(false);
      setTeamDropdownOpen(false);
    } catch (err: any) {
      setTeamSwitchError(err?.message || 'Unable to create team.');
    } finally {
      setTeamBusyId(null);
    }
  };

  const handleInviteDecision = async (inviteId: string, decision: 'accept' | 'decline') => {
    if (teamBusyId) return;
    try {
      setTeamBusyId(`invite:${inviteId}`);
      setTeamSwitchError(null);
      if (decision === 'accept' && onAcceptTeamInvite) {
        await onAcceptTeamInvite(inviteId);
      } else if (decision === 'decline' && onDeclineTeamInvite) {
        await onDeclineTeamInvite(inviteId);
      }
    } catch (err: any) {
      setTeamSwitchError(err?.message || `Unable to ${decision} invitation.`);
    } finally {
      setTeamBusyId(null);
    }
  };

  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200">
      {/* Secondary Utility Navigation: Agency Consultation + User Account */}
      <div className="bg-slate-50/90 border-b border-slate-200/80">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-11 flex items-center justify-between gap-3">
          <p className="hidden sm:block text-[11px] font-medium text-slate-500 truncate">
            AI Marketing Suite for Nonprofits &amp; Startups
          </p>

          <nav aria-label="Secondary navigation" className="flex items-center gap-2.5 sm:gap-3 ml-auto">
            <a
              href={APP_CONFIG.AGENCY_CALENDLY_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition-all shadow-xs whitespace-nowrap"
              title="Book a free consultation with Linda Fanaras, CEO of Millennium Agency"
            >
              <Calendar className="w-3.5 h-3.5 text-rose-400 shrink-0" />
              <span className="hidden sm:inline">Need help? Talk to Millennium</span>
              <span className="sm:hidden">Talk to Millennium</span>
            </a>

            {currentUser ? (
              <div ref={userMenuRef} className="relative">
                <button
                  type="button"
                  aria-expanded={userDropdownOpen}
                  aria-haspopup="menu"
                  onClick={() => {
                    setUserDropdownOpen(!userDropdownOpen);
                    setTeamDropdownOpen(false);
                  }}
                  className="flex items-center gap-2 px-2 py-1 rounded-lg hover:bg-slate-200/70 transition-colors border border-transparent hover:border-slate-200 cursor-pointer"
                >
                  <img
                    src={currentUser.avatar}
                    alt={currentUser.name}
                    className="w-6 h-6 rounded-full object-cover border border-slate-200"
                  />
                  <div className="hidden sm:flex items-center gap-1.5 text-left">
                    <span className="text-xs font-bold text-slate-900 leading-tight max-w-[140px] truncate">
                      {currentUser.name}
                    </span>
                    <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase font-mono bg-slate-200/80 text-slate-700">
                      {activePlanId}
                    </span>
                  </div>
                  <ChevronDown className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                </button>

                {userDropdownOpen && (
                  <div className="absolute right-0 mt-2 w-64 bg-white rounded-2xl shadow-xl border border-slate-200 z-50 p-2 text-xs text-slate-700 animate-in fade-in zoom-in-95 duration-150">
                    <div className="p-3 border-b border-slate-100">
                      <p className="font-bold text-slate-900">{currentUser.name}</p>
                      <p className="text-[11px] text-slate-500 truncate">{currentUser.email}</p>
                      <p className="text-[11px] text-rose-600 font-semibold mt-0.5 truncate">
                        {activeTeamName}
                      </p>
                    </div>

                    <div className="py-1">
                      <button
                        type="button"
                        onClick={() => {
                          setUserDropdownOpen(false);
                          if (onOpenAccountTab) {
                            onOpenAccountTab('plan');
                          } else {
                            onChangeView('account');
                          }
                        }}
                        className="w-full text-left px-3 py-2 rounded-lg hover:bg-slate-50 font-medium flex items-center justify-between cursor-pointer"
                      >
                        <span>Subscription &amp; Usage</span>
                        <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-slate-100 text-slate-700">
                          {activePlanId}
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setUserDropdownOpen(false);
                          if (onOpenAccountTab) {
                            onOpenAccountTab('profile');
                          } else {
                            onChangeView('account');
                          }
                        }}
                        className="w-full text-left px-3 py-2 rounded-lg hover:bg-slate-50 font-medium flex items-center gap-2 cursor-pointer"
                      >
                        <ShieldCheck className="w-3.5 h-3.5 text-slate-500" />
                        <span>Organization Profile</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setUserDropdownOpen(false);
                          if (onOpenAccountTab) {
                            onOpenAccountTab('teams');
                          } else {
                            onOpenManageTeams?.();
                          }
                        }}
                        className="w-full text-left px-3 py-2 rounded-lg hover:bg-slate-50 font-medium flex items-center justify-between cursor-pointer"
                      >
                        <span className="flex items-center gap-2">
                          <Users className="w-3.5 h-3.5 text-slate-500" />
                          <span>Manage Teams</span>
                        </span>
                        <span className="text-[10px] font-mono text-slate-500">{orderedTeams.length}/10</span>
                      </button>

                      {isAdminRole && (
                        <button
                          type="button"
                          onClick={() => {
                            setUserDropdownOpen(false);
                            onChangeView('admin');
                          }}
                          className="w-full text-left px-3 py-2 rounded-lg hover:bg-slate-50 font-medium text-rose-700 flex items-center gap-2 cursor-pointer"
                        >
                          <Shield className="w-3.5 h-3.5" />
                          <span>Admin Control Panel</span>
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => {
                          setUserDropdownOpen(false);
                          onOpenSignIn();
                        }}
                        className="w-full text-left px-3 py-2 rounded-lg hover:bg-slate-50 font-medium text-blue-700 flex items-center gap-2 cursor-pointer"
                      >
                        <UserCheck className="w-3.5 h-3.5" />
                        <span>Switch Google Account</span>
                      </button>
                    </div>

                    <div className="pt-1 border-t border-slate-100">
                      <button
                        type="button"
                        onClick={handleSignOut}
                        className="w-full text-left px-3 py-2 rounded-lg hover:bg-rose-50 text-rose-600 font-medium flex items-center gap-2 cursor-pointer"
                      >
                        <LogOut className="w-3.5 h-3.5" />
                        <span>Sign Out</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <button
                type="button"
                onClick={onOpenSignIn}
                className="px-3 py-1.5 rounded-lg bg-white hover:bg-slate-50 text-slate-800 text-xs font-bold border border-slate-300 shadow-xs flex items-center gap-2 transition-all hover:shadow-sm whitespace-nowrap cursor-pointer"
              >
                <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 48 48">
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
          </nav>
        </div>
      </div>

      {/* Main Navigation: Brand Logo + Team Switcher + Core Views */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-3 lg:gap-4">
        {/* Left: Millennium Agency Brand Logo + Team Switcher */}
        <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
          <button
            type="button"
            onClick={() => onChangeView('tools')}
            className="flex items-center gap-2.5 text-left group shrink-0 cursor-pointer"
          >
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-slate-900 to-slate-950 border border-slate-800 flex items-center justify-center text-white font-extrabold text-base shadow-sm group-hover:scale-105 transition-transform">
              <span className="text-rose-500 font-heading">M</span>
            </div>

            <div className={currentUser ? 'hidden lg:block' : 'block'}>
              <div className="flex items-center gap-1.5">
                <span className="font-extrabold text-sm xl:text-base text-slate-900 tracking-tight font-heading whitespace-nowrap">
                  Millennium Agency
                </span>
                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-rose-50 text-rose-700 border border-rose-200 shrink-0">
                  Launchpad
                </span>
              </div>
            </div>
          </button>

          {/* Team Switcher */}
          {currentUser && (
            <div ref={teamMenuRef} className="relative min-w-0">
              <button
                type="button"
                aria-expanded={teamDropdownOpen}
                aria-haspopup="menu"
                onClick={() => {
                  setTeamDropdownOpen(!teamDropdownOpen);
                  setUserDropdownOpen(false);
                  setTeamSwitchError(null);
                }}
                className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl border border-slate-200 bg-slate-50/80 hover:bg-slate-100 text-left transition-colors max-w-[175px] md:max-w-[155px] lg:max-w-[165px] xl:max-w-[230px] cursor-pointer"
                title={`Active team: ${activeTeamName} (${activePlanId})`}
              >
                <Building2 className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-bold text-slate-900 truncate leading-tight">
                    {activeTeamName}
                  </div>
                  <div className="text-[10px] text-slate-500 uppercase font-mono leading-tight flex items-center gap-1">
                    <span>{activePlanId}</span>
                    {orderedTeams.length > 1 && <span>· {orderedTeams.length} teams</span>}
                  </div>
                </div>
                {pendingTeamInvites.length > 0 && (
                  <span
                    className="w-2 h-2 rounded-full bg-rose-600 shrink-0"
                    title={`${pendingTeamInvites.length} pending team invite(s)`}
                  />
                )}
                <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              </button>

              {teamDropdownOpen && (
                <div className="absolute left-0 mt-2 w-80 max-w-[calc(100vw-2rem)] bg-white rounded-2xl shadow-xl border border-slate-200 z-50 p-2 text-xs text-slate-700 animate-in fade-in zoom-in-95 duration-150">
                  {teamSwitchError && (
                    <div className="mb-2 p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-[11px] text-rose-800">
                      {teamSwitchError}
                    </div>
                  )}

                  {/* Pending Team Invitations */}
                  {pendingTeamInvites.length > 0 && (
                    <div className="mb-2 pb-2 border-b border-slate-100">
                      <div className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-amber-700 flex items-center gap-1.5">
                        <Mail className="w-3 h-3" />
                        <span>Pending Team Invites ({pendingTeamInvites.length})</span>
                      </div>
                      <div className="space-y-1.5 mt-1">
                        {pendingTeamInvites.map((inv) => {
                          const busy = teamBusyId === `invite:${inv.id}`;
                          return (
                            <div
                              key={inv.id}
                              className="p-2.5 rounded-xl bg-amber-50/70 border border-amber-200 space-y-2"
                            >
                              <div className="min-w-0">
                                <div className="font-bold text-slate-900 truncate">
                                  {inv.orgName || 'Team Workspace'}
                                </div>
                                <div className="text-[10px] text-slate-500 truncate">
                                  Invited by {inv.invitedByEmail || 'team owner'}
                                </div>
                              </div>
                              <div className="flex items-center gap-1.5">
                                <button
                                  type="button"
                                  disabled={busy || Boolean(teamBusyId)}
                                  onClick={() => handleInviteDecision(inv.id, 'accept')}
                                  className="flex-1 py-1.5 px-2.5 rounded-lg bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white text-[11px] font-bold cursor-pointer"
                                >
                                  {busy ? 'Joining...' : 'Accept'}
                                </button>
                                <button
                                  type="button"
                                  disabled={busy || Boolean(teamBusyId)}
                                  onClick={() => handleInviteDecision(inv.id, 'decline')}
                                  className="py-1.5 px-2.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-50 text-slate-700 text-[11px] font-semibold cursor-pointer"
                                >
                                  Decline
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* User Teams List */}
                  <div className="px-2.5 py-1 flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    <span>Your Teams</span>
                    <span className="font-mono">{orderedTeams.length}/10</span>
                  </div>

                  <div className="max-h-60 overflow-y-auto space-y-1 py-1">
                    {orderedTeams.length === 0 ? (
                      <div className="px-3 py-2 text-[11px] text-slate-500 flex items-center justify-between">
                        <span className="font-semibold text-slate-800 truncate">{activeTeamName}</span>
                        <span className="text-[10px] uppercase font-mono text-slate-400">{activePlanId}</span>
                      </div>
                    ) : (
                      orderedTeams.map((team) => {
                        const isActive = team.id === activeOrgId;
                        const busy = teamBusyId === team.id;
                        return (
                          <button
                            key={team.id}
                            type="button"
                            disabled={Boolean(teamBusyId)}
                            onClick={() => handleSelectTeam(team.id)}
                            className={`w-full text-left px-2.5 py-2 rounded-xl transition-colors flex items-center justify-between gap-2 cursor-pointer ${
                              isActive
                                ? 'bg-rose-50/80 border border-rose-200 text-slate-900'
                                : 'hover:bg-slate-50 border border-transparent'
                            }`}
                          >
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5">
                                <span className="font-bold text-slate-900 truncate">{team.name}</span>
                                {team.isPersonal && (
                                  <span className="px-1.5 py-0.2 rounded text-[9px] font-bold uppercase bg-slate-100 text-slate-600 border border-slate-200 shrink-0">
                                    Personal
                                  </span>
                                )}
                              </div>
                              <div className="text-[10px] text-slate-500 flex items-center gap-1.5 mt-0.5 font-mono">
                                <span className="uppercase">{team.planId}</span>
                                <span>·</span>
                                <span className="capitalize">{team.orgRole}</span>
                                <span>·</span>
                                <span>
                                  {team.seatsUsed}/{team.seatLimit} seats
                                </span>
                              </div>
                            </div>
                            {busy ? (
                              <div className="w-3.5 h-3.5 border-2 border-rose-600 border-t-transparent rounded-full animate-spin shrink-0" />
                            ) : isActive ? (
                              <Check className="w-4 h-4 text-rose-600 shrink-0" />
                            ) : null}
                          </button>
                        );
                      })
                    )}
                  </div>

                  {/* Create a team + Manage teams */}
                  <div className="pt-2 mt-1 border-t border-slate-100 space-y-1">
                    {creatingTeam ? (
                      <form onSubmit={handleQuickCreateTeam} className="p-2 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                        <input
                          type="text"
                          autoFocus
                          maxLength={120}
                          value={newTeamName}
                          onChange={(e) => setNewTeamName(e.target.value)}
                          placeholder="New team name..."
                          className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-rose-500"
                        />
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              setCreatingTeam(false);
                              setNewTeamName('');
                            }}
                            className="px-2.5 py-1 rounded-lg text-[11px] font-medium text-slate-600 hover:bg-slate-200 cursor-pointer"
                          >
                            Cancel
                          </button>
                          <button
                            type="submit"
                            disabled={!newTeamName.trim() || teamBusyId === 'create'}
                            className="px-3 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white text-[11px] font-bold cursor-pointer"
                          >
                            {teamBusyId === 'create' ? 'Creating...' : 'Create'}
                          </button>
                        </div>
                      </form>
                    ) : (
                      <button
                        type="button"
                        disabled={atMaxTeams}
                        onClick={() => setCreatingTeam(true)}
                        className="w-full text-left px-2.5 py-2 rounded-xl hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed font-semibold text-slate-800 flex items-center justify-between gap-2 cursor-pointer"
                      >
                        <span className="flex items-center gap-2">
                          <Plus className="w-3.5 h-3.5 text-rose-600" />
                          <span>Create a team</span>
                        </span>
                        {atMaxTeams && (
                          <span className="text-[10px] text-amber-700 font-normal">Max 10 reached</span>
                        )}
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => {
                        setTeamDropdownOpen(false);
                        setCreatingTeam(false);
                        onOpenManageTeams?.();
                      }}
                      className="w-full text-left px-2.5 py-2 rounded-xl hover:bg-slate-50 font-semibold text-slate-700 flex items-center gap-2 cursor-pointer"
                    >
                      <Settings className="w-3.5 h-3.5 text-slate-500" />
                      <span>Manage teams</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right: Primary Navigation Links (Desktop) */}
        {currentUser && (
          <nav aria-label="Main navigation" className="hidden md:flex items-center gap-1 xl:gap-1.5 text-xs font-bold shrink-0">
            <button
              type="button"
              onClick={() => onChangeView('tools')}
              className={`px-2.5 xl:px-3.5 py-2 rounded-xl transition-colors flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                activeView === 'tools'
                  ? 'bg-slate-100 text-slate-900 font-extrabold'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              <Layers className="w-4 h-4 text-rose-600 shrink-0" />
              <span>
                <span className="hidden lg:inline">Marketing </span>Tools
              </span>
            </button>

            <button
              type="button"
              onClick={() => onChangeView('library')}
              className={`px-2.5 xl:px-3.5 py-2 rounded-xl transition-colors flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                activeView === 'library'
                  ? 'bg-slate-100 text-slate-900 font-extrabold'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              <Bookmark className="w-4 h-4 text-blue-600 shrink-0" />
              <span>Library</span>
            </button>

            <button
              type="button"
              onClick={() => onChangeView('history')}
              className={`px-2.5 xl:px-3.5 py-2 rounded-xl transition-colors flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                activeView === 'history'
                  ? 'bg-slate-100 text-slate-900 font-extrabold'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              <History className="w-4 h-4 text-indigo-600 shrink-0" />
              <span>History</span>
            </button>

            <button
              type="button"
              onClick={() => onChangeView('account')}
              className={`px-2.5 xl:px-3.5 py-2 rounded-xl transition-colors flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                activeView === 'account'
                  ? 'bg-slate-100 text-slate-900 font-extrabold'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              <CreditCard className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>Account &amp; Billing</span>
            </button>

            {isAdminRole && (
              <button
                type="button"
                onClick={() => onChangeView('admin')}
                className={`px-2.5 xl:px-3.5 py-2 rounded-xl transition-colors flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                  activeView === 'admin'
                    ? 'bg-rose-50 text-rose-800 font-extrabold'
                    : 'text-slate-600 hover:text-rose-700 hover:bg-rose-50/50'
                }`}
              >
                <Shield className="w-4 h-4 text-rose-600 shrink-0" />
                <span>
                  Admin<span className="hidden lg:inline"> Portal</span>
                </span>
              </button>
            )}
          </nav>
        )}
      </div>

      {/* Mobile subnavigation bar */}
      {currentUser && (
        <nav
          aria-label="Mobile navigation"
          className="md:hidden border-t border-slate-100 px-4 py-2 flex items-center justify-around bg-slate-50 text-[11px] font-bold"
        >
          <button
            type="button"
            onClick={() => onChangeView('tools')}
            className={`px-2 py-1 rounded-lg ${activeView === 'tools' ? 'bg-white shadow-xs text-rose-600' : 'text-slate-600'}`}
          >
            Tools
          </button>
          <button
            type="button"
            onClick={() => onChangeView('library')}
            className={`px-2 py-1 rounded-lg ${activeView === 'library' ? 'bg-white shadow-xs text-blue-600' : 'text-slate-600'}`}
          >
            Library
          </button>
          <button
            type="button"
            onClick={() => onChangeView('history')}
            className={`px-2 py-1 rounded-lg ${activeView === 'history' ? 'bg-white shadow-xs text-indigo-600' : 'text-slate-600'}`}
          >
            History
          </button>
          <button
            type="button"
            onClick={() => onChangeView('account')}
            className={`px-2 py-1 rounded-lg ${activeView === 'account' ? 'bg-white shadow-xs text-emerald-600' : 'text-slate-600'}`}
          >
            Billing
          </button>
          {isAdminRole && (
            <button
              type="button"
              onClick={() => onChangeView('admin')}
              className={`px-2 py-1 rounded-lg ${activeView === 'admin' ? 'bg-white shadow-xs text-rose-600' : 'text-slate-600'}`}
            >
              Admin
            </button>
          )}
        </nav>
      )}
    </header>
  );
};
