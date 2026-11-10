import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
} from 'firebase/firestore';
import { db, auth, handleFirestoreError, OperationType } from '../firebase';
import {
  User,
  OrganizationProfile,
  SavedOutput,
  Invoice,
  AuditLogEntry,
  AccessRule,
  Plan,
  ToolDefinition,
  AgencySettings,
} from '../types';

/**
 * Calculates the first day of next month based on today's date (YYYY-MM-01).
 */
export function getNextMonthFirstDay(fromDate: Date = new Date()): string {
  const year = fromDate.getFullYear();
  const month = fromDate.getMonth();
  const nextMonth = new Date(year, month + 1, 1);
  const y = nextMonth.getFullYear();
  const m = String(nextMonth.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}-01`;
}

// Official Millennium Agency Launchpad Plans
export const INITIAL_PLANS: Plan[] = [
  {
    id: 'free',
    name: 'Free Starter',
    price: 0,
    priceNonprofit: 0,
    generationLimit: 50,
    description: 'Essential marketing tools for bootstrapping your mission.',
    features: [
      '50 AI generations per month',
      'All 8 core marketing & strategy tools',
      'Standard generation speed',
      'Saved outputs library',
      'Millennium Agency marketing guides',
    ],
  },
  {
    id: 'pro',
    name: 'Pro Growth',
    price: 49,
    priceNonprofit: 36.75,
    generationLimit: 500,
    popular: true,
    description: 'Empower active marketing campaigns with high-volume generation.',
    features: [
      '500 AI generations per month',
      'Priority generation processing',
      'Unlimited library storage & exports (.docx, text)',
      'Custom brand tone memory',
      'Direct review request with Millennium Agency',
      '25% Nonprofit discount eligible',
    ],
  },
  {
    id: 'team',
    name: 'Agency Team',
    price: 149,
    priceNonprofit: 111.75,
    generationLimit: 2000,
    description: 'Collaborative marketing suite for growing teams and organizations.',
    features: [
      '2,000 AI generations per month',
      'Up to 5 team seats with shared workspace',
      'Shared organization library & brand asset repository',
      'Team usage analytics & seat management',
      'Dedicated quarterly strategy check-in with Millennium Agency',
      '25% Nonprofit discount eligible',
    ],
  },
];

// Official Marketing Tools
export const INITIAL_TOOLS: ToolDefinition[] = [
  {
    id: 'brand-foundations',
    name: 'Brand Foundations',
    category: 'Strategy',
    description: 'Develop a rock-solid mission, strategic positioning statement, value proposition, and 3 audience personas.',
    whyThisMatters: 'Clear positioning saves thousands in wasted marketing spend and aligns your team on what makes you irreplaceable.',
    enabledGlobally: true,
    minPlanRequired: 'free',
    fields: [
      {
        key: 'primaryMissionFocus',
        label: 'Primary Mission / Core Differentiator',
        type: 'textarea',
        placeholder: 'What is the single most important change you want to make in the world or for your customers?',
        required: true,
      },
      {
        key: 'primaryCompetitorOrAlternative',
        label: 'Current Alternative or Competitor',
        type: 'text',
        placeholder: 'What do people use or do right now if they do not work with you?',
        required: true,
      },
    ],
  },
  {
    id: 'messaging-builder',
    name: 'Messaging Builder',
    category: 'Content',
    description: 'Generate tagline options, timed elevator pitches (15s, 30s, 60s), and 3 core messaging pillars with proof points.',
    whyThisMatters: 'Equips your team, board, and partners to speak with one unified, punchy, memorable voice.',
    enabledGlobally: true,
    minPlanRequired: 'free',
    fields: [
      {
        key: 'focusArea',
        label: 'Primary Campaign / Focus Theme',
        type: 'text',
        placeholder: 'e.g., General brand introduction, Q1 fundraising sprint, new product beta launch',
        required: true,
      },
      {
        key: 'desiredReaction',
        label: 'What should listeners think or feel immediately?',
        type: 'text',
        placeholder: 'e.g., "This changes everything", "Where do I sign up?", "I trust this team"',
        required: false,
      },
    ],
  },
  {
    id: '90-day-plan',
    name: '90-Day Marketing Plan',
    category: 'Strategy',
    description: 'A structured, week-by-week marketing plan matched to your goals and budget, prioritizing high-impact low-cost channels.',
    whyThisMatters: 'Eliminates marketing paralysis by giving your team exactly 3 high-priority tasks to focus on every week.',
    enabledGlobally: true,
    minPlanRequired: 'free',
    fields: [
      {
        key: 'primaryQuarterGoal',
        label: 'Single Most Critical Milestone for Next 90 Days',
        type: 'text',
        placeholder: 'e.g., Acquire 50 beta users, raise $25,000 for scholarship fund, sign 3 enterprise pilots',
        required: true,
      },
      {
        key: 'weeklyHoursDedicated',
        label: 'Weekly Team Hours Dedicated to Marketing',
        type: 'select',
        options: ['2-5 hours/week (Solo Founder)', '5-10 hours/week (Lean Team)', '15+ hours/week (Dedicated Team)'],
        required: true,
      },
    ],
  },
  {
    id: 'social-generator',
    name: 'Social Post Generator',
    category: 'Social',
    description: 'Craft tailored, high-converting posts for LinkedIn, Instagram, Facebook, and X, plus a 4-week content calendar.',
    whyThisMatters: 'Builds organic community traction and executive thought leadership without spending thousands on paid ads.',
    enabledGlobally: true,
    minPlanRequired: 'free',
    fields: [
      {
        key: 'contentTopic',
        label: 'What story, milestone, or topic do you want to share?',
        type: 'textarea',
        placeholder: 'e.g., Behind-the-scenes look at our product build, a client breakthrough story, an industry insight',
        required: true,
      },
      {
        key: 'callToAction',
        label: 'Desired Call-to-Action',
        type: 'text',
        placeholder: 'e.g., Share your thoughts in comments, sign up for early access, share with a founder friend',
        required: true,
      },
    ],
  },
  {
    id: 'email-writer',
    name: 'Email Writer',
    category: 'Content',
    description: 'Draft compelling newsletters, welcome sequences, and announcement campaigns with optimized subject line variants.',
    whyThisMatters: 'Email generates the highest direct ROI of any digital channel and provides an owned audience you control.',
    enabledGlobally: true,
    minPlanRequired: 'free',
    fields: [
      {
        key: 'emailType',
        label: 'Campaign Type',
        type: 'select',
        options: [
          '3-Part Welcome Sequence',
          'Monthly Community Newsletter',
          'Urgent Campaign / Launch Announcement',
          'Re-engagement / Check-In Note',
        ],
        required: true,
      },
      {
        key: 'keyAnnouncement',
        label: 'Core Announcement or Value Offering',
        type: 'textarea',
        placeholder: 'What are you announcing or sharing in this email sequence?',
        required: true,
      },
    ],
  },
  {
    id: 'website-copy',
    name: 'Website Copy Builder',
    category: 'Content',
    description: 'Complete high-converting website copy for Homepage, About Us, and Services/Programs with SEO meta descriptions.',
    whyThisMatters: 'Turns passive website visitors into active supporters, qualified leads, and brand believers.',
    enabledGlobally: true,
    minPlanRequired: 'free',
    fields: [
      {
        key: 'pageType',
        label: 'Page Copy to Generate',
        type: 'select',
        options: ['Homepage Hero & Value Pillars', 'About Us & Founder Story', 'Services / Programs Breakdown'],
        required: true,
      },
      {
        key: 'primaryConversionGoal',
        label: 'Primary Button / Conversion Goal',
        type: 'text',
        placeholder: 'e.g., "Schedule Discovery Call", "Apply for Fellowship", "Start Free Trial"',
        required: true,
      },
    ],
  },
  {
    id: 'donor-appeal',
    name: 'Donor Appeal & Grant Helper',
    category: 'Specialized',
    forOrgType: 'Nonprofit',
    description: 'Craft heartfelt fundraising letters, seasonal donor appeals, and compelling executive grant summaries.',
    whyThisMatters: 'Nonprofits need emotionally compelling narratives backed by measurable impact data to secure crucial funding.',
    enabledGlobally: true,
    minPlanRequired: 'free',
    fields: [
      {
        key: 'campaignName',
        label: 'Campaign or Grant Initiative Name',
        type: 'text',
        placeholder: 'e.g., 2026 Clean Waters Initiative, Annual Winter Gala Appeal',
        required: true,
      },
      {
        key: 'fundingTarget',
        label: 'Target Funding Amount & Use of Funds',
        type: 'text',
        placeholder: 'e.g., $15,000 to equip 3 community science labs with water testing kits',
        required: true,
      },
      {
        key: 'humanImpactStory',
        label: 'Human Story or Specific Community Impact',
        type: 'textarea',
        placeholder: 'Describe a specific person or community who benefits directly from this program',
        required: true,
      },
    ],
  },
  {
    id: 'pitch-launch',
    name: 'Pitch & Launch Helper',
    category: 'Specialized',
    forOrgType: 'Startup',
    description: 'Generate 10-slide investor pitch flows, Product Hunt launch copy, and executive summary narratives.',
    whyThisMatters: 'Founders must articulate acute market pain, defensible moats, and massive opportunity in under 2 minutes.',
    enabledGlobally: true,
    minPlanRequired: 'free',
    fields: [
      {
        key: 'tractionMilestones',
        label: 'Key Milestones & Traction to Highlight',
        type: 'textarea',
        placeholder: 'e.g., 500 waitlist users, $12k ARR, 3 LOIs from mid-market retailers, MVP live in testing',
        required: true,
      },
      {
        key: 'theAsk',
        label: 'The Capital Ask or Launch Goal',
        type: 'text',
        placeholder: 'e.g., Raising $750k Seed Round to expand engineering, launching publicly on Product Hunt',
        required: true,
      },
    ],
  },
  {
    id: 'keywords-content',
    name: 'Keywords & Content Ideas',
    category: 'SEO',
    description: '20 high-intent keywords categorized by search intent plus 10 engaging blog and newsletter article titles.',
    whyThisMatters: 'Establishes organic authority in Google search results and ensures you never run out of relevant content topics.',
    enabledGlobally: true,
    minPlanRequired: 'free',
    fields: [
      {
        key: 'primarySearchTopic',
        label: 'Core Search Topic or Service Category',
        type: 'text',
        placeholder: 'e.g., Nonprofit donor management, supply chain anomaly detection, sustainable packaging',
        required: true,
      },
      {
        key: 'geographicFocus',
        label: 'Geographic Scope',
        type: 'select',
        options: ['Global / Nationwide (Digital)', 'Regional / State-Level', 'Local Community Specific'],
        required: false,
      },
    ],
  },
];

export const INITIAL_SETTINGS: AgencySettings = {
  agencyName: 'Millennium Agency',
  supportEmail: 'launchpad@mill.agency',
  calendlyUrl: 'https://calendly.com/lindafanaras/linkedin-intro',
  agencyWebsiteUrl: 'https://mill.agency',
  freeTierLimit: 50,
  proTierLimit: 500,
  teamTierLimit: 2000,
  nonprofitDiscountPercent: 25,
};

class DataService {
  // In-memory caches to guarantee synchronous component reactivity
  private cachedUsers: Map<string, User> = new Map();
  private cachedOutputs: SavedOutput[] = [];
  private cachedLogs: AuditLogEntry[] = [];
  private cachedInvoices: Invoice[] = [];

  constructor() {
    this.refreshLocalCache();
  }

  private async refreshLocalCache(): Promise<void> {
    if (typeof window === 'undefined') return;
    try {
      if (auth.currentUser) {
        await Promise.allSettled([
          this.fetchUser(auth.currentUser.uid),
          this.fetchOutputs(),
          this.fetchAuditLogs(),
        ]);
      }
    } catch {
      // Background cache refresh
    }
  }

  /* =========================================================================
   * USERS CRUD (Firestore Collection: /users/{userId})
   * ========================================================================= */
  public async fetchUser(userId: string): Promise<User | null> {
    const path = `users/${userId}`;
    try {
      const snap = await getDoc(doc(db, 'users', userId));
      if (snap.exists()) {
        const u = snap.data() as User;
        this.cachedUsers.set(userId, u);
        return u;
      }
      return null;
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, path);
    }
  }

  public getUserById(id: string): User | null {
    if (this.cachedUsers.has(id)) {
      return this.cachedUsers.get(id)!;
    }
    // Asynchronously fetch in background
    this.fetchUser(id).catch(() => {});
    return null;
  }

  public getUserByEmail(email: string): User | null {
    for (const u of this.cachedUsers.values()) {
      if (u.email?.toLowerCase() === email.toLowerCase()) {
        return u;
      }
    }
    return null;
  }

  public getUsers(): User[] {
    // Return cached users for immediate display
    const list = Array.from(this.cachedUsers.values());
    // Trigger async fetch of all users (for super admin) in background
    this.fetchAllUsersAsync().catch(() => {});
    return list;
  }

  public async fetchAllUsersAsync(): Promise<User[]> {
    const path = 'users';
    try {
      const snap = await getDocs(collection(db, path));
      const list: User[] = [];
      snap.forEach((d) => {
        const u = d.data() as User;
        list.push(u);
        this.cachedUsers.set(u.id, u);
      });
      return list;
    } catch {
      // Non-admins will get permission denied on list, which is expected by rules
      return Array.from(this.cachedUsers.values());
    }
  }

  public createUser(userData: Partial<User> & { email: string; name: string }): User {
    const id = auth.currentUser?.uid || `user_${Date.now()}`;
    const newUser: User = {
      id,
      name: userData.name,
      email: userData.email,
      avatar:
        userData.avatar ||
        `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(userData.name)}&backgroundColor=0f172a,e11d48`,
      role: userData.role || 'member',
      planId: userData.planId || 'free',
      status: 'active',
      signupDate: new Date().toISOString(),
      lastLogin: new Date().toISOString(),
      generationsUsedThisMonth: 0,
      bonusGenerations: 0,
      billingResetDate: getNextMonthFirstDay(),
      nonprofitDiscountApproved: false,
      organizationProfile: userData.organizationProfile,
      organizationId: userData.organizationId || (userData.organizationProfile ? `org_${id}` : undefined),
    };

    this.cachedUsers.set(id, newUser);
    this.persistUser(newUser);
    return newUser;
  }

  public updateUser(id: string, updates: Partial<User>): User | null {
    const current = this.cachedUsers.get(id) || { id } as User;
    const updated: User = { ...current, ...updates };
    this.cachedUsers.set(id, updated);
    this.persistUser(updated);
    return updated;
  }

  public async persistUser(user: User): Promise<void> {
    const path = `users/${user.id}`;
    try {
      await setDoc(doc(db, 'users', user.id), user, { merge: true });
      // If organization profile is present, also persist to organizations collection
      if (user.organizationProfile && user.organizationId) {
        await this.saveOrganization({
          id: user.organizationId,
          name: user.organizationProfile.orgName,
          ownerId: user.id,
          memberIds: [user.id],
          type: user.organizationProfile.type,
          whatTheyDo: user.organizationProfile.whatTheyDo,
          targetAudience: user.organizationProfile.targetAudience,
          goals: user.organizationProfile.goals,
          brandTone: user.organizationProfile.brandTone,
          budget: user.organizationProfile.budget,
          website: user.organizationProfile.website || '',
          planId: user.planId,
          createdAt: user.signupDate,
          updatedAt: new Date().toISOString(),
        });
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, path);
    }
  }

  public async deleteUser(id: string): Promise<boolean> {
    this.cachedUsers.delete(id);
    const path = `users/${id}`;
    try {
      await deleteDoc(doc(db, 'users', id));
      return true;
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, path);
    }
  }

  public incrementUsage(userId: string): number {
    const user = this.cachedUsers.get(userId);
    const nextCount = (user?.generationsUsedThisMonth || 0) + 1;
    if (user) {
      this.updateUser(userId, { generationsUsedThisMonth: nextCount });
    }
    return nextCount;
  }

  public grantBonusGenerations(userId: string, amount: number): void {
    const user = this.cachedUsers.get(userId);
    if (!user) return;
    const updatedBonus = (user.bonusGenerations || 0) + amount;
    this.updateUser(userId, { bonusGenerations: updatedBonus });
    this.logAction('BONUS_GENERATIONS_GRANTED', `Granted +${amount} bonus generations`, userId);
  }

  public resetUsage(userId: string): void {
    const user = this.cachedUsers.get(userId);
    if (!user) return;
    this.updateUser(userId, {
      generationsUsedThisMonth: 0,
      billingResetDate: getNextMonthFirstDay(),
    });
    this.logAction('USAGE_RESET', `Monthly generation usage reset to 0`, userId);
  }

  /* =========================================================================
   * ORGANIZATIONS (/organizations/{orgId})
   * ========================================================================= */
  public async saveOrganization(org: any): Promise<void> {
    const path = `organizations/${org.id}`;
    try {
      await setDoc(doc(db, 'organizations', org.id), org, { merge: true });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, path);
    }
  }

  public async getOrganization(orgId: string): Promise<any | null> {
    const path = `organizations/${orgId}`;
    try {
      const snap = await getDoc(doc(db, 'organizations', orgId));
      return snap.exists() ? snap.data() : null;
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, path);
    }
  }

  /* =========================================================================
   * OUTPUTS / MY LIBRARY CRUD (/organizations/{orgId}/outputs/{outputId})
   * ========================================================================= */
  public async fetchOutputs(orgId?: string): Promise<SavedOutput[]> {
    const currentOrgId = orgId || auth.currentUser?.uid ? `org_${auth.currentUser?.uid}` : null;
    if (!currentOrgId) return this.cachedOutputs;

    const path = `organizations/${currentOrgId}/outputs`;
    try {
      const snap = await getDocs(collection(db, 'organizations', currentOrgId, 'outputs'));
      const list: SavedOutput[] = [];
      snap.forEach((d) => list.push(d.data() as SavedOutput));
      list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      this.cachedOutputs = list;
      return list;
    } catch {
      return this.cachedOutputs;
    }
  }

  public getOutputs(userId?: string): SavedOutput[] {
    this.fetchOutputs().catch(() => {});
    if (!userId) return this.cachedOutputs;
    return this.cachedOutputs.filter((o) => o.userId === userId);
  }

  public saveOutput(output: Omit<SavedOutput, 'id' | 'createdAt' | 'updatedAt'>): SavedOutput {
    const id = `out_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const now = new Date().toISOString();
    const newOutput: SavedOutput = {
      ...output,
      id,
      createdAt: now,
      updatedAt: now,
    };

    this.cachedOutputs.unshift(newOutput);

    // Persist to Firestore under active organization
    const orgId = auth.currentUser?.uid ? `org_${auth.currentUser.uid}` : 'org_default';
    const path = `organizations/${orgId}/outputs/${id}`;
    setDoc(doc(db, 'organizations', orgId, 'outputs', id), newOutput, { merge: true })
      .catch((err) => {
        handleFirestoreError(err, OperationType.CREATE, path);
      });

    this.logAction('OUTPUT_SAVED', `Saved output "${newOutput.title}" (${newOutput.toolName})`, newOutput.userId);
    return newOutput;
  }

  public updateOutput(id: string, updates: Partial<SavedOutput>): SavedOutput | null {
    const idx = this.cachedOutputs.findIndex((o) => o.id === id);
    if (idx === -1) return null;

    this.cachedOutputs[idx] = {
      ...this.cachedOutputs[idx],
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    const orgId = auth.currentUser?.uid ? `org_${auth.currentUser.uid}` : 'org_default';
    const path = `organizations/${orgId}/outputs/${id}`;
    setDoc(doc(db, 'organizations', orgId, 'outputs', id), updates, { merge: true })
      .catch((err) => {
        handleFirestoreError(err, OperationType.UPDATE, path);
      });

    return this.cachedOutputs[idx];
  }

  public deleteOutput(id: string): boolean {
    const filtered = this.cachedOutputs.filter((o) => o.id !== id);
    if (filtered.length === this.cachedOutputs.length) return false;
    this.cachedOutputs = filtered;

    const orgId = auth.currentUser?.uid ? `org_${auth.currentUser.uid}` : 'org_default';
    const path = `organizations/${orgId}/outputs/${id}`;
    deleteDoc(doc(db, 'organizations', orgId, 'outputs', id))
      .catch((err) => {
        handleFirestoreError(err, OperationType.DELETE, path);
      });

    return true;
  }

  /* =========================================================================
   * INVOICES CRUD
   * ========================================================================= */
  public getInvoices(userId?: string): Invoice[] {
    if (!userId) return this.cachedInvoices;
    return this.cachedInvoices.filter((inv) => inv.userId === userId);
  }

  public addInvoice(invoice: Omit<Invoice, 'id' | 'pdfReceiptId'>): Invoice {
    const newInvoice: Invoice = {
      ...invoice,
      id: `inv_${Date.now()}`,
      pdfReceiptId: `REC-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`,
    };
    this.cachedInvoices.unshift(newInvoice);
    return newInvoice;
  }

  public updateInvoice(id: string, updates: Partial<Invoice>): Invoice | null {
    const idx = this.cachedInvoices.findIndex((i) => i.id === id);
    if (idx === -1) return null;
    this.cachedInvoices[idx] = { ...this.cachedInvoices[idx], ...updates };
    return this.cachedInvoices[idx];
  }

  /* =========================================================================
   * AUDIT LOG (/auditLogs/{logId})
   * ========================================================================= */
  public async fetchAuditLogs(): Promise<AuditLogEntry[]> {
    const path = 'auditLogs';
    try {
      const snap = await getDocs(query(collection(db, path), limit(100)));
      const list: AuditLogEntry[] = [];
      snap.forEach((d) => list.push(d.data() as AuditLogEntry));
      list.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      this.cachedLogs = list;
      return list;
    } catch {
      return this.cachedLogs;
    }
  }

  public getAuditLogs(): AuditLogEntry[] {
    this.fetchAuditLogs().catch(() => {});
    return this.cachedLogs;
  }

  public getUserActivity(userId: string): AuditLogEntry[] {
    return this.getAuditLogs().filter((l) => l.actorId === userId);
  }

  public logAction(
    action: string,
    details: string,
    targetUserId?: string,
    metadata?: Record<string, any>
  ): void {
    const user = auth.currentUser;
    const actorId = user?.uid || targetUserId || 'system';
    const actorEmail = user?.email || 'system@mill.agency';
    const actorName = user?.displayName || actorEmail.split('@')[0];

    const id = `log_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const entry: AuditLogEntry = {
      id,
      timestamp: new Date().toISOString(),
      actorId,
      actorName,
      actorEmail,
      action,
      details,
      targetUserId,
    };

    this.cachedLogs.unshift(entry);

    // Persist to Firestore
    const path = `auditLogs/${id}`;
    setDoc(doc(db, 'auditLogs', id), entry).catch((err) => {
      console.warn('[Audit Log Write Warning]:', err?.message);
    });
  }

  /* =========================================================================
   * PLANS & TOOLS & SETTINGS (Client Configuration)
   * ========================================================================= */
  public getPlans(): Plan[] {
    return INITIAL_PLANS;
  }

  public updatePlan(id: string, updates: Partial<Plan>): Plan | null {
    const p = INITIAL_PLANS.find((x) => x.id === id);
    if (!p) return null;
    Object.assign(p, updates);
    return p;
  }

  public getTools(): ToolDefinition[] {
    return INITIAL_TOOLS;
  }

  public updateTool(id: string, updates: Partial<ToolDefinition>): ToolDefinition | null {
    const t = INITIAL_TOOLS.find((x) => x.id === id);
    if (!t) return null;
    Object.assign(t, updates);
    return t;
  }

  public getSettings(): AgencySettings {
    return INITIAL_SETTINGS;
  }

  public updateSettings(updates: Partial<AgencySettings>): AgencySettings {
    Object.assign(INITIAL_SETTINGS, updates);
    return INITIAL_SETTINGS;
  }

  public getAccessRules(): AccessRule[] {
    return [];
  }

  public addAccessRule(rule: Omit<AccessRule, 'id' | 'createdAt'>): AccessRule {
    return {
      id: `rule_${Date.now()}`,
      createdAt: new Date().toISOString(),
      ...rule,
    };
  }

  public deleteAccessRule(id: string): boolean {
    return true;
  }
}

export const dataService = new DataService();
