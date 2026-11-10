import React, { useState, useMemo } from 'react';
import { User, Invoice, Plan, AuditLogEntry } from '../types';
import { dataService } from '../services/dataService';
import { billingService } from '../services/billingService';
import { authService } from '../services/authService';
import { generateActivityReportPdf } from '../utils/activityReportPdf';
import {
  User as UserIcon,
  CreditCard,
  Zap,
  Users,
  AlertTriangle,
  Receipt,
  Download,
  Building2,
  Trash2,
  CheckCircle2,
  Plus,
  Mail,
  ShieldAlert,
  Edit2,
  Calendar,
  History,
  Activity,
  Sparkles,
  Wand2,
  ArrowUpRight,
  ArrowDownRight,
  RotateCcw,
  Search,
  Copy,
  Check,
  ExternalLink,
  ShieldCheck,
  Bookmark,
  FileText,
  Clock,
} from 'lucide-react';

interface AccountBillingViewProps {
  user: User;
  onOpenUpgrade: () => void;
  onEditProfile: () => void;
  onViewReceipt: (invoice: Invoice) => void;
  onUserUpdated: (user: User) => void;
  onNavigateToTools?: (toolId?: string) => void;
  onNavigateToLibrary?: () => void;
}

type TabKey = 'plan' | 'activity' | 'profile' | 'billing' | 'team' | 'danger';
type ActivityCategory = 'all' | 'generation' | 'plan' | 'saved' | 'workspace';

function formatRelativeTime(dateString: string): string {
  try {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return dateString;
  }
}

function formatExactDate(dateString: string): string {
  try {
    const d = new Date(dateString);
    return d.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  } catch {
    return dateString;
  }
}

interface ActivityClassification {
  category: 'generation' | 'plan' | 'saved' | 'workspace' | 'other';
  categoryLabel: string;
  displayTitle: string;
  badgeStyle: { bg: string; text: string; border: string };
  iconType: 'sparkle' | 'upgrade' | 'downgrade' | 'discount' | 'bonus' | 'reset' | 'saved' | 'team' | 'info';
}

function classifyActivity(log: AuditLogEntry): ActivityClassification {
  const action = (log.action || '').toUpperCase();
  const details = log.details || '';

  if (action === 'TOOL_GENERATION') {
    const toolMatch = details.match(/Generated output with (.+)/i);
    const toolName = toolMatch ? toolMatch[1] : 'Marketing Tool';
    return {
      category: 'generation',
      categoryLabel: 'AI Generation',
      displayTitle: `Generated with ${toolName}`,
      badgeStyle: { bg: 'bg-rose-50', text: 'text-rose-700', border: 'border-rose-200' },
      iconType: 'sparkle',
    };
  }

  if (action === 'OUTPUT_SAVED') {
    return {
      category: 'saved',
      categoryLabel: 'Saved to Library',
      displayTitle: 'Marketing Deliverable Saved',
      badgeStyle: { bg: 'bg-amber-50', text: 'text-amber-800', border: 'border-amber-200' },
      iconType: 'saved',
    };
  }

  if (action === 'PLAN_UPGRADED' || action === 'ADMIN_PLAN_CHANGE') {
    return {
      category: 'plan',
      categoryLabel: 'Plan Upgrade',
      displayTitle: 'Subscription Tier Upgraded',
      badgeStyle: { bg: 'bg-indigo-50', text: 'text-indigo-700', border: 'border-indigo-200' },
      iconType: 'upgrade',
    };
  }

  if (action === 'SUBSCRIPTION_CANCELED') {
    return {
      category: 'plan',
      categoryLabel: 'Plan Cancellation',
      displayTitle: 'Subscription Canceled',
      badgeStyle: { bg: 'bg-rose-50', text: 'text-rose-700', border: 'border-rose-200' },
      iconType: 'downgrade',
    };
  }

  if (action === 'SUBSCRIPTION_CHANGED') {
    return {
      category: 'plan',
      categoryLabel: 'Plan Modification',
      displayTitle: 'Subscription Tier Modified',
      badgeStyle: { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' },
      iconType: 'upgrade',
    };
  }

  if (action === 'BONUS_GENERATIONS_GRANTED') {
    return {
      category: 'plan',
      categoryLabel: 'Bonus Credits',
      displayTitle: 'Bonus Generations Awarded',
      badgeStyle: { bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200' },
      iconType: 'bonus',
    };
  }

  if (action === 'DISCOUNT_APPROVED' || action === 'DISCOUNT_TOGGLED') {
    return {
      category: 'plan',
      categoryLabel: 'Nonprofit Rate',
      displayTitle: '25% Nonprofit Discount Approved',
      badgeStyle: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
      iconType: 'discount',
    };
  }

  if (action === 'USAGE_RESET') {
    return {
      category: 'plan',
      categoryLabel: 'Billing Cycle',
      displayTitle: 'Monthly Generation Quota Reset',
      badgeStyle: { bg: 'bg-slate-100', text: 'text-slate-700', border: 'border-slate-200' },
      iconType: 'reset',
    };
  }

  if (action.startsWith('TEAM_MEMBER_') || action === 'PROFILE_CONFIGURED') {
    return {
      category: 'workspace',
      categoryLabel: 'Workspace',
      displayTitle: action === 'PROFILE_CONFIGURED' ? 'Organization Profile Configured' : 'Team Seat Updated',
      badgeStyle: { bg: 'bg-slate-100', text: 'text-slate-700', border: 'border-slate-200' },
      iconType: 'team',
    };
  }

  return {
    category: 'other',
    categoryLabel: 'Account Activity',
    displayTitle: action.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()),
    badgeStyle: { bg: 'bg-slate-100', text: 'text-slate-700', border: 'border-slate-200' },
    iconType: 'info',
  };
}

export const AccountBillingView: React.FC<AccountBillingViewProps> = ({
  user,
  onOpenUpgrade,
  onEditProfile,
  onViewReceipt,
  onUserUpdated,
  onNavigateToTools,
  onNavigateToLibrary,
}) => {
  const [activeTab, setActiveTab] = useState<TabKey>('plan');
  const [invoices, setInvoices] = useState<Invoice[]>(() => dataService.getInvoices(user.id));
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteName, setInviteName] = useState('');
  const [teamMembers, setTeamMembers] = useState(user.teamMembers || []);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);

  // Activity History State
  const [activities, setActivities] = useState<AuditLogEntry[]>(() => dataService.getUserActivity(user.id));
  const [activityFilter, setActivityFilter] = useState<ActivityCategory>('all');
  const [activitySearch, setActivitySearch] = useState('');
  const [copiedLogId, setCopiedLogId] = useState<string | null>(null);
  const [isExportingPdf, setIsExportingPdf] = useState(false);

  // Sync latest activities whenever the view opens or changes
  const refreshActivities = () => {
    setActivities(dataService.getUserActivity(user.id));
  };

  const plan = billingService.getPlanById(user.planId);
  const maxLimit = (plan?.generationLimit || 50) + (user.bonusGenerations || 0);
  const currentUsage = user.generationsUsedThisMonth || 0;
  const usagePercentage = Math.min(Math.round((currentUsage / maxLimit) * 100), 100);

  const isNonprofit = user.organizationProfile?.type === 'Nonprofit';
  const hasDiscount = isNonprofit && user.nonprofitDiscountApproved;

  // Filtered Activities
  const { filteredActivities, counts } = useMemo(() => {
    let genCount = 0;
    let planCount = 0;
    let savedCount = 0;

    activities.forEach((item) => {
      const cls = classifyActivity(item);
      if (cls.category === 'generation') genCount++;
      if (cls.category === 'plan') planCount++;
      if (cls.category === 'saved') savedCount++;
    });

    const filtered = activities.filter((item) => {
      const cls = classifyActivity(item);

      // Category filter
      if (activityFilter === 'generation' && cls.category !== 'generation') return false;
      if (activityFilter === 'plan' && cls.category !== 'plan') return false;
      if (activityFilter === 'saved' && cls.category !== 'saved') return false;
      if (activityFilter === 'workspace' && cls.category !== 'workspace') return false;

      // Search filter
      if (activitySearch.trim()) {
        const query = activitySearch.toLowerCase();
        const matchesDetails = item.details?.toLowerCase().includes(query);
        const matchesTitle = cls.displayTitle.toLowerCase().includes(query);
        const matchesAction = item.action.toLowerCase().includes(query);
        if (!matchesDetails && !matchesTitle && !matchesAction) return false;
      }

      return true;
    });

    return {
      filteredActivities: filtered,
      counts: {
        all: activities.length,
        generation: genCount,
        plan: planCount,
        saved: savedCount,
      },
    };
  }, [activities, activityFilter, activitySearch]);

  const handleCopyActivity = (log: AuditLogEntry) => {
    const text = `[${formatExactDate(log.timestamp)}] ${log.action}: ${log.details}`;
    navigator.clipboard.writeText(text);
    setCopiedLogId(log.id);
    setTimeout(() => setCopiedLogId(null), 2000);
  };

  const handleDownloadActivityReport = () => {
    try {
      setIsExportingPdf(true);
      const activitiesToExport = filteredActivities.length > 0 ? filteredActivities : activities;
      const filterNames: Record<ActivityCategory, string> = {
        all: 'All Activity',
        generation: 'AI Tool Generations',
        plan: 'Plan & Subscription Changes',
        saved: 'Saved Deliverables',
        workspace: 'Workspace & Team',
      };

      const filename = generateActivityReportPdf({
        user,
        plan,
        activities: activitiesToExport,
        filterLabel: filterNames[activityFilter] || 'All Activity',
        searchQuery: activitySearch.trim(),
        usageInfo: {
          current: currentUsage,
          max: maxLimit,
          percentage: usagePercentage,
        },
      });

      dataService.logAction(
        'REPORT_DOWNLOADED',
        `Downloaded Activity History report (${activitiesToExport.length} events) as PDF`,
        user.id
      );
      setFeedbackMsg(`Activity report PDF downloaded successfully (${filename}).`);
    } catch (err) {
      console.error('Failed to generate activity report PDF:', err);
      alert('Unable to generate activity report PDF. Please try again.');
    } finally {
      setIsExportingPdf(false);
    }
  };

  const handleCancelSubscription = async () => {
    if (window.confirm('Are you sure you want to cancel your subscription? You will be reverted to the Free plan at the end of your billing cycle.')) {
      await billingService.cancelSubscription(user.id);
      const fresh = dataService.getUserById(user.id);
      if (fresh) onUserUpdated(fresh);
      refreshActivities();
      setFeedbackMsg('Subscription canceled. Your account has returned to the Free Starter tier.');
    }
  };

  const handleAddTeamMember = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail || !inviteName) return;

    if (teamMembers.length >= 5) {
      alert('Team plan includes up to 5 user seats. Please contact Millennium Agency for enterprise seats.');
      return;
    }

    const newMember = {
      name: inviteName,
      email: inviteEmail,
      role: 'Marketing Associate',
      addedAt: new Date().toISOString().split('T')[0],
    };

    const updatedMembers = [...teamMembers, newMember];
    setTeamMembers(updatedMembers);
    dataService.updateUser(user.id, { teamMembers: updatedMembers });
    dataService.logAction('TEAM_MEMBER_INVITED', `Invited ${inviteName} (${inviteEmail}) to ${user.organizationProfile?.orgName} workspace`, user.id);
    refreshActivities();

    setInviteEmail('');
    setInviteName('');
    setFeedbackMsg(`Invitation sent to ${newMember.email}`);
  };

  const handleRemoveMember = (email: string) => {
    const updated = teamMembers.filter((m) => m.email !== email);
    setTeamMembers(updated);
    dataService.updateUser(user.id, { teamMembers: updated });
    dataService.logAction('TEAM_MEMBER_REMOVED', `Removed team member ${email}`, user.id);
    refreshActivities();
  };

  const handleDeleteAccount = () => {
    dataService.deleteUser(user.id);
    authService.signOut();
  };

  const renderActivityIcon = (iconType: ActivityClassification['iconType']) => {
    switch (iconType) {
      case 'sparkle':
        return (
          <div className="w-9 h-9 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center shrink-0 border border-rose-100">
            <Wand2 className="w-4 h-4" />
          </div>
        );
      case 'upgrade':
        return (
          <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0 border border-indigo-100">
            <ArrowUpRight className="w-4 h-4" />
          </div>
        );
      case 'downgrade':
        return (
          <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center shrink-0 border border-amber-100">
            <ArrowDownRight className="w-4 h-4" />
          </div>
        );
      case 'discount':
        return (
          <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0 border border-emerald-100">
            <ShieldCheck className="w-4 h-4" />
          </div>
        );
      case 'bonus':
        return (
          <div className="w-9 h-9 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center shrink-0 border border-purple-100">
            <Zap className="w-4 h-4" />
          </div>
        );
      case 'reset':
        return (
          <div className="w-9 h-9 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center shrink-0 border border-slate-200">
            <RotateCcw className="w-4 h-4" />
          </div>
        );
      case 'saved':
        return (
          <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0 border border-amber-100">
            <Bookmark className="w-4 h-4" />
          </div>
        );
      case 'team':
        return (
          <div className="w-9 h-9 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center shrink-0 border border-slate-200">
            <Users className="w-4 h-4" />
          </div>
        );
      default:
        return (
          <div className="w-9 h-9 rounded-xl bg-slate-100 text-slate-600 flex items-center justify-center shrink-0 border border-slate-200">
            <FileText className="w-4 h-4" />
          </div>
        );
    }
  };

  return (
    <div className="space-y-6 pb-12 max-w-5xl">
      {/* Top Banner */}
      <div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 font-heading">
          Account & Billing
        </h1>
        <p className="text-xs sm:text-sm text-slate-500 mt-1">
          Manage your subscription tier, track AI generation activity history, and configure organization profiles.
        </p>
      </div>

      {feedbackMsg && (
        <div className="p-3 bg-emerald-50 text-emerald-800 text-xs rounded-xl border border-emerald-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{feedbackMsg}</span>
          </div>
          <button onClick={() => setFeedbackMsg(null)} className="text-emerald-900 font-bold">
            &times;
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-px overflow-x-auto">
        {[
          { key: 'plan', label: 'Plan & Usage', icon: Zap },
          { key: 'activity', label: `Activity History (${activities.length})`, icon: History },
          { key: 'profile', label: 'Organization Profile', icon: Building2 },
          { key: 'billing', label: 'Billing & Invoices', icon: CreditCard },
          { key: 'team', label: `Team Seats (${teamMembers.length})`, icon: Users },
          { key: 'danger', label: 'Danger Zone', icon: AlertTriangle },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => {
                setActiveTab(tab.key as TabKey);
                if (tab.key === 'activity') refreshActivities();
              }}
              className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold border-b-2 transition-all whitespace-nowrap ${
                isActive
                  ? 'border-rose-600 text-rose-600'
                  : 'border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Tab 1: Plan & Usage */}
      {activeTab === 'plan' && (
        <div className="space-y-6">
          <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Current Subscription
                </span>
                <h3 className="text-xl font-bold text-slate-900 font-heading mt-0.5 flex items-center gap-2">
                  <span>{plan?.name}</span>
                  {hasDiscount && (
                    <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                      Nonprofit 25% Off Active
                    </span>
                  )}
                </h3>
                <p className="text-xs text-slate-500 mt-1">{plan?.description}</p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={onOpenUpgrade}
                  className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition-all shadow-xs"
                >
                  Change Plan
                </button>
                {user.planId !== 'free' && (
                  <button
                    onClick={handleCancelSubscription}
                    className="px-3 py-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 text-xs font-medium"
                  >
                    Cancel Subscription
                  </button>
                )}
              </div>
            </div>

            {/* Usage Progress */}
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-100 space-y-3">
              <div className="flex items-center justify-between text-xs font-bold text-slate-800">
                <span className="flex items-center gap-1.5">
                  <Zap className="w-4 h-4 text-rose-600" />
                  <span>Generations this billing month</span>
                </span>
                <span className="font-mono tabular-nums">
                  {currentUsage} of {maxLimit} used ({usagePercentage}%)
                </span>
              </div>

              <div className="w-full h-3 bg-slate-200 rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all duration-500 ${
                    currentUsage >= maxLimit
                      ? 'bg-rose-600'
                      : currentUsage >= maxLimit * 0.8
                      ? 'bg-amber-500'
                      : 'bg-emerald-500'
                  }`}
                  style={{ width: `${usagePercentage}%` }}
                />
              </div>

              <div className="flex items-center justify-between text-[11px] text-slate-500">
                <span>
                  Base limit: {plan?.generationLimit}/mo
                  {user.bonusGenerations > 0 && ` • Bonus granted: +${user.bonusGenerations}`}
                </span>
                <span className="flex items-center gap-1 font-mono tabular-nums">
                  <Calendar className="w-3 h-3" /> Resets: {user.billingResetDate}
                </span>
              </div>
            </div>

            {/* Plan Highlights */}
            <div>
              <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wide mb-3">
                Plan Entitlements
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-slate-600">
                {plan?.features.map((feat, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>{feat}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Recent Activity Highlight Preview */}
            <div className="pt-4 border-t border-slate-100 space-y-3">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2">
                  <History className="w-4 h-4 text-rose-600" />
                  <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wide">
                    Recent Activity Preview
                  </h4>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={handleDownloadActivityReport}
                    disabled={isExportingPdf}
                    className="text-xs font-semibold text-slate-600 hover:text-slate-900 flex items-center gap-1.5 transition-colors cursor-pointer"
                    title="Download full activity report as PDF"
                  >
                    <Download className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                    <span>{isExportingPdf ? 'Generating PDF...' : 'Download Report (PDF)'}</span>
                  </button>
                  <button
                    onClick={() => setActiveTab('activity')}
                    className="text-xs font-bold text-rose-600 hover:text-rose-800 flex items-center gap-1 cursor-pointer"
                  >
                    <span>View all {activities.length} events</span>
                    <span>&rarr;</span>
                  </button>
                </div>
              </div>

              {activities.length === 0 ? (
                <p className="text-xs text-slate-400 italic">No activity recorded yet.</p>
              ) : (
                <div className="divide-y divide-slate-100 border border-slate-100 rounded-xl overflow-hidden">
                  {activities.slice(0, 3).map((item) => {
                    const cls = classifyActivity(item);
                    return (
                      <div key={item.id} className="p-3 bg-slate-50/50 flex items-center justify-between gap-3 text-xs">
                        <div className="flex items-center gap-3 min-w-0">
                          {renderActivityIcon(cls.iconType)}
                          <div className="min-w-0">
                            <p className="font-semibold text-slate-900 truncate">{cls.displayTitle}</p>
                            <p className="text-[11px] text-slate-500 truncate">{item.details}</p>
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <span className="text-[11px] font-mono tabular-nums text-slate-500">
                            {formatRelativeTime(item.timestamp)}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Activity History (Full Chronological List) */}
      {activeTab === 'activity' && (
        <div className="space-y-6">
          {/* Header & Metric Summary */}
          <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className="text-lg font-bold text-slate-900 font-heading flex items-center gap-2">
                  <History className="w-5 h-5 text-rose-600" />
                  <span>Activity History</span>
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  Chronological record of recent AI tool generations, subscription plan changes, and workspace actions.
                </p>
              </div>

              <div className="flex items-center gap-2 flex-wrap self-start sm:self-auto">
                <button
                  onClick={handleDownloadActivityReport}
                  disabled={isExportingPdf}
                  className="px-3.5 py-2 rounded-xl bg-white hover:bg-slate-50 text-slate-800 text-xs font-bold border border-slate-300 shadow-xs flex items-center gap-2 transition-all hover:border-slate-400 disabled:opacity-60 cursor-pointer"
                  title="Generate and download current activity history as an official PDF report"
                >
                  <Download className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                  <span>{isExportingPdf ? 'Generating PDF...' : 'Download Activity Report'}</span>
                </button>

                {onNavigateToTools && (
                  <button
                    onClick={() => onNavigateToTools()}
                    className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold flex items-center gap-2 transition-all cursor-pointer"
                  >
                    <Wand2 className="w-3.5 h-3.5 text-rose-400" />
                    <span>Open Marketing Studio</span>
                  </button>
                )}
              </div>
            </div>

            {/* Quick Metrics Bar (Clean typography, no pill enclosures) */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-100">
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  AI Generations
                </div>
                <div className="text-xl font-black text-slate-900 font-mono tabular-nums mt-0.5">
                  {counts.generation}
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">Marketing tools used</div>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-100">
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Plan Changes
                </div>
                <div className="text-xl font-black text-slate-900 font-mono tabular-nums mt-0.5">
                  {counts.plan}
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">Upgrades & bonus credits</div>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-100">
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Saved Assets
                </div>
                <div className="text-xl font-black text-slate-900 font-mono tabular-nums mt-0.5">
                  {counts.saved}
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">Outputs stored to library</div>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-100">
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Total Logged
                </div>
                <div className="text-xl font-black text-slate-900 font-mono tabular-nums mt-0.5">
                  {counts.all}
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">Audited interactions</div>
              </div>
            </div>

            {/* Filter & Search Toolbar */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-2 border-t border-slate-100">
              {/* Segmented Filter Control */}
              <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl overflow-x-auto">
                <button
                  onClick={() => setActivityFilter('all')}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap ${
                    activityFilter === 'all'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  All ({counts.all})
                </button>
                <button
                  onClick={() => setActivityFilter('generation')}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap ${
                    activityFilter === 'generation'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  AI Tool Generations ({counts.generation})
                </button>
                <button
                  onClick={() => setActivityFilter('plan')}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap ${
                    activityFilter === 'plan'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Plan Changes ({counts.plan})
                </button>
                <button
                  onClick={() => setActivityFilter('saved')}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap ${
                    activityFilter === 'saved'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Saved Outputs ({counts.saved})
                </button>
              </div>

              {/* Search Bar */}
              <div className="relative w-full sm:w-64">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={activitySearch}
                  onChange={(e) => setActivitySearch(e.target.value)}
                  placeholder="Filter by keyword or tool..."
                  className="w-full pl-9 pr-3 py-1.5 text-xs rounded-xl border border-slate-200 bg-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-rose-500"
                />
                {activitySearch && (
                  <button
                    onClick={() => setActivitySearch('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs"
                  >
                    &times;
                  </button>
                )}
              </div>
            </div>

            {/* Timeline List */}
            {filteredActivities.length === 0 ? (
              <div className="p-12 text-center space-y-3 border border-dashed border-slate-200 rounded-2xl">
                <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
                  <History className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-slate-800">No matching activities found</h4>
                  <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1">
                    {activitySearch
                      ? `No events match "${activitySearch}". Try clearing your search keyword.`
                      : 'No activities recorded in this category yet. Run tools in the Marketing Studio or adjust your plan to populate this timeline.'}
                  </p>
                </div>
                {activitySearch && (
                  <button
                    onClick={() => setActivitySearch('')}
                    className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs text-slate-700 font-medium hover:bg-slate-50"
                  >
                    Clear Filter
                  </button>
                )}
              </div>
            ) : (
              <div className="divide-y divide-slate-100 border border-slate-100 rounded-2xl overflow-hidden">
                {filteredActivities.map((log) => {
                  const cls = classifyActivity(log);
                  const isCopied = copiedLogId === log.id;

                  return (
                    <div
                      key={log.id}
                      className="p-4 bg-white hover:bg-slate-50/70 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                    >
                      <div className="flex items-start gap-3.5 min-w-0">
                        {renderActivityIcon(cls.iconType)}
                        <div className="min-w-0 space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <h4 className="text-sm font-bold text-slate-900 font-heading">
                              {cls.displayTitle}
                            </h4>
                          </div>

                          <p className="text-xs text-slate-600 leading-relaxed break-words">
                            {log.details}
                          </p>

                          {/* Clean Unboxed Metadata with Typographic Separators */}
                          <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-400 font-mono tabular-nums pt-0.5">
                            <span className="text-slate-600 font-medium">{formatExactDate(log.timestamp)}</span>
                            <span aria-hidden="true" className="text-slate-300">·</span>
                            <span>{formatRelativeTime(log.timestamp)}</span>
                            <span aria-hidden="true" className="text-slate-300">·</span>
                            <span className="text-slate-500 font-sans font-medium">{cls.categoryLabel}</span>
                          </div>
                        </div>
                      </div>

                      {/* Item Actions */}
                      <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                        {cls.category === 'generation' && onNavigateToTools && (
                          <button
                            onClick={() => onNavigateToTools()}
                            className="px-3 py-1.5 rounded-lg border border-rose-200 bg-rose-50/50 hover:bg-rose-100 text-rose-700 text-xs font-semibold flex items-center gap-1 transition-colors"
                          >
                            <span>Open Studio</span>
                            <ExternalLink className="w-3 h-3" />
                          </button>
                        )}

                        {cls.category === 'saved' && onNavigateToLibrary && (
                          <button
                            onClick={() => onNavigateToLibrary()}
                            className="px-3 py-1.5 rounded-lg border border-amber-200 bg-amber-50/50 hover:bg-amber-100 text-amber-800 text-xs font-semibold flex items-center gap-1 transition-colors"
                          >
                            <span>View Library</span>
                            <ExternalLink className="w-3 h-3" />
                          </button>
                        )}

                        {cls.category === 'plan' && (
                          <button
                            onClick={onOpenUpgrade}
                            className="px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold flex items-center gap-1 transition-colors"
                          >
                            <span>Manage Plan</span>
                          </button>
                        )}

                        <button
                          onClick={() => handleCopyActivity(log)}
                          title="Copy activity record"
                          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                        >
                          {isCopied ? (
                            <Check className="w-4 h-4 text-emerald-600" />
                          ) : (
                            <Copy className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab 3: Organization Profile */}
      {activeTab === 'profile' && (
        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-6">
          <div className="flex items-center justify-between pb-4 border-b border-slate-100">
            <div className="flex items-center gap-4">
              <img
                src={user.avatar}
                alt={user.name}
                className="w-14 h-14 rounded-full object-cover border border-slate-200"
              />
              <div>
                <h3 className="text-base font-bold text-slate-900">{user.name}</h3>
                <p className="text-xs text-slate-500">{user.email}</p>
                <span className="mt-1 inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-slate-100 text-slate-700">
                  Role: {user.role.replace('_', ' ')}
                </span>
              </div>
            </div>

            <button
              onClick={onEditProfile}
              className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold flex items-center gap-1.5"
            >
              <Edit2 className="w-3.5 h-3.5" />
              <span>Edit Organization Details</span>
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-100">
              <span className="text-[10px] font-bold uppercase text-slate-400">Organization Name</span>
              <p className="font-bold text-slate-900 mt-1">{user.organizationProfile?.orgName}</p>
              <p className="text-slate-500 mt-0.5">{user.organizationProfile?.website || 'No website provided'}</p>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-100">
              <span className="text-[10px] font-bold uppercase text-slate-400">Organization Category</span>
              <p className="font-bold text-slate-900 mt-1">{user.organizationProfile?.type}</p>
              <p className="text-slate-500 mt-0.5">
                {isNonprofit
                  ? hasDiscount
                    ? '25% Nonprofit discount approved'
                    : 'Nonprofit pending discount approval'
                  : 'Early-stage commercial startup'}
              </p>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-100 sm:col-span-2">
              <span className="text-[10px] font-bold uppercase text-slate-400">What they do</span>
              <p className="text-slate-700 mt-1">{user.organizationProfile?.whatTheyDo}</p>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-100">
              <span className="text-[10px] font-bold uppercase text-slate-400">Target Audience</span>
              <p className="text-slate-700 mt-1">{user.organizationProfile?.targetAudience}</p>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-100">
              <span className="text-[10px] font-bold uppercase text-slate-400">Brand Tones</span>
              <p className="text-slate-700 mt-1 font-semibold">{user.organizationProfile?.brandTone?.join(', ')}</p>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-100 sm:col-span-2">
              <span className="text-[10px] font-bold uppercase text-slate-400">Top 6-Month Goals</span>
              <ul className="list-disc list-inside text-slate-700 mt-1 space-y-0.5">
                {user.organizationProfile?.goals?.map((g, idx) => (
                  <li key={idx}>{g}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Tab 4: Billing & Invoices */}
      {activeTab === 'billing' && (
        <div className="space-y-6">
          {/* Payment Method */}
          <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm flex items-center justify-between">
            <div className="flex items-center gap-3.5">
              <div className="p-3 rounded-xl bg-slate-100 text-slate-700">
                <CreditCard className="w-6 h-6" />
              </div>
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Payment Method
                </span>
                <p className="font-bold text-slate-900 text-sm mt-0.5">
                  {user.paymentMethod
                    ? `${user.paymentMethod.brand} ending in •••• ${user.paymentMethod.last4}`
                    : 'Visa ending in •••• 4242'}
                </p>
                <p className="text-xs text-slate-500">
                  Expires {user.paymentMethod?.expMonth || '12'}/{user.paymentMethod?.expYear || '2028'}
                </p>
              </div>
            </div>

            <button
              onClick={onOpenUpgrade}
              className="px-3.5 py-1.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-xs font-semibold text-slate-700"
            >
              Update Payment Card
            </button>
          </div>

          {/* Invoice History */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                <Receipt className="w-4 h-4 text-rose-600" />
                <span>Invoice & Payment History</span>
              </h3>
              <span className="text-xs text-slate-500 font-mono tabular-nums">{invoices.length} transactions</span>
            </div>

            {invoices.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500">
                No invoices recorded yet. Upgrades and renewals will appear here.
              </div>
            ) : (
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-500 uppercase text-[10px] font-bold">
                  <tr>
                    <th className="py-2.5 px-4">Date</th>
                    <th className="py-2.5 px-4">Plan / Description</th>
                    <th className="py-2.5 px-4">Receipt #</th>
                    <th className="py-2.5 px-4">Amount</th>
                    <th className="py-2.5 px-4">Status</th>
                    <th className="py-2.5 px-4 text-right">Receipt</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {invoices.map((inv) => (
                    <tr key={inv.id} className="hover:bg-slate-50/50">
                      <td className="py-3 px-4 font-mono tabular-nums text-slate-600">{inv.date}</td>
                      <td className="py-3 px-4 font-semibold text-slate-900">{inv.planName}</td>
                      <td className="py-3 px-4 font-mono tabular-nums text-slate-500">{inv.pdfReceiptId}</td>
                      <td className="py-3 px-4 font-bold text-slate-900 font-mono tabular-nums">${inv.amount.toFixed(2)}</td>
                      <td className="py-3 px-4">
                        <span
                          className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                            inv.status === 'paid'
                              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                              : 'bg-amber-50 text-amber-800'
                          }`}
                        >
                          {inv.status.toUpperCase()}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          onClick={() => onViewReceipt(inv)}
                          className="text-xs font-bold text-rose-600 hover:text-rose-800 flex items-center gap-1 justify-end ml-auto"
                        >
                          <Download className="w-3 h-3" />
                          <span>View Receipt</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* Tab 5: Team Seats */}
      {activeTab === 'team' && (
        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
            <div>
              <h3 className="font-bold text-slate-900 text-sm">Organization Workspace Seats</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Team plan includes up to 5 collaborative seats sharing the monthly generation quota.
              </p>
            </div>

            {user.planId !== 'team' && (
              <button
                onClick={onOpenUpgrade}
                className="px-3.5 py-1.5 rounded-xl bg-purple-50 text-purple-800 border border-purple-200 text-xs font-bold hover:bg-purple-100"
              >
                Upgrade to Team Plan
              </button>
            )}
          </div>

          {/* Invite form */}
          {user.planId === 'team' && (
            <form onSubmit={handleAddTeamMember} className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <input
                type="text"
                required
                value={inviteName}
                onChange={(e) => setInviteName(e.target.value)}
                placeholder="Team member name"
                className="px-3 py-2 text-xs rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-rose-500"
              />
              <input
                type="email"
                required
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="colleague@example.org"
                className="px-3 py-2 text-xs rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-rose-500"
              />
              <button
                type="submit"
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5"
              >
                <Plus className="w-4 h-4" />
                <span>Invite to Workspace</span>
              </button>
            </form>
          )}

          {/* Team table */}
          <div className="border border-slate-100 rounded-xl overflow-hidden">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 text-[10px] uppercase font-bold">
                <tr>
                  <th className="py-2.5 px-4">Member</th>
                  <th className="py-2.5 px-4">Role</th>
                  <th className="py-2.5 px-4">Added</th>
                  <th className="py-2.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                <tr className="bg-slate-50/30">
                  <td className="py-3 px-4 font-bold text-slate-900">
                    {user.name} <span className="text-[10px] text-rose-600 font-semibold">(Primary Owner)</span>
                    <div className="text-[11px] text-slate-400 font-normal">{user.email}</div>
                  </td>
                  <td className="py-3 px-4 text-slate-600">Admin</td>
                  <td className="py-3 px-4 font-mono tabular-nums text-slate-500">{user.signupDate.split('T')[0]}</td>
                  <td className="py-3 px-4 text-right text-slate-400 font-medium">Owner</td>
                </tr>

                {teamMembers.map((member) => (
                  <tr key={member.email}>
                    <td className="py-3 px-4 font-semibold text-slate-900">
                      {member.name}
                      <div className="text-[11px] text-slate-400 font-normal">{member.email}</div>
                    </td>
                    <td className="py-3 px-4 text-slate-600">{member.role}</td>
                    <td className="py-3 px-4 font-mono tabular-nums text-slate-500">{member.addedAt}</td>
                    <td className="py-3 px-4 text-right">
                      <button
                        onClick={() => handleRemoveMember(member.email)}
                        className="text-xs text-rose-600 hover:underline font-medium"
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 6: Danger Zone */}
      {activeTab === 'danger' && (
        <div className="bg-white rounded-2xl p-6 border border-rose-200 shadow-sm space-y-4">
          <div className="flex items-center gap-2 text-rose-700 font-bold text-sm">
            <ShieldAlert className="w-5 h-5 text-rose-600" />
            <span>Delete Account & Erase Data</span>
          </div>

          <p className="text-xs text-slate-600 max-w-xl leading-relaxed">
            Deleting your account will immediately cancel any active subscription, erase all saved library assets, and delete your organization profile from local persistence. This action cannot be undone.
          </p>

          {!deleteConfirmOpen ? (
            <button
              onClick={() => setDeleteConfirmOpen(true)}
              className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold"
            >
              Request Account Deletion
            </button>
          ) : (
            <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 space-y-3">
              <p className="text-xs font-bold text-rose-900">
                Are you absolutely sure you want to permanently delete your account?
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleDeleteAccount}
                  className="px-4 py-2 rounded-xl bg-rose-700 hover:bg-rose-800 text-white text-xs font-bold"
                >
                  Yes, Permanently Delete My Account
                </button>
                <button
                  onClick={() => setDeleteConfirmOpen(false)}
                  className="px-3 py-2 rounded-xl border border-slate-300 text-slate-700 hover:bg-white text-xs font-medium"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
