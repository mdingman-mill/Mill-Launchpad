import React, { useState, useEffect } from 'react';
import {
  User,
  Invoice,
  AuditLogEntry,
  AccessRule,
  Plan,
  ToolDefinition,
  AgencySettings,
  UserRole,
  Invite,
  PlanId,
  OrganizationType,
} from '../types';
import { dataService } from '../services/dataService';
import { billingService } from '../services/billingService';
import { authService } from '../services/authService';
import { APP_CONFIG } from '../config';
import {
  LayoutDashboard,
  Users as UsersIcon,
  CreditCard,
  ShieldCheck,
  Sliders,
  Wrench,
  FileText,
  Settings as SettingsIcon,
  Search,
  Filter,
  Download,
  Eye,
  Plus,
  Trash2,
  RefreshCw,
  Zap,
  CheckCircle2,
  AlertCircle,
  X,
  ExternalLink,
  Edit2,
  Lock,
  Sparkles,
  HeartHandshake,
  UserCheck,
  TrendingUp,
  Mail,
  Copy,
  Check,
  Clock,
} from 'lucide-react';

interface AdminPanelProps {
  currentUser: User;
  onImpersonateUser: (user: User) => void;
  onViewReceipt: (invoice: Invoice) => void;
  onDataReset: () => void;
}

export const AdminPanel: React.FC<AdminPanelProps> = ({
  currentUser,
  onImpersonateUser,
  onViewReceipt,
  onDataReset,
}) => {
  const [activeTab, setActiveTab] = useState<
    'dashboard' | 'users' | 'invites' | 'billing' | 'access' | 'plans' | 'tools' | 'audit' | 'settings'
  >('dashboard');

  const [users, setUsers] = useState<User[]>(() => dataService.getUsers());
  const [invoices, setInvoices] = useState<Invoice[]>(() => dataService.getInvoices());
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>(() => dataService.getAuditLogs());
  const [accessRules, setAccessRules] = useState<AccessRule[]>(() => dataService.getAccessRules());
  const [plans, setPlans] = useState<Plan[]>(() => dataService.getPlans());
  const [tools, setTools] = useState<ToolDefinition[]>(() => dataService.getTools());
  const [settings, setSettings] = useState<AgencySettings>(() => dataService.getSettings());

  // Invites state
  const [invites, setInvites] = useState<Invite[]>([]);
  const [isLoadingInvites, setIsLoadingInvites] = useState(false);
  const [newInviteEmail, setNewInviteEmail] = useState('');
  const [newInviteNote, setNewInviteNote] = useState('');
  const [newInviteExpiresAt, setNewInviteExpiresAt] = useState('');
  const [isCreatingInvite, setIsCreatingInvite] = useState(false);
  const [copiedInviteId, setCopiedInviteId] = useState<string | null>(null);

  // Direct user invite modal state
  const [inviteName, setInviteName] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteOrgType, setInviteOrgType] = useState<OrganizationType>('Startup');

  // Search & Filter state for Users table
  const [userSearch, setUserSearch] = useState('');
  const [userPlanFilter, setUserPlanFilter] = useState('all');
  const [userOrgFilter, setUserOrgFilter] = useState('all');
  const [selectedUserDetail, setSelectedUserDetail] = useState<User | null>(null);

  // Billing tab filter
  const [invoiceStatusFilter, setInvoiceStatusFilter] = useState('all');

  // New Access Rule state
  const [newRuleType, setNewRuleType] = useState<'allow' | 'block'>('allow');
  const [newRuleValue, setNewRuleValue] = useState('');
  const [newRuleNotes, setNewRuleNotes] = useState('');

  // Notification feedback
  const [adminNotification, setAdminNotification] = useState<string | null>(null);

  const isSuperAdmin = currentUser.role === 'super_admin';
  const isReadOnlySupport = currentUser.role === 'support';

  const notify = (msg: string) => {
    setAdminNotification(msg);
    setTimeout(() => setAdminNotification(null), 3500);
  };

  const refreshInvites = async () => {
    try {
      setIsLoadingInvites(true);
      const list = await dataService.fetchInvites();
      setInvites(list);
    } catch (err: any) {
      console.error('Failed to load invites:', err);
    } finally {
      setIsLoadingInvites(false);
    }
  };

  useEffect(() => {
    if (isSuperAdmin) {
      refreshInvites();
    }
  }, [isSuperAdmin]);

  const refreshAll = () => {
    setUsers(dataService.getUsers());
    setInvoices(dataService.getInvoices());
    setAuditLogs(dataService.getAuditLogs());
    setAccessRules(dataService.getAccessRules());
    setPlans(dataService.getPlans());
    setTools(dataService.getTools());
    setSettings(dataService.getSettings());
    if (isSuperAdmin) {
      refreshInvites();
    }
  };

  /* =========================================================================
   * DASHBOARD CALCULATIONS
   * ========================================================================= */
  const totalUsersCount = users.length;
  const activeThisMonthCount = users.filter((u) => u.generationsUsedThisMonth > 0).length;
  const totalGenerationsCount = users.reduce((acc, u) => acc + (u.generationsUsedThisMonth || 0), 0);

  const usersByPlan = {
    free: users.filter((u) => u.planId === 'free').length,
    pro: users.filter((u) => u.planId === 'pro').length,
    team: users.filter((u) => u.planId === 'team').length,
    complimentary: users.filter((u) => u.planId === 'complimentary').length,
  };

  const usersByOrgType = {
    nonprofit: users.filter((u) => u.organizationProfile?.type === 'Nonprofit').length,
    startup: users.filter((u) => u.organizationProfile?.type === 'Startup').length,
  };

  /* =========================================================================
   * USER ACTIONS
   * ========================================================================= */
  const handleUpdateUserPlan = async (userId: string, newPlanId: PlanId) => {
    try {
      await dataService.updateUserPlanServer(userId, newPlanId);
      refreshAll();
      if (selectedUserDetail?.id === userId) {
        setSelectedUserDetail(dataService.getUserById(userId));
      }
      notify(`User plan updated to ${newPlanId.toUpperCase()}`);
    } catch (err: any) {
      notify(`Failed to update plan: ${err.message}`);
    }
  };

  /* =========================================================================
   * COMPLIMENTARY INVITE ACTIONS
   * ========================================================================= */
  const handleCreateInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newInviteEmail.trim()) return;
    try {
      setIsCreatingInvite(true);
      const created = await dataService.createInvite(newInviteEmail, newInviteNote, newInviteExpiresAt);
      setNewInviteEmail('');
      setNewInviteNote('');
      setNewInviteExpiresAt('');
      await refreshInvites();
      refreshAll();
      notify(`Complimentary access invite created for ${created.email}`);
    } catch (err: any) {
      notify(`Failed to create invite: ${err.message}`);
    } finally {
      setIsCreatingInvite(false);
    }
  };

  const handleRevokeInvite = async (inviteId: string, email: string) => {
    if (window.confirm(`Revoke complimentary access invite for ${email}?\nIf the user already accepted, their plan will be reverted to Free.`)) {
      try {
        await dataService.revokeInvite(inviteId);
        await refreshInvites();
        refreshAll();
        notify(`Revoked invite for ${email}`);
      } catch (err: any) {
        notify(`Failed to revoke invite: ${err.message}`);
      }
    }
  };

  const handleCopyInviteLink = (inviteId: string) => {
    const link = `${window.location.origin}/invite/${inviteId}`;
    navigator.clipboard.writeText(link).then(() => {
      setCopiedInviteId(inviteId);
      setTimeout(() => setCopiedInviteId(null), 2500);
      notify(`Invite link copied: /invite/${inviteId}`);
    });
  };

  const handleGrantBonus = (userId: string, amount: number) => {
    dataService.grantBonusGenerations(userId, amount);
    refreshAll();
    if (selectedUserDetail?.id === userId) {
      setSelectedUserDetail(dataService.getUserById(userId));
    }
    notify(`Granted +${amount} bonus generations`);
  };

  const handleResetUserUsage = (userId: string) => {
    dataService.resetUsage(userId);
    refreshAll();
    if (selectedUserDetail?.id === userId) {
      setSelectedUserDetail(dataService.getUserById(userId));
    }
    notify('Monthly generation usage reset to 0');
  };

  const handleToggleNonprofitDiscount = (userId: string, current: boolean) => {
    dataService.updateUser(userId, { nonprofitDiscountApproved: !current });
    dataService.logAction('DISCOUNT_TOGGLED', `Admin toggled nonprofit 25% discount to ${!current}`, userId);
    refreshAll();
    if (selectedUserDetail?.id === userId) {
      setSelectedUserDetail(dataService.getUserById(userId));
    }
    notify(`Nonprofit discount ${!current ? 'Approved (25% off)' : 'Revoked'}`);
  };

  const handleToggleSuspend = (userId: string, currentStatus: 'active' | 'suspended') => {
    const nextStatus = currentStatus === 'active' ? 'suspended' : 'active';
    dataService.updateUser(userId, { status: nextStatus });
    dataService.logAction('USER_STATUS_CHANGE', `Admin changed user status to ${nextStatus}`, userId);
    refreshAll();
    if (selectedUserDetail?.id === userId) {
      setSelectedUserDetail(dataService.getUserById(userId));
    }
    notify(`User account marked as ${nextStatus.toUpperCase()}`);
  };

  const handleDeleteUser = (userId: string) => {
    if (window.confirm('Are you sure you want to delete this user and their saved outputs?')) {
      dataService.deleteUser(userId);
      refreshAll();
      setSelectedUserDetail(null);
      notify('User deleted permanently.');
    }
  };

  const handleUpdateRole = async (userId: string, newRole: UserRole) => {
    if (!isSuperAdmin) {
      alert('Only Super Admins can modify user administrative roles.');
      return;
    }
    try {
      await dataService.updateUserRoleServer(userId, newRole);
      refreshAll();
      if (selectedUserDetail?.id === userId) {
        setSelectedUserDetail(dataService.getUserById(userId));
      }
      notify(`Assigned role ${newRole}`);
    } catch (err: any) {
      notify(`Failed to assign role: ${err.message}`);
    }
  };

  /* =========================================================================
   * BILLING ACTIONS
   * ========================================================================= */
  const handleIssueRefund = async (invoiceId: string) => {
    if (window.confirm('Issue a simulated full refund for this invoice?')) {
      await billingService.issueRefund(invoiceId);
      refreshAll();
      notify('Simulated refund issued.');
    }
  };

  const handleExportInvoicesCSV = () => {
    const headers = ['Invoice ID', 'Date', 'User Name', 'Email', 'Organization', 'Plan', 'Amount', 'Status'];
    const rows = invoices.map((inv) => [
      inv.pdfReceiptId,
      inv.date,
      `"${inv.userName}"`,
      inv.userEmail,
      `"${inv.orgName}"`,
      `"${inv.planName}"`,
      inv.amount.toFixed(2),
      inv.status,
    ]);

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `millennium_invoices_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    notify('Invoices exported to CSV');
  };

  /* =========================================================================
   * ACCESS RULES & INVITE
   * ========================================================================= */
  const handleAddAccessRule = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRuleValue.trim()) return;
    dataService.addAccessRule({
      type: newRuleType,
      value: newRuleValue.trim(),
      notes: newRuleNotes.trim() || 'Added via admin portal',
    });
    setNewRuleValue('');
    setNewRuleNotes('');
    refreshAll();
    notify('Access rule added.');
  };

  const handleDeleteAccessRule = (ruleId: string) => {
    dataService.deleteAccessRule(ruleId);
    refreshAll();
    notify('Access rule deleted.');
  };

  const handleDirectInvite = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail || !inviteName) return;

    dataService.createUser({
      name: inviteName,
      email: inviteEmail,
      role: 'member',
      planId: 'free',
      organizationProfile: {
        orgName: `${inviteName}'s Org`,
        type: inviteOrgType,
        whatTheyDo: 'Invited team member account',
        targetAudience: 'Clients & partners',
        goals: ['Complete initial marketing foundations'],
        brandTone: ['Professional', 'Inspiring'],
        budget: 'Under $500/month',
      },
    });

    dataService.logAction('ADMIN_INVITE', `Admin directly invited ${inviteName} (${inviteEmail})`);
    setInviteName('');
    setInviteEmail('');
    refreshAll();
    notify(`Invited ${inviteEmail} to Launchpad`);
  };

  /* =========================================================================
   * PLANS & TOOLS DYNAMIC CONFIG
   * ========================================================================= */
  const handleUpdatePlanLimit = (planId: string, newLimit: number) => {
    dataService.updatePlan(planId, { generationLimit: newLimit });
    refreshAll();
    notify(`Updated ${planId} limit to ${newLimit}/mo`);
  };

  const handleUpdatePlanPrice = (planId: string, newPrice: number) => {
    dataService.updatePlan(planId, {
      price: newPrice,
      priceNonprofit: Math.round(newPrice * 0.75 * 100) / 100, // 25% discount automatic
    });
    refreshAll();
    notify(`Updated ${planId} pricing`);
  };

  const handleToggleToolGlobal = (toolId: string, current: boolean) => {
    dataService.updateTool(toolId, { enabledGlobally: !current });
    refreshAll();
    notify(`Tool ${!current ? 'Enabled globally' : 'Disabled globally'}`);
  };


  // Filter users list
  const filteredUsers = users.filter((u) => {
    if (userPlanFilter !== 'all' && u.planId !== userPlanFilter) return false;
    if (userOrgFilter !== 'all' && u.organizationProfile?.type !== userOrgFilter) return false;
    if (userSearch.trim()) {
      const q = userSearch.toLowerCase();
      const matchName = u.name.toLowerCase().includes(q);
      const matchEmail = u.email.toLowerCase().includes(q);
      const matchOrg = (u.organizationProfile?.orgName || '').toLowerCase().includes(q);
      return matchName || matchEmail || matchOrg;
    }
    return true;
  });

  return (
    <div className="space-y-6 pb-16">
      {/* Admin Top Header */}
      <div className="bg-slate-900 text-white rounded-3xl p-6 sm:p-8 shadow-xl border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-rose-500/20 text-rose-300 border border-rose-400/30">
              Agency Operations
            </span>
            <span className="text-xs text-slate-400">
              Logged in as <strong className="text-white">{currentUser.name}</strong> ({currentUser.role.replace('_', ' ')})
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight font-heading">
            Millennium Agency Launchpad Admin
          </h1>
          <p className="text-xs text-slate-300 mt-1 max-w-xl">
            Real-time management of client organizations, generation limits, subscription revenue, tool access, and user impersonation.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={refreshAll}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1.5 transition-colors border border-slate-700"
            title="Refresh tables"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Refresh Data</span>
          </button>
        </div>
      </div>

      {adminNotification && (
        <div className="p-3 bg-emerald-50 text-emerald-900 text-xs font-bold rounded-2xl border border-emerald-200 flex items-center justify-between animate-in fade-in duration-150">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{adminNotification}</span>
          </div>
          <button onClick={() => setAdminNotification(null)}>&times;</button>
        </div>
      )}

      {/* Admin Tabs */}
      <div className="flex items-center gap-1 border-b border-slate-200 pb-px overflow-x-auto text-xs font-bold">
        {[
          { key: 'dashboard', label: 'Executive Dashboard', icon: LayoutDashboard },
          { key: 'users', label: `Users & Organizations (${users.length})`, icon: UsersIcon },
          { key: 'invites', label: `Invites (${invites.length})`, icon: Mail },
          { key: 'billing', label: 'Billing & Invoices', icon: CreditCard },
          { key: 'access', label: 'Access Control', icon: ShieldCheck },
          { key: 'plans', label: 'Plans & Limits', icon: Sliders },
          { key: 'tools', label: 'Tools Config', icon: Wrench },
          { key: 'audit', label: 'Audit Trail', icon: FileText },
          { key: 'settings', label: 'Agency Settings', icon: SettingsIcon },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key as any)}
              className={`flex items-center gap-2 px-3.5 py-2.5 rounded-t-xl transition-all whitespace-nowrap border-b-2 ${
                isActive
                  ? 'border-rose-600 bg-white text-rose-600 shadow-xs'
                  : 'border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-100'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* =====================================================================
       * TAB 1: EXECUTIVE DASHBOARD
       * ===================================================================== */}
      {activeTab === 'dashboard' && (
        <div className="space-y-6">
          {/* Key Metric Stat Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3.5">
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Total Users</span>
              <div className="text-2xl font-extrabold text-slate-900 mt-1">{totalUsersCount}</div>
              <span className="text-[10px] text-slate-500 font-medium">Firestore users</span>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Active This Month</span>
              <div className="text-2xl font-extrabold text-slate-900 mt-1">{activeThisMonthCount}</div>
              <span className="text-[10px] text-slate-500 font-medium">Generating copy</span>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Total Generations</span>
              <div className="text-2xl font-extrabold text-rose-600 mt-1">{totalGenerationsCount}</div>
              <span className="text-[10px] text-slate-500 font-medium">AI deliverables</span>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Database</span>
              <div className="text-lg font-extrabold text-emerald-700 mt-1">Cloud Firestore</div>
              <span className="text-[10px] text-emerald-600 font-medium">Enterprise edition</span>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Nonprofit Ratio</span>
              <div className="text-2xl font-extrabold text-slate-900 mt-1">
                {totalUsersCount > 0 ? Math.round((usersByOrgType.nonprofit / totalUsersCount) * 100) : 0}%
              </div>
              <span className="text-[10px] text-slate-500 font-medium">{usersByOrgType.nonprofit} Nonprofits</span>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Startups</span>
              <div className="text-2xl font-extrabold text-slate-900 mt-1">
                {usersByOrgType.startup}
              </div>
              <span className="text-[10px] text-slate-500 font-medium">Seed & venture</span>
            </div>
          </div>

          {/* Real Firestore Activity Feed & Breakdown Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Live Activity Trail from Firestore (7 cols) */}
            <div className="lg:col-span-7 bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-rose-600" />
                  <h3 className="text-sm font-bold text-slate-900">Live Activity Feed (Cloud Firestore)</h3>
                </div>
                <span className="text-[10px] font-semibold text-emerald-600 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block"></span>
                  Real-time
                </span>
              </div>

              {/* Real Audit logs stream */}
              <div className="space-y-2.5 pt-1">
                {auditLogs.length === 0 ? (
                  <div className="p-8 text-center text-xs text-slate-400">
                    No activity recorded yet. Live user logins, marketing tool generations, and edits will appear here.
                  </div>
                ) : (
                  auditLogs.slice(0, 7).map((log) => (
                    <div
                      key={log.id}
                      className="p-3 rounded-xl bg-slate-50/70 border border-slate-100 flex items-center justify-between text-xs gap-3"
                    >
                      <div className="min-w-0">
                        <span className="font-bold text-slate-900 block truncate">{log.details}</span>
                        <span className="text-[11px] text-slate-500">
                          by {log.actorName || log.actorEmail} ({log.action})
                        </span>
                      </div>
                      <span className="text-[10px] font-mono text-slate-400 shrink-0">
                        {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Plan & Org Breakdown (5 cols) */}
            <div className="lg:col-span-5 bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-5">
              <h3 className="text-sm font-bold text-slate-900 pb-3 border-b border-slate-100">
                Client Segmentation
              </h3>

              {/* By Plan */}
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-2">
                  Distribution by Subscription Plan
                </span>
                <div className="space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-slate-700">Free Starter</span>
                    <span className="font-mono font-bold text-slate-900">{usersByPlan.free} orgs</span>
                  </div>
                  <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="bg-slate-400 h-full rounded-full"
                      style={{ width: `${(usersByPlan.free / totalUsersCount) * 100}%` }}
                    />
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <span className="font-medium text-rose-700">Pro Growth ($49/mo)</span>
                    <span className="font-mono font-bold text-slate-900">{usersByPlan.pro} orgs</span>
                  </div>
                  <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="bg-rose-500 h-full rounded-full"
                      style={{ width: `${(usersByPlan.pro / totalUsersCount) * 100}%` }}
                    />
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <span className="font-medium text-purple-700">Agency Team ($149/mo)</span>
                    <span className="font-mono font-bold text-slate-900">{usersByPlan.team} orgs</span>
                  </div>
                  <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="bg-purple-600 h-full rounded-full"
                      style={{ width: `${(usersByPlan.team / totalUsersCount) * 100}%` }}
                    />
                  </div>
                </div>
              </div>

              {/* By Org Type */}
              <div className="pt-3 border-t border-slate-100">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-2">
                  Distribution by Sector
                </span>
                <div className="grid grid-cols-2 gap-3 text-center">
                  <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200">
                    <span className="text-xl font-extrabold text-emerald-800">{usersByOrgType.nonprofit}</span>
                    <p className="text-[11px] font-bold text-emerald-900 mt-0.5">Nonprofits</p>
                    <p className="text-[10px] text-emerald-700">25% discount eligible</p>
                  </div>
                  <div className="p-3 rounded-xl bg-indigo-50 border border-indigo-200">
                    <span className="text-xl font-extrabold text-indigo-800">{usersByOrgType.startup}</span>
                    <p className="text-[11px] font-bold text-indigo-900 mt-0.5">Startups</p>
                    <p className="text-[10px] text-indigo-700">Seed & Venture focus</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
       * TAB 2: USERS & ORGANIZATIONS TABLE
       * ===================================================================== */}
      {activeTab === 'users' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          {/* Table Search & Filters Header */}
          <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="relative w-full sm:w-80">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                placeholder="Search by name, email, or org..."
                className="w-full pl-9 pr-3 py-1.5 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-rose-500"
              />
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto justify-end overflow-x-auto text-xs">
              <Filter className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <select
                value={userPlanFilter}
                onChange={(e) => setUserPlanFilter(e.target.value)}
                className="py-1.5 px-2.5 rounded-xl border border-slate-200 bg-slate-50 text-slate-700 font-medium"
              >
                <option value="all">All Plans</option>
                <option value="free">Free Starter</option>
                <option value="pro">Pro Growth</option>
                <option value="team">Agency Team</option>
                <option value="complimentary">Complimentary</option>
              </select>

              <select
                value={userOrgFilter}
                onChange={(e) => setUserOrgFilter(e.target.value)}
                className="py-1.5 px-2.5 rounded-xl border border-slate-200 bg-slate-50 text-slate-700 font-medium"
              >
                <option value="all">All Org Types</option>
                <option value="Nonprofit">Nonprofit</option>
                <option value="Startup">Startup</option>
              </select>
            </div>
          </div>

          {/* Denser Data Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 uppercase text-[10px] font-bold border-b border-slate-200">
                <tr>
                  <th className="py-2.5 px-4">User / Organization</th>
                  <th className="py-2.5 px-4">Type</th>
                  <th className="py-2.5 px-4">Plan</th>
                  <th className="py-2.5 px-4">Usage (Mtd)</th>
                  <th className="py-2.5 px-4">Status</th>
                  <th className="py-2.5 px-4">Role</th>
                  <th className="py-2.5 px-4">Last Active</th>
                  <th className="py-2.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredUsers.map((u) => {
                  const p = plans.find((pl) => pl.id === u.planId);
                  const isNp = u.organizationProfile?.type === 'Nonprofit';

                  return (
                    <tr
                      key={u.id}
                      className="hover:bg-blue-50/40 transition-colors group cursor-pointer"
                      onClick={() => setSelectedUserDetail(u)}
                    >
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          <img
                            src={u.avatar}
                            alt={u.name}
                            className="w-8 h-8 rounded-full object-cover border border-slate-200 shrink-0"
                          />
                          <div>
                            <div className="font-bold text-slate-900 group-hover:text-blue-600 transition-colors">
                              {u.name}
                            </div>
                            <div className="text-[11px] text-slate-500">
                              {u.organizationProfile?.orgName || 'No org configured'}
                            </div>
                            <div className="text-[10px] text-slate-400 font-mono">{u.email}</div>
                          </div>
                        </div>
                      </td>

                      <td className="py-3 px-4">
                        <span
                          className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                            isNp
                              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                              : 'bg-indigo-50 text-indigo-800 border border-indigo-200'
                          }`}
                        >
                          {u.organizationProfile?.type || 'Startup'}
                        </span>
                      </td>

                      <td className="py-3 px-4 font-semibold text-slate-800">
                        {p?.name}
                        {isNp && u.nonprofitDiscountApproved && (
                          <div className="text-[10px] text-emerald-600 font-medium">25% Discount</div>
                        )}
                      </td>

                      <td className="py-3 px-4">
                        <div className="font-mono font-semibold text-slate-900">
                          {u.generationsUsedThisMonth} / {p?.generationLimit}
                        </div>
                        {u.bonusGenerations > 0 && (
                          <span className="text-[10px] text-rose-600 font-medium">
                            +{u.bonusGenerations} bonus
                          </span>
                        )}
                      </td>

                      <td className="py-3 px-4">
                        <span
                          className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                            u.status === 'active'
                              ? 'bg-emerald-50 text-emerald-700'
                              : 'bg-red-50 text-red-700 border border-red-200'
                          }`}
                        >
                          {u.status.toUpperCase()}
                        </span>
                      </td>

                      <td className="py-3 px-4 font-mono text-[11px] text-slate-600">
                        {u.role}
                      </td>

                      <td className="py-3 px-4 font-mono text-[11px] text-slate-500 whitespace-nowrap">
                        {new Date(u.lastLogin).toLocaleDateString()}
                      </td>

                      <td className="py-3 px-4 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center gap-1.5 justify-end">
                          <button
                            onClick={() => onImpersonateUser(u)}
                            className="px-2.5 py-1 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-[11px] font-bold flex items-center gap-1"
                            title="View application as this user"
                          >
                            <Eye className="w-3 h-3" />
                            <span>Impersonate</span>
                          </button>

                          <button
                            onClick={() => setSelectedUserDetail(u)}
                            className="px-2 py-1 border border-slate-200 hover:bg-slate-100 rounded-lg text-[11px] font-semibold text-slate-700"
                          >
                            Details
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* =====================================================================
       * USER DETAIL MODAL / DRAWER
       * ===================================================================== */}
      {selectedUserDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs overflow-y-auto">
          <div className="relative w-full max-w-2xl bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden my-8 animate-in fade-in zoom-in-95 duration-200 max-h-[90vh] flex flex-col">
            {/* Header */}
            <div className="p-6 bg-slate-900 text-white flex items-start justify-between border-b border-slate-800">
              <div className="flex items-center gap-3.5">
                <img
                  src={selectedUserDetail.avatar}
                  alt={selectedUserDetail.name}
                  className="w-12 h-12 rounded-full object-cover border border-slate-700"
                />
                <div>
                  <h2 className="text-lg font-bold font-heading">{selectedUserDetail.name}</h2>
                  <p className="text-xs text-slate-400 font-mono">{selectedUserDetail.email}</p>
                  <p className="text-xs text-rose-300 mt-0.5">
                    {selectedUserDetail.organizationProfile?.orgName} ({selectedUserDetail.organizationProfile?.type})
                  </p>
                </div>
              </div>

              <button
                onClick={() => setSelectedUserDetail(null)}
                className="p-1.5 rounded-full text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Scrollable details */}
            <div className="p-6 overflow-y-auto space-y-6 text-xs">
              {/* Impersonation Banner */}
              <div className="p-3.5 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-between">
                <div>
                  <div className="font-bold text-blue-900 text-xs">User Impersonation (&quot;View as user&quot;)</div>
                  <p className="text-[11px] text-blue-700">
                    Switch your session into {selectedUserDetail.name}&apos;s account to audit their tools, library, and usage.
                  </p>
                </div>
                <button
                  onClick={() => {
                    onImpersonateUser(selectedUserDetail);
                    setSelectedUserDetail(null);
                  }}
                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-lg flex items-center gap-1.5 shadow-xs"
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>Start Impersonation</span>
                </button>
              </div>

              {/* Plan & Usage Management */}
              <div className="space-y-3">
                <span className="font-bold text-slate-800 uppercase tracking-wide text-[10px]">
                  Subscription Plan & Quota
                </span>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {(['free', 'pro', 'team', 'complimentary'] as const).map((pId) => (
                    <button
                      key={pId}
                      onClick={() => handleUpdateUserPlan(selectedUserDetail.id, pId)}
                      className={`p-2.5 rounded-xl border text-center transition-all ${
                        selectedUserDetail.planId === pId
                          ? 'border-rose-600 bg-rose-50 text-rose-900 font-bold ring-1 ring-rose-600'
                          : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      <div className="capitalize truncate text-[11px] font-bold">{pId}</div>
                      <div className="text-[10px] text-slate-400">
                        {pId === 'free' ? '50/mo' : pId === 'pro' ? '500/mo' : '2000/mo'}
                      </div>
                    </button>
                  ))}
                </div>

                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <button
                    onClick={() => handleGrantBonus(selectedUserDetail.id, 50)}
                    className="px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 font-bold text-slate-700 flex items-center gap-1"
                  >
                    <Plus className="w-3 h-3 text-rose-600" />
                    <span>+50 Bonus Generations</span>
                  </button>

                  <button
                    onClick={() => handleGrantBonus(selectedUserDetail.id, 100)}
                    className="px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 font-bold text-slate-700 flex items-center gap-1"
                  >
                    <Plus className="w-3 h-3 text-rose-600" />
                    <span>+100 Bonus Generations</span>
                  </button>

                  <button
                    onClick={() => handleResetUserUsage(selectedUserDetail.id)}
                    className="px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 font-bold text-slate-700 flex items-center gap-1"
                  >
                    <RefreshCw className="w-3 h-3 text-amber-600" />
                    <span>Reset Usage to 0</span>
                  </button>
                </div>
              </div>

              {/* Nonprofit Discount & Moderation */}
              <div className="grid grid-cols-2 gap-3 pt-2">
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                  <span className="font-bold text-slate-800 text-[11px] block">Nonprofit 25% Discount</span>
                  <p className="text-[10px] text-slate-500">
                    Status: {selectedUserDetail.nonprofitDiscountApproved ? 'APPROVED' : 'PENDING / REVOKED'}
                  </p>
                  <button
                    onClick={() =>
                      handleToggleNonprofitDiscount(
                        selectedUserDetail.id,
                        selectedUserDetail.nonprofitDiscountApproved
                      )
                    }
                    className={`w-full py-1.5 rounded-lg text-xs font-bold ${
                      selectedUserDetail.nonprofitDiscountApproved
                        ? 'bg-amber-100 text-amber-800 hover:bg-amber-200'
                        : 'bg-emerald-600 text-white hover:bg-emerald-700'
                    }`}
                  >
                    {selectedUserDetail.nonprofitDiscountApproved ? 'Revoke Discount' : 'Approve 25% Discount'}
                  </button>
                </div>

                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                  <span className="font-bold text-slate-800 text-[11px] block">Account Status</span>
                  <p className="text-[10px] text-slate-500">Status: {selectedUserDetail.status.toUpperCase()}</p>
                  <button
                    onClick={() =>
                      handleToggleSuspend(selectedUserDetail.id, selectedUserDetail.status)
                    }
                    className={`w-full py-1.5 rounded-lg text-xs font-bold ${
                      selectedUserDetail.status === 'active'
                        ? 'bg-rose-100 text-rose-800 hover:bg-rose-200'
                        : 'bg-emerald-600 text-white hover:bg-emerald-700'
                    }`}
                  >
                    {selectedUserDetail.status === 'active' ? 'Suspend Account' : 'Reactivate Account'}
                  </button>
                </div>
              </div>

              {/* Administrative Role Management (Super Admin only) */}
              {isSuperAdmin && (
                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                  <span className="font-bold text-slate-800 text-[11px] block">Admin Role Assignment</span>
                  <div className="flex gap-2">
                    {(['member', 'support', 'admin', 'super_admin'] as const).map((r) => (
                      <button
                        key={r}
                        onClick={() => handleUpdateRole(selectedUserDetail.id, r)}
                        className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase transition-all ${
                          selectedUserDetail.role === r
                            ? 'bg-slate-900 text-white'
                            : 'border border-slate-200 text-slate-600 hover:bg-white'
                        }`}
                      >
                        {r.replace('_', ' ')}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Danger Zone: Delete User */}
              <div className="pt-4 border-t border-slate-200 flex items-center justify-between">
                <span className="text-[11px] text-slate-500">Permanent destruction of user record:</span>
                <button
                  onClick={() => handleDeleteUser(selectedUserDetail.id)}
                  className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-bold flex items-center gap-1"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Delete User</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
       * TAB: COMPLIMENTARY INVITES SYSTEM
       * ===================================================================== */}
      {activeTab === 'invites' && (
        <div className="space-y-6">
          {/* Create Invite Form */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center border border-rose-100">
                  <Mail className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Create Complimentary Access Invite</h3>
                  <p className="text-xs text-slate-500">
                    Grant 2,000 monthly AI generations, full marketing tool access, and zero payment required.
                  </p>
                </div>
              </div>
              <span className="px-2.5 py-1 rounded-full text-[10px] font-extrabold bg-rose-50 text-rose-700 border border-rose-200">
                Super Admin Only
              </span>
            </div>

            <form onSubmit={handleCreateInvite} className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Recipient Email Address <span className="text-rose-600">*</span>
                </label>
                <input
                  type="email"
                  required
                  value={newInviteEmail}
                  onChange={(e) => setNewInviteEmail(e.target.value)}
                  placeholder="partner@organization.org"
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-rose-500 bg-slate-50"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Optional Note / Reference
                </label>
                <input
                  type="text"
                  value={newInviteNote}
                  onChange={(e) => setNewInviteNote(e.target.value)}
                  placeholder="e.g. VIP partner fall cohort"
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-rose-500 bg-slate-50"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Optional Expiration Date
                </label>
                <input
                  type="date"
                  value={newInviteExpiresAt}
                  onChange={(e) => setNewInviteExpiresAt(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-rose-500 bg-slate-50"
                />
              </div>

              <div className="sm:col-span-3 flex justify-end pt-2">
                <button
                  type="submit"
                  disabled={isCreatingInvite || !newInviteEmail.trim()}
                  className="px-5 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-xs cursor-pointer disabled:opacity-50 transition-all"
                >
                  {isCreatingInvite ? (
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <Plus className="w-4 h-4" />
                  )}
                  <span>Create invite</span>
                </button>
              </div>
            </form>
          </div>

          {/* Invites Ledger */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Complimentary Invitations Ledger</h3>
                <p className="text-xs text-slate-500">
                  Track pending, accepted, expired, and revoked complimentary access links.
                </p>
              </div>

              <button
                onClick={refreshInvites}
                disabled={isLoadingInvites}
                className="px-3 py-1.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-xs font-semibold text-slate-700 flex items-center gap-1.5 self-start sm:self-auto cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoadingInvites ? 'animate-spin' : ''}`} />
                <span>Refresh Invites</span>
              </button>
            </div>

            {invites.length === 0 ? (
              <div className="py-12 text-center text-slate-400 space-y-2">
                <Mail className="w-8 h-8 mx-auto text-slate-300" />
                <p className="text-xs font-semibold">No complimentary invitations issued yet.</p>
                <p className="text-[11px] text-slate-400">Use the form above to invite a partner or VIP organization.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-500 uppercase text-[10px] font-bold border-b border-slate-200">
                    <tr>
                      <th className="py-2.5 px-3">Invitee Email</th>
                      <th className="py-2.5 px-3">Plan</th>
                      <th className="py-2.5 px-3">Status</th>
                      <th className="py-2.5 px-3">Created By</th>
                      <th className="py-2.5 px-3">Created At</th>
                      <th className="py-2.5 px-3">Expires At</th>
                      <th className="py-2.5 px-3">Note</th>
                      <th className="py-2.5 px-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {invites.map((inv) => {
                      const isExpired = inv.status === 'expired';
                      const isRevoked = inv.status === 'revoked';
                      const isAccepted = inv.status === 'accepted';
                      const isPending = inv.status === 'pending';

                      return (
                        <tr key={inv.id} className="hover:bg-slate-50 transition-colors">
                          <td className="py-3 px-3 font-mono font-bold text-slate-900">
                            {inv.email}
                          </td>
                          <td className="py-3 px-3">
                            <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                              Complimentary
                            </span>
                          </td>
                          <td className="py-3 px-3">
                            {isPending && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                                <Clock className="w-3 h-3 text-amber-600" />
                                <span>Pending</span>
                              </span>
                            )}
                            {isAccepted && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                                <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                <span>Accepted</span>
                              </span>
                            )}
                            {isRevoked && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-800 border border-rose-200">
                                <X className="w-3 h-3 text-rose-600" />
                                <span>Revoked</span>
                              </span>
                            )}
                            {isExpired && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
                                <AlertCircle className="w-3 h-3 text-slate-400" />
                                <span>Expired</span>
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-3 text-slate-600 text-[11px]">
                            {inv.createdByEmail || inv.createdBy}
                          </td>
                          <td className="py-3 px-3 text-slate-500 text-[11px]">
                            {new Date(inv.createdAt).toLocaleDateString()}
                          </td>
                          <td className="py-3 px-3 text-slate-500 text-[11px]">
                            {inv.expiresAt ? new Date(inv.expiresAt).toLocaleDateString() : 'Never'}
                          </td>
                          <td className="py-3 px-3 text-slate-600 text-[11px] max-w-[150px] truncate">
                            {inv.note || '—'}
                          </td>
                          <td className="py-3 px-3 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                onClick={() => handleCopyInviteLink(inv.id)}
                                className={`px-2.5 py-1 rounded-lg text-xs font-semibold border flex items-center gap-1 transition-all cursor-pointer ${
                                  copiedInviteId === inv.id
                                    ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                                    : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-200'
                                }`}
                                title="Copy invite link to clipboard"
                              >
                                {copiedInviteId === inv.id ? (
                                  <>
                                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                                    <span>Copied</span>
                                  </>
                                ) : (
                                  <>
                                    <Copy className="w-3.5 h-3.5 text-slate-400" />
                                    <span>Copy Link</span>
                                  </>
                                )}
                              </button>

                              {(isPending || isAccepted) && (
                                <button
                                  onClick={() => handleRevokeInvite(inv.id, inv.email)}
                                  className="px-2.5 py-1 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-semibold cursor-pointer transition-colors"
                                  title="Revoke access and revert user to free"
                                >
                                  Revoke
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* =====================================================================
       * TAB 3: BILLING & SUBSCRIPTIONS
       * ===================================================================== */}
      {activeTab === 'billing' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden space-y-4 p-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Subscription & Invoice Ledger</h3>
              <p className="text-xs text-slate-500">
                Track simulated Stripe charges, issue refunds, and export financial reports.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <select
                value={invoiceStatusFilter}
                onChange={(e) => setInvoiceStatusFilter(e.target.value)}
                className="py-1.5 px-2.5 text-xs rounded-xl border border-slate-200 bg-slate-50 text-slate-700 font-medium"
              >
                <option value="all">All Invoices</option>
                <option value="paid">Paid</option>
                <option value="past_due">Past Due</option>
                <option value="refunded">Refunded</option>
              </select>

              <button
                onClick={handleExportInvoicesCSV}
                className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold flex items-center gap-1.5"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export CSV</span>
              </button>
            </div>
          </div>

          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-500 uppercase text-[10px] font-bold">
              <tr>
                <th className="py-2.5 px-3">Receipt #</th>
                <th className="py-2.5 px-3">Date</th>
                <th className="py-2.5 px-3">Customer / Org</th>
                <th className="py-2.5 px-3">Plan</th>
                <th className="py-2.5 px-3">Amount</th>
                <th className="py-2.5 px-3">Status</th>
                <th className="py-2.5 px-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {invoices
                .filter((inv) => (invoiceStatusFilter === 'all' ? true : inv.status === invoiceStatusFilter))
                .map((inv) => (
                  <tr key={inv.id} className="hover:bg-slate-50/50">
                    <td className="py-3 px-3 font-mono font-bold text-slate-800">{inv.pdfReceiptId}</td>
                    <td className="py-3 px-3 font-mono text-slate-500">{inv.date}</td>
                    <td className="py-3 px-3">
                      <div className="font-semibold text-slate-900">{inv.userName}</div>
                      <div className="text-[11px] text-slate-500">{inv.orgName}</div>
                    </td>
                    <td className="py-3 px-3 font-medium text-slate-700">{inv.planName}</td>
                    <td className="py-3 px-3 font-bold text-slate-900">${inv.amount.toFixed(2)}</td>
                    <td className="py-3 px-3">
                      <span
                        className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                          inv.status === 'paid'
                            ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                            : inv.status === 'refunded'
                            ? 'bg-slate-100 text-slate-600'
                            : 'bg-amber-50 text-amber-800'
                        }`}
                      >
                        {inv.status.toUpperCase()}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-right whitespace-nowrap">
                      <div className="flex items-center gap-2 justify-end">
                        <button
                          onClick={() => onViewReceipt(inv)}
                          className="text-xs text-blue-600 hover:text-blue-800 font-semibold"
                        >
                          Receipt
                        </button>
                        {inv.status === 'paid' && (
                          <button
                            onClick={() => handleIssueRefund(inv.id)}
                            className="text-xs text-rose-600 hover:text-rose-800 font-semibold"
                          >
                            Refund
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}

      {/* =====================================================================
       * TAB 4: ACCESS CONTROL (ALLOWLIST & DIRECT INVITE)
       * ===================================================================== */}
      {activeTab === 'access' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left: Rules List (7 cols) */}
          <div className="lg:col-span-7 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-sm font-bold text-slate-900">Email & Domain Access Control Rules</h3>
              <span className="text-xs text-slate-500 font-mono">{accessRules.length} rules active</span>
            </div>

            <form onSubmit={handleAddAccessRule} className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2.5">
              <span className="font-bold text-slate-800 text-xs block">Add New Rule</span>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <select
                  value={newRuleType}
                  onChange={(e) => setNewRuleType(e.target.value as any)}
                  className="px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 bg-white font-bold"
                >
                  <option value="allow">ALLOW</option>
                  <option value="block">BLOCK</option>
                </select>
                <input
                  type="text"
                  required
                  value={newRuleValue}
                  onChange={(e) => setNewRuleValue(e.target.value)}
                  placeholder="e.g. @seedfoundry.org or spammer@bot.com"
                  className="sm:col-span-2 px-3 py-1.5 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-rose-500"
                />
              </div>
              <input
                type="text"
                value={newRuleNotes}
                onChange={(e) => setNewRuleNotes(e.target.value)}
                placeholder="Reason or partner notes..."
                className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-rose-500"
              />
              <button
                type="submit"
                className="w-full py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-bold"
              >
                Add Rule to Engine
              </button>
            </form>

            <div className="divide-y divide-slate-100 text-xs">
              {accessRules.map((rule) => (
                <div key={rule.id} className="py-2.5 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                        rule.type === 'allow'
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-rose-100 text-rose-800'
                      }`}
                    >
                      {rule.type}
                    </span>
                    <span className="font-mono font-bold text-slate-900">{rule.value}</span>
                    <span className="text-slate-400 text-[11px]">— {rule.notes}</span>
                  </div>

                  <button
                    onClick={() => handleDeleteAccessRule(rule.id)}
                    className="text-slate-400 hover:text-rose-600 p-1"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Right: Direct User Invitation (5 cols) */}
          <div className="lg:col-span-5 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
            <h3 className="text-sm font-bold text-slate-900 pb-3 border-b border-slate-100">
              Direct Client Invitation
            </h3>
            <p className="text-xs text-slate-500">
              Directly seed a client or partner organization without requiring an open sign-up invitation.
            </p>

            <form onSubmit={handleDirectInvite} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Contact Name</label>
                <input
                  type="text"
                  required
                  value={inviteName}
                  onChange={(e) => setInviteName(e.target.value)}
                  placeholder="e.g. Rachel Adams"
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-rose-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Email Address</label>
                <input
                  type="email"
                  required
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="rachel@example.org"
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-rose-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Organization Category</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setInviteOrgType('Nonprofit')}
                    className={`py-2 px-3 rounded-lg border text-xs font-bold ${
                      inviteOrgType === 'Nonprofit'
                        ? 'border-emerald-500 bg-emerald-50 text-emerald-800'
                        : 'border-slate-200 text-slate-600'
                    }`}
                  >
                    Nonprofit
                  </button>
                  <button
                    type="button"
                    onClick={() => setInviteOrgType('Startup')}
                    className={`py-2 px-3 rounded-lg border text-xs font-bold ${
                      inviteOrgType === 'Startup'
                        ? 'border-indigo-500 bg-indigo-50 text-indigo-800'
                        : 'border-slate-200 text-slate-600'
                    }`}
                  >
                    Startup
                  </button>
                </div>
              </div>

              <button
                type="submit"
                className="w-full py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold"
              >
                Create Account & Provision
              </button>
            </form>
          </div>
        </div>
      )}

      {/* =====================================================================
       * TAB 5: PLANS & LIMITS (DYNAMIC LIVE CONFIG)
       * ===================================================================== */}
      {activeTab === 'plans' && (
        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-6">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Dynamic Plan Limits & Pricing</h3>
              <p className="text-xs text-slate-500">
                Modify tier prices and monthly generation quotas on the fly without changing code.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {plans.map((p) => (
              <div key={p.id} className="p-5 rounded-2xl border border-slate-200 bg-slate-50/50 space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-slate-900 text-sm">{p.name}</h4>
                  <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-slate-200 text-slate-700">
                    {p.id}
                  </span>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">
                    Standard Monthly Price ($ USD)
                  </label>
                  <input
                    type="number"
                    value={p.price}
                    onChange={(e) => handleUpdatePlanPrice(p.id, Number(e.target.value))}
                    className="w-full px-3 py-1.5 text-xs font-mono font-bold rounded-lg border border-slate-300 bg-white"
                  />
                  <span className="text-[10px] text-slate-400 mt-0.5 block">
                    Nonprofit 25% discount price: ${p.priceNonprofit}
                  </span>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">
                    Monthly Generation Limit
                  </label>
                  <input
                    type="number"
                    value={p.generationLimit}
                    onChange={(e) => handleUpdatePlanLimit(p.id, Number(e.target.value))}
                    className="w-full px-3 py-1.5 text-xs font-mono font-bold rounded-lg border border-slate-300 bg-white"
                  />
                </div>

                <div className="text-[11px] text-slate-500 space-y-1">
                  <p className="font-semibold text-slate-700">Configured Features:</p>
                  <ul className="list-disc list-inside space-y-0.5">
                    {p.features.slice(0, 3).map((f, i) => (
                      <li key={i}>{f}</li>
                    ))}
                  </ul>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* =====================================================================
       * TAB 6: TOOLS MANAGEMENT
       * ===================================================================== */}
      {activeTab === 'tools' && (
        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div>
              <h3 className="text-sm font-bold text-slate-900">AI Marketing Tool Availability</h3>
              <p className="text-xs text-slate-500">
                Enable, disable, or adjust minimum tier requirements for individual Launchpad tools.
              </p>
            </div>
          </div>

          <div className="divide-y divide-slate-100">
            {tools.map((t) => (
              <div key={t.id} className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-900">{t.name}</span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-600">
                      {t.category}
                    </span>
                    {t.forOrgType && (
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-50 text-purple-700">
                        {t.forOrgType} Only
                      </span>
                    )}
                  </div>
                  <p className="text-slate-500 text-[11px] mt-0.5">{t.description}</p>
                </div>

                <div className="flex items-center gap-3">
                  <span
                    className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${
                      t.enabledGlobally ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-800'
                    }`}
                  >
                    {t.enabledGlobally ? 'Active Globally' : 'Disabled'}
                  </span>

                  <button
                    onClick={() => handleToggleToolGlobal(t.id, t.enabledGlobally)}
                    className="px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-xs font-semibold text-slate-700"
                  >
                    {t.enabledGlobally ? 'Disable' : 'Enable'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* =====================================================================
       * TAB 7: AUDIT TRAIL
       * ===================================================================== */}
      {activeTab === 'audit' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden p-5 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Security & Administrative Audit Log</h3>
              <p className="text-xs text-slate-500">
                Immutable trace of admin actions, plan changes, user impersonations, and grants.
              </p>
            </div>
            <span className="font-mono text-xs text-slate-400">{auditLogs.length} events</span>
          </div>

          <div className="divide-y divide-slate-100 text-xs font-mono">
            {auditLogs.map((log) => (
              <div key={log.id} className="py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-900 text-white">
                      {log.action}
                    </span>
                    <span className="font-bold text-slate-800 font-sans">{log.actorName}</span>
                    <span className="text-slate-400 text-[11px]">({log.actorEmail})</span>
                  </div>
                  <p className="text-slate-600 text-[11px] font-sans mt-0.5">{log.details}</p>
                </div>
                <div className="text-[10px] text-slate-400 shrink-0 sm:text-right">
                  {new Date(log.timestamp).toLocaleString()}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* =====================================================================
       * TAB 8: AGENCY BRANDING & SETTINGS
       * ===================================================================== */}
      {activeTab === 'settings' && (
        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-6 max-w-2xl">
          <div className="pb-3 border-b border-slate-100">
            <h3 className="text-sm font-bold text-slate-900">Agency Branding & Production Configurations</h3>
            <p className="text-xs text-slate-500">
              Customize the partner agency persona, Calendly links, and review POC connection modes.
            </p>
          </div>

          <div className="space-y-4 text-xs">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Agency Name</label>
              <input
                type="text"
                value={settings.agencyName}
                onChange={(e) => setSettings({ ...settings, agencyName: e.target.value })}
                className="w-full px-3 py-2 rounded-xl border border-slate-300"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Calendly Consultation Link</label>
              <input
                type="text"
                value={settings.bookingUrl}
                onChange={(e) => setSettings({ ...settings, bookingUrl: e.target.value })}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 font-mono"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Agency Contact Email</label>
              <input
                type="email"
                value={settings.contactEmail}
                onChange={(e) => setSettings({ ...settings, contactEmail: e.target.value })}
                className="w-full px-3 py-2 rounded-xl border border-slate-300"
              />
            </div>

            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
              <span className="font-bold text-slate-800 text-[11px] block">Current Deployment Configuration</span>
              <div className="grid grid-cols-3 gap-2 font-mono text-[11px]">
                <div className="p-2 rounded bg-white border border-slate-200">
                  <span className="text-slate-400 block text-[9px]">AUTH_MODE</span>
                  <span className="font-bold text-slate-800">{APP_CONFIG.AUTH_MODE}</span>
                </div>
                <div className="p-2 rounded bg-white border border-slate-200">
                  <span className="text-slate-400 block text-[9px]">BILLING_MODE</span>
                  <span className="font-bold text-slate-800">{APP_CONFIG.BILLING_MODE}</span>
                </div>
                <div className="p-2 rounded bg-white border border-slate-200">
                  <span className="text-slate-400 block text-[9px]">DATA_MODE</span>
                  <span className="font-bold text-slate-800">{APP_CONFIG.DATA_MODE}</span>
                </div>
              </div>
            </div>

            <div className="pt-4 border-t border-slate-200 flex justify-end items-center">
              <button
                onClick={() => {
                  dataService.updateSettings(settings);
                  notify('Settings saved successfully');
                }}
                className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-bold"
              >
                Save Settings
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
