import React, { useState, useEffect } from 'react';
import {
  User,
  Invoice,
  AuditLogEntry,
  AccessRule,
  Plan,
  ToolDefinition,
  AgencySettings,
  PlatformSettings,
  UserRole,
  Invite,
  PlanId,
  OrganizationType,
  AdminOrganizationSummary,
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
  Building2,
  UserMinus,
  Save,
  ChevronDown,
  ArrowRight,
} from 'lucide-react';

type AdminTabKey =
  | 'dashboard'
  | 'users'
  | 'organizations'
  | 'invites'
  | 'billing'
  | 'access'
  | 'plans'
  | 'tools'
  | 'audit'
  | 'settings';

interface AdminPanelProps {
  currentUser: User;
  inviteOnlyMode?: boolean;
  onPlatformSettingsChanged?: (settings: PlatformSettings) => void;
  onViewReceipt: (invoice: Invoice) => void;
}

export const AdminPanel: React.FC<AdminPanelProps> = ({
  currentUser,
  inviteOnlyMode = false,
  onPlatformSettingsChanged,
  onViewReceipt,
}) => {
  const [activeTab, setActiveTab] = useState<AdminTabKey>('dashboard');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

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
  const [platformSettings, setPlatformSettings] = useState<PlatformSettings>(() => ({
    inviteOnlyMode: inviteOnlyMode ?? dataService.getPlatformSettings().inviteOnlyMode,
  }));
  const [isUpdatingPlatformSettings, setIsUpdatingPlatformSettings] = useState(false);
  const [isExportingUsersCsv, setIsExportingUsersCsv] = useState(false);

  // Organizations & Teams state (Super Admin)
  const [adminOrganizations, setAdminOrganizations] = useState<AdminOrganizationSummary[]>([]);
  const [isLoadingOrgs, setIsLoadingOrgs] = useState(false);
  const [orgSearch, setOrgSearch] = useState('');
  const [seatLimitEdits, setSeatLimitEdits] = useState<Record<string, string>>({});
  const [savingSeatOrgId, setSavingSeatOrgId] = useState<string | null>(null);
  const [removingOrgMemberKey, setRemovingOrgMemberKey] = useState<string | null>(null);

  // Dynamic Plan Limits & Pricing draft state
  const [planDrafts, setPlanDrafts] = useState<Record<string, { price: string; generationLimit: string }>>(() =>
    Object.fromEntries(
      dataService.getPlans().map((p) => [
        p.id,
        { price: String(p.price), generationLimit: String(p.generationLimit) },
      ])
    )
  );
  const [isSavingPlans, setIsSavingPlans] = useState(false);
  const [plansError, setPlansError] = useState<string | null>(null);

  const isSuperAdmin = currentUser.role === 'super_admin';
  const isReadOnlySupport = currentUser.role === 'support';

  useEffect(() => {
    setPlatformSettings((prev) => ({ ...prev, inviteOnlyMode }));
  }, [inviteOnlyMode]);

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

  const refreshPlatformSettings = async () => {
    const fresh = await dataService.fetchPlatformSettings();
    setPlatformSettings(fresh);
    onPlatformSettingsChanged?.(fresh);
  };

  const refreshOrganizations = async () => {
    if (!isSuperAdmin) return;
    try {
      setIsLoadingOrgs(true);
      const list = await dataService.fetchAdminOrganizations();
      setAdminOrganizations(list);
      setSeatLimitEdits((prev) => {
        const next: Record<string, string> = { ...prev };
        list.forEach((org) => {
          if (next[org.id] === undefined) {
            next[org.id] = String(org.seatLimit);
          }
        });
        return next;
      });
    } catch (err: any) {
      console.error('Failed to load organizations:', err);
    } finally {
      setIsLoadingOrgs(false);
    }
  };

  const syncPlanDraftsFromPlans = (latestPlans: Plan[]) => {
    setPlanDrafts(
      Object.fromEntries(
        latestPlans.map((p) => [
          p.id,
          { price: String(p.price), generationLimit: String(p.generationLimit) },
        ])
      )
    );
  };

  useEffect(() => {
    dataService.fetchAllUsersAsync().then((list) => setUsers(list));
    dataService
      .fetchPlansConfig()
      .then((latestPlans) => {
        setPlans(latestPlans);
        syncPlanDraftsFromPlans(latestPlans);
      })
      .catch(() => {});
    if (isSuperAdmin) {
      refreshInvites();
      refreshPlatformSettings();
      refreshOrganizations();
      dataService.fetchAuditLogs().then(setAuditLogs).catch(() => {});
    }
  }, [isSuperAdmin]);

  const refreshAll = () => {
    setUsers(dataService.getUsers());
    dataService.fetchAllUsersAsync().then((list) => setUsers(list));
    setInvoices(dataService.getInvoices());
    setAuditLogs(dataService.getAuditLogs());
    dataService.fetchAuditLogs().then(setAuditLogs).catch(() => {});
    setAccessRules(dataService.getAccessRules());
    dataService
      .fetchPlansConfig()
      .then((latestPlans) => {
        setPlans(latestPlans);
      })
      .catch(() => setPlans(dataService.getPlans()));
    setTools(dataService.getTools());
    setSettings(dataService.getSettings());
    if (isSuperAdmin) {
      refreshInvites();
      refreshPlatformSettings();
      refreshOrganizations();
    }
  };

  const handleSaveOrgSeatLimit = async (org: AdminOrganizationSummary) => {
    const raw = seatLimitEdits[org.id] ?? String(org.seatLimit);
    const parsed = Math.floor(Number(raw));
    if (!Number.isFinite(parsed) || parsed < 1) {
      notify('Seat limit must be a positive integer.');
      return;
    }
    try {
      setSavingSeatOrgId(org.id);
      const updated = await dataService.updateOrgSeatLimitServer(org.id, parsed);
      setSeatLimitEdits((prev) => ({ ...prev, [org.id]: String(updated.seatLimit) }));
      await refreshOrganizations();
      refreshAll();
      notify(`Updated seat limit for ${org.name} to ${updated.seatLimit}`);
    } catch (err: any) {
      notify(`Failed to update seat limit: ${err?.message || 'Unknown error'}`);
    } finally {
      setSavingSeatOrgId(null);
    }
  };

  const handleAdminRemoveOrgMember = async (org: AdminOrganizationSummary, memberId: string, memberName: string) => {
    if (
      !window.confirm(
        `Remove ${memberName} from ${org.name}? They will be reassigned to a new personal Free Starter organization.`
      )
    ) {
      return;
    }
    const actionKey = `${org.id}:${memberId}`;
    try {
      setRemovingOrgMemberKey(actionKey);
      await dataService.removeOrgMemberServer(org.id, memberId);
      await refreshOrganizations();
      refreshAll();
      notify(`Removed ${memberName} from ${org.name}`);
    } catch (err: any) {
      notify(`Failed to remove member: ${err?.message || 'Unknown error'}`);
    } finally {
      setRemovingOrgMemberKey(null);
    }
  };

  const handleToggleInviteOnlyMode = async () => {
    if (!isSuperAdmin || isUpdatingPlatformSettings) return;
    const nextValue = !platformSettings.inviteOnlyMode;
    try {
      setIsUpdatingPlatformSettings(true);
      const updated = await dataService.updatePlatformSettingsServer(nextValue);
      setPlatformSettings(updated);
      onPlatformSettingsChanged?.(updated);
      refreshAll();
      notify(
        nextValue
          ? 'Invite-Only Mode ENABLED: self-account creation and paid plans are disabled.'
          : 'Invite-Only Mode DISABLED: open sign-ups and paid plans are enabled.'
      );
    } catch (err: any) {
      notify(`Failed to update Invite-Only Mode: ${err.message}`);
    } finally {
      setIsUpdatingPlatformSettings(false);
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

  const handleGrantBonus = async (userId: string, amount: number) => {
    try {
      const updated = await dataService.adminUserActionServer(userId, 'grant_bonus', amount);
      refreshAll();
      if (selectedUserDetail?.id === userId && updated) {
        setSelectedUserDetail(updated);
      }
      notify(`Granted +${amount} bonus generations`);
    } catch (err: any) {
      notify(`Failed to grant bonus: ${err.message}`);
    }
  };

  const handleResetUserUsage = async (userId: string) => {
    try {
      const updated = await dataService.adminUserActionServer(userId, 'reset_usage');
      refreshAll();
      if (selectedUserDetail?.id === userId && updated) {
        setSelectedUserDetail(updated);
      }
      notify('Monthly generation usage reset to 0');
    } catch (err: any) {
      notify(`Failed to reset usage: ${err.message}`);
    }
  };

  const handleToggleNonprofitDiscount = async (userId: string, current: boolean) => {
    try {
      const updated = await dataService.adminUserActionServer(userId, 'toggle_discount');
      refreshAll();
      if (selectedUserDetail?.id === userId && updated) {
        setSelectedUserDetail(updated);
      }
      notify(`Nonprofit discount ${!current ? 'Approved (25% off)' : 'Revoked'}`);
    } catch (err: any) {
      notify(`Failed to toggle discount: ${err.message}`);
    }
  };

  const handleToggleSuspend = async (userId: string, currentStatus: 'active' | 'suspended') => {
    const nextStatus = currentStatus === 'active' ? 'suspended' : 'active';
    try {
      const updated = await dataService.adminUserActionServer(userId, 'toggle_status');
      refreshAll();
      if (selectedUserDetail?.id === userId && updated) {
        setSelectedUserDetail(updated);
      }
      notify(`User account marked as ${nextStatus.toUpperCase()}`);
    } catch (err: any) {
      notify(`Failed to update status: ${err.message}`);
    }
  };

  const handleDeleteUser = async (userId: string) => {
    if (window.confirm('Are you sure you want to delete this user and their saved outputs?')) {
      try {
        await dataService.adminUserActionServer(userId, 'delete_user');
        refreshAll();
        setSelectedUserDetail(null);
        notify('User deleted permanently.');
      } catch (err: any) {
        notify(`Failed to delete user: ${err.message}`);
      }
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

  const escapeCsvCell = (value: unknown): string => {
    const raw = value === null || value === undefined ? '' : String(value);
    const safe = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
    return `"${safe.replace(/"/g, '""')}"`;
  };

  const handleExportUsersCSV = async () => {
    if (!isSuperAdmin || isExportingUsersCsv) return;
    try {
      setIsExportingUsersCsv(true);
      const latestUsers = await dataService.fetchAllUsersAsync();
      const exportList = latestUsers.length > 0 ? latestUsers : users;
      if (latestUsers.length > 0) {
        setUsers(latestUsers);
      }

      const headers = [
        'User ID',
        'Name',
        'Email',
        'Organization Name',
        'Organization Type',
        'Plan',
        'Role',
        'Status',
        'Sign-Up Date',
        'Last Active',
        'Monthly Generations Used',
        'Total Tool Generations',
      ];

      const rows = exportList.map((u) => {
        const signupDate = u.signupDate || (u as User & { createdAt?: string }).createdAt || '';
        const totalToolGenerations = u.totalGenerations ?? u.generationsUsedThisMonth ?? 0;
        return [
          escapeCsvCell(u.id),
          escapeCsvCell(u.name || ''),
          escapeCsvCell(u.email || ''),
          escapeCsvCell(u.organizationProfile?.orgName || ''),
          escapeCsvCell(u.organizationProfile?.type || ''),
          escapeCsvCell(u.planId || 'free'),
          escapeCsvCell(u.role || 'member'),
          escapeCsvCell(u.status || 'active'),
          escapeCsvCell(signupDate),
          escapeCsvCell(u.lastLogin || ''),
          escapeCsvCell(u.generationsUsedThisMonth || 0),
          escapeCsvCell(totalToolGenerations),
        ].join(',');
      });

      const csvContent = [headers.map(escapeCsvCell).join(','), ...rows].join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `millennium_users_report_${new Date().toISOString().split('T')[0]}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      notify(`Exported ${exportList.length} users to CSV`);
    } catch (err: any) {
      notify(`Failed to export users CSV: ${err?.message || 'Unknown error'}`);
    } finally {
      setIsExportingUsersCsv(false);
    }
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

  const handleDirectInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail || !inviteName) return;

    try {
      await dataService.createInvite(inviteEmail, `Direct invite for ${inviteName} (${inviteOrgType})`);
      setInviteName('');
      setInviteEmail('');
      await refreshInvites();
      refreshAll();
      notify(`Created complimentary invite for ${inviteEmail}`);
    } catch (err: any) {
      notify(`Failed to invite ${inviteEmail}: ${err.message}`);
    }
  };

  /* =========================================================================
   * PLANS & TOOLS DYNAMIC CONFIG
   * ========================================================================= */
  const hasUnsavedPlanChanges = plans.some((p) => {
    const draft = planDrafts[p.id];
    if (!draft) return false;
    return draft.price !== String(p.price) || draft.generationLimit !== String(p.generationLimit);
  });

  const handlePlanDraftChange = (planId: string, field: 'price' | 'generationLimit', value: string) => {
    setPlansError(null);
    setPlanDrafts((prev) => ({
      ...prev,
      [planId]: {
        price: prev[planId]?.price ?? '0',
        generationLimit: prev[planId]?.generationLimit ?? '50',
        [field]: value,
      },
    }));
  };

  const handleResetPlanDrafts = () => {
    setPlansError(null);
    syncPlanDraftsFromPlans(plans);
  };

  const handleSavePlanSettings = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!isSuperAdmin || isSavingPlans) return;
    setPlansError(null);

    const payload: Array<{ id: string; price: number; generationLimit: number }> = [];
    for (const p of plans) {
      const draft = planDrafts[p.id] || {
        price: String(p.price),
        generationLimit: String(p.generationLimit),
      };
      const parsedPrice = Number(draft.price);
      const parsedLimit = Number(draft.generationLimit);

      if (draft.price.trim() === '' || !Number.isFinite(parsedPrice) || parsedPrice < 0 || parsedPrice > 100000) {
        setPlansError(`Invalid monthly price for "${p.name}". Enter a number between 0 and 100,000.`);
        return;
      }
      if (
        draft.generationLimit.trim() === '' ||
        !Number.isFinite(parsedLimit) ||
        !Number.isInteger(parsedLimit) ||
        parsedLimit < 1 ||
        parsedLimit > 1000000
      ) {
        setPlansError(`Invalid monthly generation limit for "${p.name}". Enter a whole number of at least 1.`);
        return;
      }

      payload.push({
        id: p.id,
        price: Math.round(parsedPrice * 100) / 100,
        generationLimit: parsedLimit,
      });
    }

    try {
      setIsSavingPlans(true);
      const updatedPlans = await dataService.savePlansConfigServer(payload);
      setPlans(updatedPlans);
      syncPlanDraftsFromPlans(updatedPlans);
      refreshAll();
      notify('Plan limits and pricing saved successfully.');
    } catch (err: any) {
      const msg = err?.message || 'Failed to save plan limits and pricing.';
      setPlansError(msg);
      notify(`Failed to save plan settings: ${msg}`);
    } finally {
      setIsSavingPlans(false);
    }
  };

  const handleToggleToolGlobal = (toolId: string, current: boolean) => {
    dataService.updateTool(toolId, { enabledGlobally: !current });
    refreshAll();
    notify(`Tool ${!current ? 'Enabled globally' : 'Disabled globally'}`);
  };


  // Filter users list in real-time by email, organization name, or name
  const filteredUsers = users.filter((u) => {
    if (userPlanFilter !== 'all' && u.planId !== userPlanFilter) return false;
    if (userOrgFilter !== 'all' && u.organizationProfile?.type !== userOrgFilter) return false;
    const q = userSearch.trim().toLowerCase();
    if (q) {
      const matchEmail = (u.email || '').toLowerCase().includes(q);
      const matchOrg = (u.organizationProfile?.orgName || '').toLowerCase().includes(q);
      const matchName = (u.name || '').toLowerCase().includes(q);
      return matchEmail || matchOrg || matchName;
    }
    return true;
  });

  const adminNavGroups: Array<{
    groupLabel: string;
    items: Array<{
      key: AdminTabKey;
      label: string;
      icon: typeof LayoutDashboard;
      meta?: string;
    }>;
  }> = [
    {
      groupLabel: 'Overview',
      items: [{ key: 'dashboard', label: 'Executive Dashboard', icon: LayoutDashboard }],
    },
    {
      groupLabel: 'People & Workspaces',
      items: [
        { key: 'users', label: 'Users', icon: UsersIcon, meta: String(users.length) },
        {
          key: 'organizations',
          label: 'Teams & Orgs',
          icon: Building2,
          meta: String(adminOrganizations.length),
        },
        { key: 'invites', label: 'Invites', icon: Mail, meta: String(invites.length) },
      ],
    },
    {
      groupLabel: 'Billing & Access',
      items: [
        {
          key: 'billing',
          label: 'Billing & Invoices',
          icon: CreditCard,
          meta: invoices.length > 0 ? String(invoices.length) : undefined,
        },
        { key: 'plans', label: 'Plans & Limits', icon: Sliders },
        { key: 'access', label: 'Access Control', icon: ShieldCheck },
      ],
    },
    {
      groupLabel: 'Configuration',
      items: [
        { key: 'tools', label: 'Tools Config', icon: Wrench },
        { key: 'audit', label: 'Audit Trail', icon: FileText },
        { key: 'settings', label: 'Agency Settings', icon: SettingsIcon },
      ],
    },
  ];

  const activeAdminNav =
    adminNavGroups.flatMap((g) => g.items).find((item) => item.key === activeTab) ||
    adminNavGroups[0].items[0];
  const ActiveAdminIcon = activeAdminNav.icon;

  const selectAdminTab = (tabKey: AdminTabKey) => {
    setActiveTab(tabKey);
    setMobileNavOpen(false);
  };

  return (
    <div className="space-y-6 pb-16">
      {/* Admin Top Header */}
      <div className="bg-slate-900 text-white rounded-3xl p-6 sm:p-8 shadow-xl border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2 mb-1.5">
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-rose-500/20 text-rose-300 border border-rose-400/30">
              Agency Operations
            </span>
            {platformSettings.inviteOnlyMode && (
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-amber-500/20 text-amber-300 border border-amber-400/40 inline-flex items-center gap-1">
                <Lock className="w-3 h-3" />
                <span>Invite-Only Mode Active</span>
              </span>
            )}
            <span className="text-xs text-slate-400">
              Admin Portal <span aria-hidden="true">/</span>{' '}
              <strong className="text-slate-200">{activeAdminNav.label}</strong>
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight font-heading">
            Millennium Agency Launchpad Admin
          </h1>
          <p className="text-xs text-slate-300 mt-1 max-w-xl">
            Real-time management of client organizations, generation limits, subscription revenue, and tool access. Signed in as{' '}
            <strong className="text-white">{currentUser.name}</strong>.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          {isSuperAdmin && (
            <button
              type="button"
              onClick={handleExportUsersCSV}
              disabled={isExportingUsersCsv}
              className="px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold flex items-center gap-1.5 transition-colors shadow-xs cursor-pointer disabled:opacity-50 whitespace-nowrap"
              title="Export CSV report of all users, sign-up dates, and total tool generation counts"
            >
              <Download className="w-3.5 h-3.5" />
              <span>{isExportingUsersCsv ? 'Exporting...' : 'Download CSV'}</span>
            </button>
          )}
          <button
            type="button"
            onClick={refreshAll}
            className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1.5 transition-colors border border-slate-700 cursor-pointer whitespace-nowrap"
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
          <button onClick={() => setAdminNotification(null)} className="cursor-pointer">&times;</button>
        </div>
      )}

      {/* Vertical Sidebar + Content Workspace */}
      <div className="flex flex-col lg:flex-row gap-6 items-start">
        {/* Mobile Vertical Section Selector */}
        <div className="w-full lg:hidden">
          <button
            type="button"
            aria-expanded={mobileNavOpen}
            onClick={() => setMobileNavOpen(!mobileNavOpen)}
            className="w-full bg-white border border-slate-200 rounded-2xl px-4 py-3 flex items-center justify-between text-left shadow-xs cursor-pointer"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <ActiveAdminIcon className="w-4 h-4 text-rose-600 shrink-0" />
              <div className="min-w-0">
                <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Admin Section
                </span>
                <span className="block text-sm font-bold text-slate-900 truncate">
                  {activeAdminNav.label}
                </span>
              </div>
            </div>
            <ChevronDown
              className={`w-4 h-4 text-slate-500 transition-transform ${mobileNavOpen ? 'rotate-180' : ''}`}
            />
          </button>

          {mobileNavOpen && (
            <nav
              aria-label="Admin sections"
              className="mt-2 bg-white border border-slate-200 rounded-2xl p-2 shadow-sm space-y-3"
            >
              {adminNavGroups.map((group) => (
                <div key={group.groupLabel} className="space-y-1">
                  <div className="px-3 pt-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    {group.groupLabel}
                  </div>
                  <div className="space-y-0.5">
                    {group.items.map((item) => {
                      const Icon = item.icon;
                      const isActive = activeTab === item.key;
                      return (
                        <button
                          key={item.key}
                          type="button"
                          onClick={() => selectAdminTab(item.key)}
                          className={`w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
                            isActive
                              ? 'bg-slate-900 text-white font-bold'
                              : 'text-slate-700 hover:bg-slate-100/80'
                          }`}
                        >
                          <span className="flex items-center gap-2.5 min-w-0">
                            <Icon
                              className={`w-4 h-4 shrink-0 ${
                                isActive ? 'text-rose-400' : 'text-slate-400'
                              }`}
                            />
                            <span className="truncate">{item.label}</span>
                          </span>
                          {item.meta && (
                            <span
                              className={`text-[10px] font-mono tabular-nums shrink-0 ${
                                isActive ? 'text-slate-200' : 'text-slate-400'
                              }`}
                            >
                              {item.meta}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </nav>
          )}
        </div>

        {/* Desktop Vertical Navigation Sidebar */}
        <aside className="hidden lg:block w-64 shrink-0 sticky top-32">
          <nav
            aria-label="Admin sections"
            className="bg-white rounded-2xl border border-slate-200 p-2.5 shadow-xs space-y-4"
          >
            {adminNavGroups.map((group) => (
              <div key={group.groupLabel} className="space-y-1">
                <div className="px-3 pt-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  {group.groupLabel}
                </div>
                <div className="space-y-0.5">
                  {group.items.map((item) => {
                    const Icon = item.icon;
                    const isActive = activeTab === item.key;
                    return (
                      <button
                        key={item.key}
                        type="button"
                        onClick={() => selectAdminTab(item.key)}
                        className={`w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
                          isActive
                            ? 'bg-slate-900 text-white font-bold'
                            : 'text-slate-700 hover:bg-slate-100/80'
                        }`}
                      >
                        <span className="flex items-center gap-2.5 min-w-0">
                          <Icon
                            className={`w-4 h-4 shrink-0 ${
                              isActive ? 'text-rose-400' : 'text-slate-400'
                            }`}
                          />
                          <span className="truncate">{item.label}</span>
                        </span>
                        {item.meta && (
                          <span
                            className={`text-[10px] font-mono tabular-nums shrink-0 ${
                              isActive ? 'text-slate-200' : 'text-slate-400'
                            }`}
                          >
                            {item.meta}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>
        </aside>

        {/* Main Content Column */}
        <div className="flex-1 min-w-0 w-full space-y-6">

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
                <div className="flex items-center gap-3">
                  <span className="text-[10px] font-semibold text-emerald-600 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block"></span>
                    Real-time
                  </span>
                  <button
                    type="button"
                    onClick={() => selectAdminTab('audit')}
                    className="text-[11px] font-bold text-rose-600 hover:text-rose-700 inline-flex items-center gap-1 cursor-pointer"
                  >
                    <span>Full Audit Trail</span>
                    <ArrowRight className="w-3 h-3" />
                  </button>
                </div>
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
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <h3 className="text-sm font-bold text-slate-900">
                  Client Segmentation
                </h3>
                <button
                  type="button"
                  onClick={() => selectAdminTab('users')}
                  className="text-[11px] font-bold text-rose-600 hover:text-rose-700 inline-flex items-center gap-1 cursor-pointer"
                >
                  <span>View All Users</span>
                  <ArrowRight className="w-3 h-3" />
                </button>
              </div>

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
            <div className="flex items-center gap-3 w-full sm:w-auto flex-1">
              <div className="relative w-full sm:w-80">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  aria-label="Filter users by email or organization name"
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  placeholder="Filter by email or organization name..."
                  className="w-full pl-9 pr-8 py-1.5 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-rose-500"
                />
                {userSearch && (
                  <button
                    type="button"
                    aria-label="Clear user search"
                    onClick={() => setUserSearch('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              <span className="text-[11px] font-medium text-slate-500 whitespace-nowrap hidden md:inline">
                {filteredUsers.length} of {users.length} users
              </span>
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
                        <div>{u.role}</div>
                        <div className="text-[10px] text-slate-400">org: {u.orgRole || 'owner'}</div>
                      </td>

                      <td className="py-3 px-4 font-mono text-[11px] text-slate-500 whitespace-nowrap">
                        {new Date(u.lastLogin).toLocaleDateString()}
                      </td>

                      <td className="py-3 px-4 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={() => setSelectedUserDetail(u)}
                          className="px-3 py-1 border border-slate-200 bg-white hover:bg-slate-100 rounded-lg text-[11px] font-semibold text-slate-700 cursor-pointer"
                        >
                          Manage
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {filteredUsers.length === 0 && (
                  <tr>
                    <td colSpan={8} className="py-10 px-4 text-center text-xs text-slate-500">
                      <p className="font-semibold text-slate-700">No matching users found</p>
                      <p className="text-[11px] text-slate-400 mt-1">
                        Try adjusting your email or organization filter.
                      </p>
                      {(userSearch || userPlanFilter !== 'all' || userOrgFilter !== 'all') && (
                        <button
                          type="button"
                          onClick={() => {
                            setUserSearch('');
                            setUserPlanFilter('all');
                            setUserOrgFilter('all');
                          }}
                          className="mt-3 px-3 py-1.5 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 font-semibold cursor-pointer"
                        >
                          Clear Filters
                        </button>
                      )}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* =====================================================================
       * TAB: TEAMS & ORGANIZATIONS MANAGEMENT (SUPER ADMIN)
       * ===================================================================== */}
      {activeTab === 'organizations' && (
        <div className="space-y-5">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="relative w-full sm:w-80">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={orgSearch}
                onChange={(e) => setOrgSearch(e.target.value)}
                placeholder="Search organizations or member emails..."
                className="w-full pl-9 pr-8 py-1.5 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-rose-500"
              />
              {orgSearch && (
                <button
                  type="button"
                  onClick={() => setOrgSearch('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <div className="flex items-center gap-3">
              <span className="text-xs text-slate-500 font-medium">
                {adminOrganizations.length} organizations
              </span>
              <button
                type="button"
                onClick={refreshOrganizations}
                disabled={isLoadingOrgs}
                className="px-3 py-1.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-xs font-semibold text-slate-700 flex items-center gap-1.5 cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoadingOrgs ? 'animate-spin' : ''}`} />
                <span>Refresh Orgs</span>
              </button>
            </div>
          </div>

          {adminOrganizations
            .filter((org) => {
              const q = orgSearch.trim().toLowerCase();
              if (!q) return true;
              const matchOrg =
                (org.name || '').toLowerCase().includes(q) ||
                (org.id || '').toLowerCase().includes(q) ||
                (org.planId || '').toLowerCase().includes(q);
              const matchMember = org.members.some(
                (m) =>
                  (m.email || '').toLowerCase().includes(q) ||
                  (m.name || '').toLowerCase().includes(q)
              );
              return matchOrg || matchMember;
            })
            .map((org) => {
              const orgPlan = plans.find((p) => p.id === org.planId);
              const orgQuotaLimit = (orgPlan?.generationLimit || 50) + (org.bonusGenerations || 0);
              const editValue = seatLimitEdits[org.id] ?? String(org.seatLimit);
              const isSavingSeat = savingSeatOrgId === org.id;

              return (
                <div
                  key={org.id}
                  className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden"
                >
                  <div className="p-5 border-b border-slate-100 flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-slate-50/50">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-sm font-bold text-slate-900">{org.name}</h3>
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase bg-rose-50 text-rose-800 border border-rose-200">
                          {orgPlan?.name || org.planId}
                        </span>
                        {org.type && (
                          <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                            {org.type}
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-500 font-mono">
                        <span>ID: {org.id}</span>
                        <span>·</span>
                        <span>
                          Quota: {org.generationsUsedThisMonth} / {orgQuotaLimit}
                        </span>
                        <span>·</span>
                        <span>
                          Seats: {org.seatsUsed} / {org.seatLimit} ({org.members.length} active,{' '}
                          {org.pendingInvitesCount} pending)
                        </span>
                      </div>
                    </div>

                    {/* Seat Limit Override */}
                    <div className="flex items-center gap-2">
                      <label className="text-[11px] font-bold text-slate-600 whitespace-nowrap">
                        Seat Limit:
                      </label>
                      <input
                        type="number"
                        min={Math.max(1, org.members.length)}
                        max={500}
                        value={editValue}
                        onChange={(e) =>
                          setSeatLimitEdits((prev) => ({ ...prev, [org.id]: e.target.value }))
                        }
                        className="w-20 px-2.5 py-1.5 text-xs font-mono font-bold rounded-xl border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-rose-500"
                      />
                      <button
                        type="button"
                        disabled={isSavingSeat || Number(editValue) === org.seatLimit}
                        onClick={() => handleSaveOrgSeatLimit(org)}
                        className="px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 disabled:opacity-40 text-white text-xs font-bold cursor-pointer"
                      >
                        {isSavingSeat ? 'Saving...' : 'Save Limit'}
                      </button>
                    </div>
                  </div>

                  {/* Organization Members Table */}
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-white text-slate-400 uppercase text-[10px] font-bold border-b border-slate-100">
                        <tr>
                          <th className="py-2 px-5">Member</th>
                          <th className="py-2 px-4">Org Role</th>
                          <th className="py-2 px-4">Usage (Month)</th>
                          <th className="py-2 px-4">Total Gens</th>
                          <th className="py-2 px-4">Last Active</th>
                          <th className="py-2 px-5 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {org.members.map((m) => {
                          const isOrgOwner = m.orgRole === 'owner' || org.ownerId === m.id;
                          const isRemoving = removingOrgMemberKey === `${org.id}:${m.id}`;
                          return (
                            <tr key={m.id} className="hover:bg-slate-50/70">
                              <td className="py-2.5 px-5">
                                <div className="font-semibold text-slate-900">{m.name}</div>
                                <div className="text-[11px] text-slate-500 font-mono">{m.email}</div>
                              </td>
                              <td className="py-2.5 px-4">
                                <span
                                  className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase ${
                                    isOrgOwner
                                      ? 'bg-rose-50 text-rose-800 border border-rose-200'
                                      : 'bg-slate-100 text-slate-700'
                                  }`}
                                >
                                  {isOrgOwner ? 'Owner' : 'Member'}
                                </span>
                              </td>
                              <td className="py-2.5 px-4 font-mono font-bold text-slate-800">
                                {m.generationsUsedThisMonth || 0}
                              </td>
                              <td className="py-2.5 px-4 font-mono text-slate-600">
                                {m.totalGenerations ?? m.generationsUsedThisMonth ?? 0}
                              </td>
                              <td className="py-2.5 px-4 font-mono text-[11px] text-slate-500">
                                {m.lastLogin ? new Date(m.lastLogin).toLocaleDateString() : '—'}
                              </td>
                              <td className="py-2.5 px-5 text-right">
                                {isOrgOwner ? (
                                  <span className="text-[11px] text-slate-400">Owner</span>
                                ) : (
                                  <button
                                    type="button"
                                    disabled={isRemoving}
                                    onClick={() => handleAdminRemoveOrgMember(org, m.id, m.name)}
                                    className="px-2.5 py-1 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-[11px] font-semibold inline-flex items-center gap-1 cursor-pointer disabled:opacity-50"
                                  >
                                    <UserMinus className="w-3 h-3" />
                                    <span>{isRemoving ? 'Removing...' : 'Remove'}</span>
                                  </button>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                        {org.members.length === 0 && (
                          <tr>
                            <td colSpan={6} className="py-6 px-5 text-center text-xs text-slate-400">
                              No active members found in this organization.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })}

          {adminOrganizations.length === 0 && !isLoadingOrgs && (
            <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center text-xs text-slate-500">
              No organizations found yet.
            </div>
          )}
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
              {/* Plan & Usage Management */}
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold text-slate-800 uppercase tracking-wide text-[10px]">
                    Subscription Plan & Quota
                  </span>
                  {platformSettings.inviteOnlyMode && (
                    <span className="text-[10px] font-semibold text-amber-800 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-md">
                      Paid plans disabled in Invite-Only Mode
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {(['free', 'pro', 'team', 'complimentary'] as const).map((pId) => {
                    const isPaidDisabled = platformSettings.inviteOnlyMode && (pId === 'pro' || pId === 'team');
                    return (
                      <button
                        key={pId}
                        disabled={isPaidDisabled}
                        onClick={() => handleUpdateUserPlan(selectedUserDetail.id, pId)}
                        className={`p-2.5 rounded-xl border text-center transition-all ${
                          isPaidDisabled
                            ? 'border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed opacity-70'
                            : selectedUserDetail.planId === pId
                            ? 'border-rose-600 bg-rose-50 text-rose-900 font-bold ring-1 ring-rose-600'
                            : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        <div className="capitalize truncate text-[11px] font-bold">{pId}</div>
                        <div className="text-[10px] text-slate-400">
                          {isPaidDisabled
                            ? 'Disabled'
                            : pId === 'free'
                            ? '50/mo'
                            : pId === 'pro'
                            ? '500/mo'
                            : '2000/mo'}
                        </div>
                      </button>
                    );
                  })}
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

              {/* Team Memberships */}
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-800 text-[11px] uppercase tracking-wide">
                    Team Memberships
                  </span>
                  {isSuperAdmin && (
                    <button
                      type="button"
                      onClick={refreshOrganizations}
                      className="text-[11px] text-rose-600 hover:text-rose-800 font-semibold"
                    >
                      Refresh
                    </button>
                  )}
                </div>

                {(() => {
                  const uid = selectedUserDetail.id;
                  const personalId = `org_${uid}`;
                  const userTeams = adminOrganizations.filter(
                    (org) =>
                      org.ownerId === uid ||
                      (Array.isArray(org.memberIds) && org.memberIds.includes(uid)) ||
                      (Array.isArray(selectedUserDetail.organizationIds) &&
                        selectedUserDetail.organizationIds.includes(org.id))
                  );
                  if (userTeams.length === 0) {
                    return (
                      <p className="text-[11px] text-slate-500">
                        Active workspace:{' '}
                        <span className="font-mono font-semibold text-slate-700">
                          {selectedUserDetail.organizationId || personalId}
                        </span>{' '}
                        ({selectedUserDetail.orgRole || 'owner'})
                      </p>
                    );
                  }
                  return (
                    <div className="space-y-1.5">
                      {userTeams.map((org) => {
                        const isPersonal = org.id === personalId;
                        const isActive = org.id === selectedUserDetail.organizationId;
                        const roleInTeam =
                          org.memberRoles?.[uid] || (org.ownerId === uid ? 'owner' : 'member');
                        return (
                          <div
                            key={org.id}
                            className="p-2.5 rounded-lg bg-white border border-slate-200 flex items-center justify-between gap-2"
                          >
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className="font-bold text-slate-900 truncate">{org.name}</span>
                                {isPersonal && (
                                  <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase bg-slate-100 text-slate-600 border border-slate-200">
                                    Personal
                                  </span>
                                )}
                                {isActive && (
                                  <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase bg-emerald-50 text-emerald-700 border border-emerald-200">
                                    Active
                                  </span>
                                )}
                              </div>
                              <div className="text-[10px] text-slate-500 font-mono truncate">
                                {org.id} · {org.planId} plan
                              </div>
                            </div>
                            <span
                              className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase shrink-0 ${
                                roleInTeam === 'owner'
                                  ? 'bg-rose-50 text-rose-800 border border-rose-200'
                                  : 'bg-slate-100 text-slate-700 border border-slate-200'
                              }`}
                            >
                              {roleInTeam}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
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
          {/* Invite-Only Mode Control Card */}
          <div
            className={`rounded-2xl border shadow-sm p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
              platformSettings.inviteOnlyMode
                ? 'bg-amber-50/70 border-amber-200'
                : 'bg-white border-slate-200'
            }`}
          >
            <div className="flex items-start gap-3">
              <div
                className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border ${
                  platformSettings.inviteOnlyMode
                    ? 'bg-amber-100 text-amber-800 border-amber-300'
                    : 'bg-slate-100 text-slate-600 border-slate-200'
                }`}
              >
                <Lock className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-sm font-bold text-slate-900">Invite-Only Mode</h3>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider border ${
                      platformSettings.inviteOnlyMode
                        ? 'bg-amber-100 text-amber-900 border-amber-300'
                        : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                    }`}
                  >
                    {platformSettings.inviteOnlyMode ? 'Enabled' : 'Disabled'}
                  </span>
                </div>
                <p className="text-xs text-slate-600 max-w-2xl leading-relaxed">
                  {platformSettings.inviteOnlyMode
                    ? 'Self-account creation and paid plans (Pro & Team) are disabled. Only existing accounts, super admins, and users with a valid complimentary invite can join.'
                    : 'Open sign-ups are enabled. Enable Invite-Only Mode to block self-account creation for uninvited users and disable all paid plans.'}
                </p>
              </div>
            </div>

            {isSuperAdmin && (
              <button
                type="button"
                onClick={handleToggleInviteOnlyMode}
                disabled={isUpdatingPlatformSettings}
                className={`px-4 py-2.5 rounded-xl text-xs font-bold shrink-0 transition-all cursor-pointer disabled:opacity-50 ${
                  platformSettings.inviteOnlyMode
                    ? 'bg-white hover:bg-slate-50 text-slate-900 border border-slate-300 shadow-xs'
                    : 'bg-slate-900 hover:bg-slate-800 text-white shadow-xs'
                }`}
              >
                {isUpdatingPlatformSettings
                  ? 'Updating...'
                  : platformSettings.inviteOnlyMode
                  ? 'Disable Invite-Only Mode'
                  : 'Enable Invite-Only Mode'}
              </button>
            )}
          </div>

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
        <form
          onSubmit={handleSavePlanSettings}
          className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-6"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-slate-900">Dynamic Plan Limits & Pricing</h3>
                {hasUnsavedPlanChanges && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-200">
                    Unsaved Changes
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500">
                Modify tier prices and monthly generation quotas on the fly, then save to persist across the platform.
              </p>
            </div>

            {isSuperAdmin && (
              <div className="flex items-center gap-2 shrink-0">
                {hasUnsavedPlanChanges && (
                  <button
                    type="button"
                    onClick={handleResetPlanDrafts}
                    disabled={isSavingPlans}
                    className="px-3 py-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold cursor-pointer disabled:opacity-50"
                  >
                    Discard
                  </button>
                )}
                <button
                  type="submit"
                  disabled={isSavingPlans || !hasUnsavedPlanChanges}
                  className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-xs cursor-pointer disabled:opacity-50 transition-colors"
                >
                  {isSavingPlans ? (
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <Save className="w-3.5 h-3.5" />
                  )}
                  <span>{isSavingPlans ? 'Saving...' : 'Save Plan Settings'}</span>
                </button>
              </div>
            )}
          </div>

          {platformSettings.inviteOnlyMode && (
            <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 flex items-center gap-2">
              <Lock className="w-4 h-4 text-amber-600 shrink-0" />
              <span>
                <strong>Invite-Only Mode Active:</strong> Paid plans (Pro Growth &amp; Agency Team) are disabled across the platform.
              </span>
            </div>
          )}

          {plansError && (
            <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{plansError}</span>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
            {plans.map((p) => {
              const isPaidPlanDisabled = platformSettings.inviteOnlyMode && (p.id === 'pro' || p.id === 'team');
              const draft = planDrafts[p.id] || {
                price: String(p.price),
                generationLimit: String(p.generationLimit),
              };
              const draftPriceNum = Number(draft.price);
              const previewNonprofitPrice =
                Number.isFinite(draftPriceNum) && draftPriceNum >= 0
                  ? Math.round(draftPriceNum * 0.75 * 100) / 100
                  : p.priceNonprofit;

              return (
                <div
                  key={p.id}
                  className={`p-5 rounded-2xl border space-y-4 ${
                    isPaidPlanDisabled
                      ? 'border-slate-200 bg-slate-100/70 opacity-75'
                      : 'border-slate-200 bg-slate-50/50'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <h4 className="font-bold text-slate-900 text-sm">{p.name}</h4>
                    <div className="flex items-center gap-1.5">
                      {isPaidPlanDisabled && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-100 text-amber-900 border border-amber-200">
                          Disabled
                        </span>
                      )}
                      <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-slate-200 text-slate-700">
                        {p.id}
                      </span>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">
                      Standard Monthly Price ($ USD)
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      disabled={isPaidPlanDisabled || isReadOnlySupport}
                      value={draft.price}
                      onChange={(e) => handlePlanDraftChange(p.id, 'price', e.target.value)}
                      className="w-full px-3 py-1.5 text-xs font-mono font-bold rounded-lg border border-slate-300 bg-white disabled:bg-slate-100 disabled:text-slate-400 focus:outline-none focus:ring-2 focus:ring-rose-500"
                    />
                    <span className="text-[10px] text-slate-400 mt-0.5 block">
                      Nonprofit 25% discount price: ${previewNonprofitPrice}
                    </span>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">
                      Monthly Generation Limit
                    </label>
                    <input
                      type="number"
                      min="1"
                      step="1"
                      disabled={isPaidPlanDisabled || isReadOnlySupport}
                      value={draft.generationLimit}
                      onChange={(e) => handlePlanDraftChange(p.id, 'generationLimit', e.target.value)}
                      className="w-full px-3 py-1.5 text-xs font-mono font-bold rounded-lg border border-slate-300 bg-white disabled:bg-slate-100 disabled:text-slate-400 focus:outline-none focus:ring-2 focus:ring-rose-500"
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
              );
            })}
          </div>

          {isSuperAdmin && (
            <div className="pt-4 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <span className="text-xs text-slate-500">
                {hasUnsavedPlanChanges
                  ? 'You have unsaved changes to plan limits or pricing.'
                  : 'All plan limits and pricing changes are saved.'}
              </span>
              <div className="flex items-center gap-2 justify-end">
                {hasUnsavedPlanChanges && (
                  <button
                    type="button"
                    onClick={handleResetPlanDrafts}
                    disabled={isSavingPlans}
                    className="px-4 py-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold cursor-pointer disabled:opacity-50"
                  >
                    Discard Changes
                  </button>
                )}
                <button
                  type="submit"
                  disabled={isSavingPlans || !hasUnsavedPlanChanges}
                  className="px-5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold flex items-center gap-1.5 shadow-xs cursor-pointer disabled:opacity-50 transition-colors"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>{isSavingPlans ? 'Saving...' : 'Save Plan Settings'}</span>
                </button>
              </div>
            </div>
          )}
        </form>
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

            {/* Platform Access Control: Invite-Only Mode */}
            <div
              className={`p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                platformSettings.inviteOnlyMode
                  ? 'bg-amber-50 border-amber-200'
                  : 'bg-slate-50 border-slate-200'
              }`}
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Lock className="w-4 h-4 text-slate-700" />
                  <span className="font-bold text-slate-900">Invite-Only Mode</span>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                      platformSettings.inviteOnlyMode
                        ? 'bg-amber-200 text-amber-950'
                        : 'bg-slate-200 text-slate-700'
                    }`}
                  >
                    {platformSettings.inviteOnlyMode ? 'Active' : 'Off'}
                  </span>
                </div>
                <p className="text-[11px] text-slate-600">
                  Disables self-account creation and paid plans (Pro &amp; Team) across the server and UI.
                </p>
              </div>
              {isSuperAdmin && (
                <button
                  type="button"
                  onClick={handleToggleInviteOnlyMode}
                  disabled={isUpdatingPlatformSettings}
                  className="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold shrink-0 cursor-pointer disabled:opacity-50"
                >
                  {isUpdatingPlatformSettings
                    ? 'Updating...'
                    : platformSettings.inviteOnlyMode
                    ? 'Disable'
                    : 'Enable'}
                </button>
              )}
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
      </div>
    </div>
  );
};
