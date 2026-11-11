export type UserRole = 'super_admin' | 'admin' | 'support' | 'member';

export type OrganizationType = 'Nonprofit' | 'Startup';

export type BrandTone = 'Warm' | 'Bold' | 'Professional' | 'Playful' | 'Inspiring' | 'Technical';

export type MarketingBudget = 'None' | 'Under $500/month' | '$500 to $2,000/month' | 'Over $2,000/month';

export interface OrganizationProfile {
  orgName: string;
  website?: string;
  type: OrganizationType;
  whatTheyDo: string;
  targetAudience: string;
  goals: string[];
  brandTone: BrandTone[];
  budget: MarketingBudget;
}

export type PlanId = 'free' | 'pro' | 'team' | 'complimentary';

export interface User {
  id: string;
  name: string;
  email: string;
  avatar: string;
  role: UserRole;
  planId: PlanId;
  status: 'active' | 'suspended';
  organizationProfile?: OrganizationProfile;
  signupDate: string;
  lastLogin: string;
  generationsUsedThisMonth: number;
  bonusGenerations: number;
  billingResetDate: string;
  nonprofitDiscountApproved: boolean;
  paymentMethod?: {
    brand: string;
    last4: string;
    expMonth: string;
    expYear: string;
  };
  organizationId?: string;
  teamMembers?: Array<{
    email: string;
    name: string;
    role: string;
    addedAt: string;
  }>;
}

export interface Plan {
  id: PlanId;
  name: string;
  price: number;
  priceNonprofit: number;
  generationLimit: number;
  description: string;
  features: string[];
  popular?: boolean;
}

export interface Invoice {
  id: string;
  userId: string;
  userName: string;
  orgName: string;
  userEmail: string;
  date: string;
  amount: number;
  planId: PlanId;
  planName: string;
  status: 'paid' | 'past_due' | 'canceled' | 'refunded';
  pdfReceiptId: string;
  billingAddress?: string;
}

export type InviteStatus = 'pending' | 'accepted' | 'revoked' | 'expired';

export interface Invite {
  id: string;
  email: string;
  plan: 'complimentary';
  status: InviteStatus;
  createdBy: string;
  createdByEmail?: string;
  createdAt: string;
  expiresAt?: string | null;
  acceptedAt?: string | null;
  acceptedBy?: string | null;
  revokedAt?: string | null;
  revokedBy?: string | null;
  note?: string;
}

export interface SavedOutput {
  id: string;
  userId: string;
  toolId: string;
  toolName: string;
  title: string;
  content: string;
  createdAt: string;
  updatedAt: string;
  tags?: string[];
  userInputs?: Record<string, string>;
}

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  actorId: string;
  actorName: string;
  actorEmail: string;
  action: string;
  details: string;
  targetUserId?: string;
}

export interface AccessRule {
  id: string;
  type: 'allow' | 'block';
  value: string; // e.g., "@seednonprofit.org" or "spammer@bad.com"
  notes: string;
  createdAt: string;
}

export interface ToolDefinition {
  id: string;
  name: string;
  description: string;
  whyThisMatters: string;
  category: 'Strategy' | 'Content' | 'Growth' | 'Specialized';
  forOrgType?: OrganizationType; // If defined, specific to Nonprofit or Startup
  enabledGlobally: boolean;
  minPlanRequired: 'free' | 'pro' | 'team';
  fields: Array<{
    key: string;
    label: string;
    placeholder: string;
    helperText?: string;
    type?: 'text' | 'textarea' | 'select';
    options?: string[];
    defaultValue?: string;
  }>;
}

export interface AgencySettings {
  agencyName: string;
  logoUrl: string;
  primaryColor: string;
  accentColor: string;
  bookingUrl: string;
  openSignup: boolean;
  contactEmail: string;
}
