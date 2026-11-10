import { APP_CONFIG } from '../config';
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

const STORAGE_KEYS = {
  USERS: 'mla_users_v1',
  OUTPUTS: 'mla_outputs_v1',
  INVOICES: 'mla_invoices_v1',
  AUDIT_LOGS: 'mla_audit_logs_v1',
  ACCESS_RULES: 'mla_access_rules_v1',
  PLANS: 'mla_plans_v1',
  TOOLS: 'mla_tools_v1',
  SETTINGS: 'mla_settings_v1',
  CURRENT_USER_ID: 'mla_current_user_id_v1',
  IMPERSONATED_BY: 'mla_impersonated_by_v1',
};

// Initial Plans
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
      'Saved outputs library (up to 25 items)',
      'Millennium Agency marketing guides',
    ],
  },
  {
    id: 'pro',
    name: 'Pro Growth',
    price: 49,
    priceNonprofit: 36.75, // 25% discount
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
    priceNonprofit: 111.75, // 25% discount
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

// Initial Tools
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
        key: 'coreProblem',
        label: 'What is the biggest problem your audience faces?',
        placeholder: 'e.g. Overwhelmed by disjointed software tools and lack of dedicated onboarding.',
        type: 'textarea',
      },
      {
        key: 'secretSauce',
        label: 'What is your unique approach or differentiator?',
        placeholder: 'e.g. Hands-on 1-on-1 human coaching paired with an automated workflow.',
        type: 'text',
      },
      {
        key: 'geographicScope',
        label: 'Geographic scope or community served',
        placeholder: 'e.g. Greater Boston area, or North American B2B SaaS companies.',
        type: 'text',
      },
    ],
  },
  {
    id: 'messaging-builder',
    name: 'Messaging Builder',
    category: 'Strategy',
    description: 'Generate sticky tagline options, timed elevator pitches (15s, 30s, 60s), and 3 pillar messages with proof points.',
    whyThisMatters: 'Consistency turns casual listeners into advocates. You need crisp pitches for coffee chats, stage intros, and emails.',
    enabledGlobally: true,
    minPlanRequired: 'free',
    fields: [
      {
        key: 'primaryBenefit',
        label: 'Single most powerful transformation you provide',
        placeholder: 'e.g. Cut administrative time by 15 hours a week so staff can focus on youth mentoring.',
        type: 'textarea',
      },
      {
        key: 'urgencyReason',
        label: 'Why should someone take action now instead of waiting?',
        placeholder: 'e.g. Community demand has doubled this year and grant deadlines are approaching.',
        type: 'text',
      },
    ],
  },
  {
    id: '90-day-plan',
    name: '90-Day Marketing Plan',
    category: 'Growth',
    description: 'A structured, week-by-week actionable plan matched to your goals and budget, prioritizing high-leverage low-cost channels.',
    whyThisMatters: 'Random acts of marketing fail. A disciplined 90-day sprint ensures you build momentum without burning cash.',
    enabledGlobally: true,
    minPlanRequired: 'free',
    fields: [
      {
        key: 'quarterFocus',
        label: 'Primary milestone for this 90-day sprint',
        placeholder: 'e.g. Secure 50 new monthly donors, or sign first 10 enterprise pilot accounts.',
        type: 'text',
      },
      {
        key: 'availableHours',
        label: 'Team marketing hours available per week',
        placeholder: 'e.g. 5 to 10 hours per week (solo founder / small team).',
        type: 'select',
        options: ['1 to 5 hours/week', '5 to 10 hours/week', '10 to 20 hours/week', 'Dedicated full-time marketer'],
      },
      {
        key: 'preferredChannels',
        label: 'Channels you want to prioritize or test',
        placeholder: 'e.g. LinkedIn, Local Press, Monthly Email Newsletter, Community Partnerships.',
        type: 'text',
      },
    ],
  },
  {
    id: 'social-generator',
    name: 'Social Post Generator',
    category: 'Content',
    description: 'Craft engaging, tailored posts for LinkedIn, Instagram, Facebook, and X, plus a complete 4-week thematic calendar.',
    whyThisMatters: 'Social algorithms reward authentic perspective over generic promotion. This gives you high-credibility drafts in seconds.',
    enabledGlobally: true,
    minPlanRequired: 'free',
    fields: [
      {
        key: 'postTopic',
        label: 'Specific theme, milestone, or topic for this batch',
        placeholder: 'e.g. Announcing our new community mentorship program, or 3 lessons from our pilot launch.',
        type: 'textarea',
      },
      {
        key: 'callToAction',
        label: 'Desired reader action',
        placeholder: 'e.g. Comment thoughts below, share with peers, or register for our free webinar.',
        type: 'text',
      },
    ],
  },
  {
    id: 'email-writer',
    name: 'Email Writer',
    category: 'Content',
    description: 'Draft compelling newsletters, welcome sequences, and major announcements with high-open-rate subject lines.',
    whyThisMatters: 'Email is the only audience channel you actually own. A thoughtful welcome sequence converts 4x better than a generic blast.',
    enabledGlobally: true,
    minPlanRequired: 'free',
    fields: [
      {
        key: 'emailType',
        label: 'Type of email needed',
        placeholder: 'Select email type',
        type: 'select',
        options: ['Welcome & Orientation', 'Monthly Newsletter', 'Major Milestone Announcement', 'Fundraising Appeal / Product Launch'],
      },
      {
        key: 'keyTakeaway',
        label: 'The core story or message to communicate',
        placeholder: 'e.g. Why we just expanded our services to Springfield and how families can apply.',
        type: 'textarea',
      },
      {
        key: 'senderName',
        label: 'Who is signing the email?',
        placeholder: 'e.g. Sarah Jenkins, Executive Director',
        type: 'text',
      },
    ],
  },
  {
    id: 'website-copy',
    name: 'Website Copy Builder',
    category: 'Content',
    description: 'Complete homepage hero section, about page story hook, and service program descriptions with SEO title and meta description.',
    whyThisMatters: 'Visitors decide in 5 seconds whether to stay or bounce. Clean, benefit-driven copy turns traffic into engaged inquiries.',
    enabledGlobally: true,
    minPlanRequired: 'free',
    fields: [
      {
        key: 'targetKeyword',
        label: 'Primary search keyword or category phrase',
        placeholder: 'e.g. youth STEM programs Boston, or automated revenue forecasting software.',
        type: 'text',
      },
      {
        key: 'primaryCTA',
        label: 'Main website call to action',
        placeholder: 'e.g. Schedule a Tour, Request a Demo, or Donate Now.',
        type: 'text',
      },
      {
        key: 'storyOrigin',
        label: 'Brief founding origin (1 sentence)',
        placeholder: 'e.g. Founded in 2024 after our team experienced firsthand how broken non-profit reporting tools were.',
        type: 'textarea',
      },
    ],
  },
  {
    id: 'donor-appeal',
    name: 'Donor Appeal & Grant Helper',
    category: 'Specialized',
    forOrgType: 'Nonprofit',
    description: 'Craft heartfelt, persuasive donor appeals and executive grant proposal summaries with clear impact indicators.',
    whyThisMatters: 'Donors and grant review committees fund outcomes, not overhead. Frame your work around human transformation.',
    enabledGlobally: true,
    minPlanRequired: 'free',
    fields: [
      {
        key: 'campaignName',
        label: 'Appeal name or grant project title',
        placeholder: 'e.g. 2026 Winter Hope Initiative or Youth Tech Lab Expansion.',
        type: 'text',
      },
      {
        key: 'fundingGoal',
        label: 'Funding target and exact usage',
        placeholder: 'e.g. $25,000 to equip 50 students with laptops and 6 months of internet access.',
        type: 'textarea',
      },
      {
        key: 'urgentDeadline',
        label: 'Campaign timeline or grant submission date',
        placeholder: 'e.g. December 31st or within the next 30 days.',
        type: 'text',
      },
    ],
  },
  {
    id: 'pitch-launch',
    name: 'Pitch Deck & Launch Helper',
    category: 'Specialized',
    forOrgType: 'Startup',
    description: 'Build an investor-ready 10-slide narrative script and launch teasers for Product Hunt, Hacker News, and LinkedIn.',
    whyThisMatters: 'Investors and early adopters buy the problem and the founders before the software. Crisp storytelling drives early pilots.',
    enabledGlobally: true,
    minPlanRequired: 'free',
    fields: [
      {
        key: 'marketSize',
        label: 'Target market and who suffers most from this problem',
        placeholder: 'e.g. 150,000 mid-sized logistics brokers losing 12% in missed demurrage charges.',
        type: 'textarea',
      },
      {
        key: 'businessModel',
        label: 'How you make money',
        placeholder: 'e.g. B2B SaaS with $299/mo tier and enterprise usage add-ons.',
        type: 'text',
      },
      {
        key: 'launchAsk',
        label: 'The Ask (Fundraising amount, pilot customers, or hires)',
        placeholder: 'e.g. Raising $750k pre-seed round or seeking 10 design partners.',
        type: 'text',
      },
    ],
  },
  {
    id: 'keywords-content',
    name: 'Keyword & Content Ideas',
    category: 'Growth',
    description: '20 high-value keywords grouped by user intent (Informational, Commercial, Navigational, Transactional) and 10 blog ideas.',
    whyThisMatters: 'Targeting high-intent search terms brings compounding organic visitors without continuous ad expenditures.',
    enabledGlobally: true,
    minPlanRequired: 'free',
    fields: [
      {
        key: 'competitorOrInspiration',
        label: 'Competitors, peer organizations, or publications you admire',
        placeholder: 'e.g. Charity: Water, TechCrunch, HubSpot, local community foundations.',
        type: 'text',
      },
      {
        key: 'coreTopicThemes',
        label: 'Top 2 or 3 topic themes you want to dominate',
        placeholder: 'e.g. Nonprofit storytelling, donor transparency, volunteer retention.',
        type: 'textarea',
      },
    ],
  },
];

// Initial Agency Settings
export const INITIAL_SETTINGS: AgencySettings = {
  agencyName: 'Millennium Agency',
  logoUrl: '/millennium-logo.svg',
  primaryColor: '#0f172a',
  accentColor: '#e11d48',
  bookingUrl: 'https://calendly.com/lindafanaras/linkedin-intro',
  openSignup: true,
  contactEmail: 'contact@mill.agency',
};

// Seed 15 Realistic Users for Admin Demo
export const SEED_USERS: User[] = [
  {
    id: 'user_admin_linda',
    name: 'Linda Fanaras',
    email: 'linda@mill.agency',
    avatar: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=150&auto=format&fit=crop&q=80',
    role: 'super_admin',
    planId: 'team',
    status: 'active',
    signupDate: '2025-01-10T08:00:00Z',
    lastLogin: '2026-10-28T12:00:00Z',
    generationsUsedThisMonth: 84,
    bonusGenerations: 250,
    billingResetDate: '2026-11-01',
    nonprofitDiscountApproved: false,
    organizationProfile: {
      orgName: 'Millennium Agency',
      website: 'https://mill.agency',
      type: 'Startup',
      whatTheyDo: 'Leading strategic marketing, branding, and growth advisory agency.',
      targetAudience: 'Growth-minded B2B businesses, innovative tech startups, and purpose-driven nonprofits.',
      goals: ['Expand Launchpad reach', 'Guide 100 nonprofits in 2026', 'Accelerate startup client exits'],
      brandTone: ['Bold', 'Inspiring'],
      budget: 'Over $2,000/month',
    },
    paymentMethod: {
      brand: 'Visa',
      last4: '4242',
      expMonth: '12',
      expYear: '2028',
    },
  },
  {
    id: 'user_sarah_jenkins',
    name: 'Sarah Jenkins',
    email: 'sarah@greenrootnonprofit.org',
    avatar: 'https://images.unsplash.com/photo-1580489944761-15a19d654956?w=150&auto=format&fit=crop&q=80',
    role: 'member',
    planId: 'pro',
    status: 'active',
    signupDate: '2025-03-14T11:20:00Z',
    lastLogin: '2026-10-27T16:45:00Z',
    generationsUsedThisMonth: 412, // 82% of limit, triggers warning banner!
    bonusGenerations: 0,
    billingResetDate: '2026-11-14',
    nonprofitDiscountApproved: true, // 25% discount applied
    organizationProfile: {
      orgName: 'GreenRoot Foundation',
      website: 'https://greenrootnonprofit.org',
      type: 'Nonprofit',
      whatTheyDo: 'Urban reforestation and environmental education programs for underserved public schools.',
      targetAudience: 'Local community donors, municipal sustainability officers, and corporate ESG grantors.',
      goals: ['Plant 2,500 trees in school zones', 'Launch 2026 Spring Earth Gala', 'Grow recurring donors to 300'],
      brandTone: ['Warm', 'Inspiring'],
      budget: 'Under $500/month',
    },
    paymentMethod: {
      brand: 'Mastercard',
      last4: '8812',
      expMonth: '08',
      expYear: '2027',
    },
  },
  {
    id: 'user_marcus_chen',
    name: 'Marcus Chen',
    email: 'marcus@nexaflow.io',
    avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80',
    role: 'member',
    planId: 'team',
    status: 'active',
    signupDate: '2025-04-02T09:15:00Z',
    lastLogin: '2026-10-28T10:30:00Z',
    generationsUsedThisMonth: 820,
    bonusGenerations: 100,
    billingResetDate: '2026-11-02',
    nonprofitDiscountApproved: false,
    organizationProfile: {
      orgName: 'NexaFlow AI',
      website: 'https://nexaflow.io',
      type: 'Startup',
      whatTheyDo: 'Automated invoice reconciliation and financial anomaly detection for supply chain mid-markets.',
      targetAudience: 'Chief Financial Officers, logistics controllers, and mid-market supply chain operators.',
      goals: ['Close Series Seed round ($1.5M)', 'Acquire 20 paying pilot customers', 'Launch on Product Hunt'],
      brandTone: ['Professional', 'Technical'],
      budget: '$500 to $2,000/month',
    },
    paymentMethod: {
      brand: 'American Express',
      last4: '1004',
      expMonth: '11',
      expYear: '2029',
    },
    teamMembers: [
      { name: 'Elena Rostova', email: 'elena@nexaflow.io', role: 'Head of Growth', addedAt: '2025-05-01' },
      { name: 'Devin Scott', email: 'devin@nexaflow.io', role: 'Product Lead', addedAt: '2025-06-15' },
    ],
  },
  {
    id: 'user_david_kim',
    name: 'David Kim',
    email: 'david@hopetrail.org',
    avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&auto=format&fit=crop&q=80',
    role: 'member',
    planId: 'free',
    status: 'active',
    signupDate: '2025-05-18T14:30:00Z',
    lastLogin: '2026-10-26T09:00:00Z',
    generationsUsedThisMonth: 50, // 100% of free limit! Triggers upgrade modal!
    bonusGenerations: 0,
    billingResetDate: '2026-11-18',
    nonprofitDiscountApproved: false,
    organizationProfile: {
      orgName: 'HopeTrail Youth Outreach',
      website: 'https://hopetrail.org',
      type: 'Nonprofit',
      whatTheyDo: 'Mentorship and vocational readiness coaching for youth aging out of foster care.',
      targetAudience: 'Individual philanthropic donors, family foundations, and youth advocates.',
      goals: ['Place 40 youth into full-time apprenticeships', 'Secure matching grant funding', 'Build brand awareness'],
      brandTone: ['Warm', 'Inspiring'],
      budget: 'None',
    },
  },
  {
    id: 'user_amara_okoro',
    name: 'Amara Okoro',
    email: 'amara@solishealth.co',
    avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
    role: 'member',
    planId: 'pro',
    status: 'active',
    signupDate: '2025-06-22T10:00:00Z',
    lastLogin: '2026-10-28T11:45:00Z',
    generationsUsedThisMonth: 185,
    bonusGenerations: 50,
    billingResetDate: '2026-11-22',
    nonprofitDiscountApproved: false,
    organizationProfile: {
      orgName: 'Solis Health',
      website: 'https://solishealth.co',
      type: 'Startup',
      whatTheyDo: 'Continuous metabolic telemetry and lifestyle guidance for patients managing gestational diabetes.',
      targetAudience: 'Expectant mothers and OB/GYN clinic networks looking for proactive patient monitoring.',
      goals: ['Launch clinical pilot with 3 hospital networks', 'Publish peer-reviewed outcomes study', 'Improve SEO visibility'],
      brandTone: ['Warm', 'Professional'],
      budget: '$500 to $2,000/month',
    },
    paymentMethod: {
      brand: 'Visa',
      last4: '9211',
      expMonth: '04',
      expYear: '2028',
    },
  },
  {
    id: 'user_carlos_mendez',
    name: 'Carlos Mendez',
    email: 'carlos@foodbridge.org',
    avatar: 'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=150&auto=format&fit=crop&q=80',
    role: 'member',
    planId: 'team',
    status: 'active',
    signupDate: '2025-07-11T13:40:00Z',
    lastLogin: '2026-10-27T14:10:00Z',
    generationsUsedThisMonth: 950,
    bonusGenerations: 0,
    billingResetDate: '2026-11-11',
    nonprofitDiscountApproved: true,
    organizationProfile: {
      orgName: 'FoodBridge Regional Alliance',
      website: 'https://foodbridge.org',
      type: 'Nonprofit',
      whatTheyDo: 'Connecting surplus fresh produce from regional commercial farms to 80 local food pantries.',
      targetAudience: 'Agricultural logistics partners, grocery chains, volunteer drivers, and municipal hunger relief teams.',
      goals: ['Rescue 1.2 million pounds of fresh produce', 'Expand cold-storage transport routes', 'Recruit 150 regular drivers'],
      brandTone: ['Bold', 'Inspiring'],
      budget: '$500 to $2,000/month',
    },
    paymentMethod: {
      brand: 'Visa',
      last4: '3341',
      expMonth: '10',
      expYear: '2027',
    },
  },
  {
    id: 'user_jessica_trent',
    name: 'Jessica Trent',
    email: 'jtrent@verduratech.com',
    avatar: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=150&auto=format&fit=crop&q=80',
    role: 'member',
    planId: 'free',
    status: 'active',
    signupDate: '2025-08-05T08:25:00Z',
    lastLogin: '2026-10-25T17:00:00Z',
    generationsUsedThisMonth: 12,
    bonusGenerations: 0,
    billingResetDate: '2026-11-05',
    nonprofitDiscountApproved: false,
    organizationProfile: {
      orgName: 'Verdura Tech',
      website: 'https://verduratech.com',
      type: 'Startup',
      whatTheyDo: 'IoT precision sensors for vertical indoor hydroponic agriculture facilities.',
      targetAudience: 'Commercial CEA indoor farm operators and vertical farming venture studios.',
      goals: ['Deploy sensors in 5 commercial test greenhouses', 'Build initial marketing email list', 'Refine core value prop'],
      brandTone: ['Technical', 'Professional'],
      budget: 'Under $500/month',
    },
  },
  {
    id: 'user_matthew_brooks',
    name: 'Matthew Brooks',
    email: 'mbrooks@sanctuaryshelter.org',
    avatar: 'https://images.unsplash.com/photo-1492562080023-ab3db95bfbce?w=150&auto=format&fit=crop&q=80',
    role: 'member',
    planId: 'pro',
    status: 'active',
    signupDate: '2025-08-19T15:10:00Z',
    lastLogin: '2026-10-28T09:20:00Z',
    generationsUsedThisMonth: 230,
    bonusGenerations: 0,
    billingResetDate: '2026-11-19',
    nonprofitDiscountApproved: true,
    organizationProfile: {
      orgName: 'Sanctuary Animal Rescue',
      website: 'https://sanctuaryshelter.org',
      type: 'Nonprofit',
      whatTheyDo: 'No-kill shelter providing veterinary rehabilitation and adoption matching for abused pets.',
      targetAudience: 'Pet adopters, monthly donors, pet supply sponsors, and compassionate animal advocates.',
      goals: ['Adopt out 450 rescued animals', 'Raise $60k for surgical suite', 'Grow Instagram to 25k followers'],
      brandTone: ['Warm', 'Playful'],
      budget: 'Under $500/month',
    },
    paymentMethod: {
      brand: 'Mastercard',
      last4: '7721',
      expMonth: '05',
      expYear: '2028',
    },
  },
  {
    id: 'user_ananya_sharma',
    name: 'Ananya Sharma',
    email: 'ananya@finpulse.io',
    avatar: 'https://images.unsplash.com/photo-1573497019940-1c28c88b4f3e?w=150&auto=format&fit=crop&q=80',
    role: 'member',
    planId: 'team',
    status: 'active',
    signupDate: '2025-09-01T12:00:00Z',
    lastLogin: '2026-10-28T08:15:00Z',
    generationsUsedThisMonth: 1240,
    bonusGenerations: 200,
    billingResetDate: '2026-11-01',
    nonprofitDiscountApproved: false,
    organizationProfile: {
      orgName: 'FinPulse AI',
      website: 'https://finpulse.io',
      type: 'Startup',
      whatTheyDo: 'Automated treasury optimization and cash runway intelligence for bootstrapped SaaS companies.',
      targetAudience: 'SaaS founders, fractional CFOs, and venture portfolio managers.',
      goals: ['Reach $25k Monthly Recurring Revenue', 'Sign 5 agency referral partnerships', 'Host weekly founder webinar'],
      brandTone: ['Bold', 'Professional'],
      budget: 'Over $2,000/month',
    },
    paymentMethod: {
      brand: 'Visa',
      last4: '5562',
      expMonth: '09',
      expYear: '2029',
    },
  },
  {
    id: 'user_robert_hayes',
    name: 'Robert Hayes',
    email: 'robert@cleanwaterinitiatives.org',
    avatar: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150&auto=format&fit=crop&q=80',
    role: 'member',
    planId: 'pro',
    status: 'active',
    signupDate: '2025-09-15T11:00:00Z',
    lastLogin: '2026-10-27T10:15:00Z',
    generationsUsedThisMonth: 180,
    bonusGenerations: 0,
    billingResetDate: '2026-11-15',
    nonprofitDiscountApproved: true,
    organizationProfile: {
      orgName: 'CleanWater Global Initiative',
      website: 'https://cleanwaterinitiatives.org',
      type: 'Nonprofit',
      whatTheyDo: 'Deploying low-cost solar-powered water filtration units to rural healthcare clinics in Central America.',
      targetAudience: 'Global health grantors, rotary clubs, and individual clean water sponsors.',
      goals: ['Install 35 new filtration stations', 'Document health impact data', 'Secure USAID partner grant'],
      brandTone: ['Inspiring', 'Technical'],
      budget: '$500 to $2,000/month',
    },
    paymentMethod: {
      brand: 'Visa',
      last4: '1192',
      expMonth: '06',
      expYear: '2027',
    },
  },
  {
    id: 'user_tariq_almansoor',
    name: 'Tariq Al-Mansoor',
    email: 'tariq@neuralhire.ai',
    avatar: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=150&auto=format&fit=crop&q=80',
    role: 'member',
    planId: 'pro',
    status: 'active',
    signupDate: '2025-10-01T14:50:00Z',
    lastLogin: '2026-10-28T07:45:00Z',
    generationsUsedThisMonth: 340,
    bonusGenerations: 0,
    billingResetDate: '2026-11-01',
    nonprofitDiscountApproved: false,
    organizationProfile: {
      orgName: 'NeuralHire AI',
      website: 'https://neuralhire.ai',
      type: 'Startup',
      whatTheyDo: 'Bias-free technical candidate skill benchmarking and simulated coding interview assessments.',
      targetAudience: 'Technical recruiting directors, VP of Engineering, and fast-growing tech scaleups.',
      goals: ['Screen 10,000 candidates with zero bias', 'Onboard 15 enterprise logos', 'Publish Tech Hiring Index'],
      brandTone: ['Bold', 'Technical'],
      budget: '$500 to $2,000/month',
    },
    paymentMethod: {
      brand: 'Mastercard',
      last4: '4019',
      expMonth: '03',
      expYear: '2028',
    },
  },
  {
    id: 'user_grace_lee',
    name: 'Grace Lee',
    email: 'grace@artsforallboston.org',
    avatar: 'https://images.unsplash.com/photo-1548142813-c348350df52b?w=150&auto=format&fit=crop&q=80',
    role: 'member',
    planId: 'free',
    status: 'active',
    signupDate: '2025-10-10T16:20:00Z',
    lastLogin: '2026-10-28T12:10:00Z',
    generationsUsedThisMonth: 42,
    bonusGenerations: 0,
    billingResetDate: '2026-11-10',
    nonprofitDiscountApproved: false,
    organizationProfile: {
      orgName: 'Arts For All Collective',
      website: 'https://artsforallboston.org',
      type: 'Nonprofit',
      whatTheyDo: 'Free community music, theatre, and visual arts workshops taught by working Boston artists.',
      targetAudience: 'Community arts patrons, local families, and Massachusetts cultural council grantors.',
      goals: ['Host 12 weekend neighborhood pop-ups', 'Offer 100 free student instruments', 'Raise $15,000 annual fund'],
      brandTone: ['Warm', 'Playful'],
      budget: 'None',
    },
  },
  {
    id: 'user_tyler_vance',
    name: 'Tyler Vance',
    email: 'tyler@vancebattery.com',
    avatar: 'https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?w=150&auto=format&fit=crop&q=80',
    role: 'member',
    planId: 'free',
    status: 'suspended', // Suspended account example for admin moderation demo
    signupDate: '2025-10-14T10:10:00Z',
    lastLogin: '2026-10-20T11:00:00Z',
    generationsUsedThisMonth: 0,
    bonusGenerations: 0,
    billingResetDate: '2026-11-14',
    nonprofitDiscountApproved: false,
    organizationProfile: {
      orgName: 'Vance Solid-State Storage',
      website: 'https://vancebattery.com',
      type: 'Startup',
      whatTheyDo: 'High density solid state battery prototypes for unmanned aerial commercial drones.',
      targetAudience: 'Drone fleet operators and defense logistics procurement teams.',
      goals: ['Lab proof of 400 Wh/kg cell', 'File provisional patent', 'Build investor pitch'],
      brandTone: ['Technical', 'Professional'],
      budget: 'Under $500/month',
    },
  },
  {
    id: 'user_patricia_clark',
    name: 'Patricia Clark',
    email: 'patricia@seniorsconnect.org',
    avatar: 'https://images.unsplash.com/photo-1567532939604-b6b5b0db2604?w=150&auto=format&fit=crop&q=80',
    role: 'support', // Agency support role
    planId: 'pro',
    status: 'active',
    signupDate: '2025-02-01T09:00:00Z',
    lastLogin: '2026-10-28T10:00:00Z',
    generationsUsedThisMonth: 65,
    bonusGenerations: 50,
    billingResetDate: '2026-11-01',
    nonprofitDiscountApproved: true,
    organizationProfile: {
      orgName: 'SeniorsConnect Digital Bridge',
      website: 'https://seniorsconnect.org',
      type: 'Nonprofit',
      whatTheyDo: 'Pairing high school tech volunteers with isolated senior citizens for weekly tech literacy and companion calls.',
      targetAudience: 'Aging services agencies, families with senior relatives, and corporate tech donors.',
      goals: ['Connect 500 seniors across 3 towns', 'Eliminate digital isolation', 'Secure telecom equipment sponsor'],
      brandTone: ['Warm', 'Inspiring'],
      budget: 'Under $500/month',
    },
    paymentMethod: {
      brand: 'Visa',
      last4: '2091',
      expMonth: '07',
      expYear: '2028',
    },
  },
  {
    id: 'user_alex_torres',
    name: 'Alex Torres',
    email: 'alex@luminaoptics.com',
    avatar: 'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=150&auto=format&fit=crop&q=80',
    role: 'member',
    planId: 'pro',
    status: 'active',
    signupDate: '2025-10-18T13:00:00Z',
    lastLogin: '2026-10-28T11:10:00Z',
    generationsUsedThisMonth: 110,
    bonusGenerations: 0,
    billingResetDate: '2026-11-18',
    nonprofitDiscountApproved: false,
    organizationProfile: {
      orgName: 'Lumina Quantum Photonics',
      website: 'https://luminaoptics.com',
      type: 'Startup',
      whatTheyDo: 'Miniaturized spectrometer chips for real-time agricultural soil quality analysis in handheld devices.',
      targetAudience: 'Agronomists, commercial farm cooperatives, and fertilizer manufacturers.',
      goals: ['Complete 3 field trials in California', 'File 2 PCT patent applications', 'Prepare investor deck'],
      brandTone: ['Technical', 'Inspiring'],
      budget: '$500 to $2,000/month',
    },
    paymentMethod: {
      brand: 'Visa',
      last4: '4242',
      expMonth: '12',
      expYear: '2027',
    },
  },
];

// Seed Sample Outputs in Library
export const SEED_OUTPUTS: SavedOutput[] = [
  {
    id: 'out_sarah_1',
    userId: 'user_sarah_jenkins',
    toolId: 'brand-foundations',
    toolName: 'Brand Foundations',
    title: 'GreenRoot Core Positioning & Audience Personas',
    createdAt: '2026-10-20T14:00:00Z',
    updatedAt: '2026-10-20T14:00:00Z',
    tags: ['Positioning', 'Personas', 'Earth Gala'],
    content: `## Brand Foundations Blueprint: GreenRoot Foundation

### 1. Mission Statement
GreenRoot Foundation empowers public school communities across New England by transforming underutilized urban school grounds into biodiverse, living tree canopies and outdoor eco-classrooms.

### 2. Strategic Positioning Statement
For **urban public school educators and municipal leaders** who struggle with **heat island effects and lack of safe green spaces**, **GreenRoot Foundation** is the **nonprofit urban forestry partner** that delivers **turnkey student-planted micro-forests**, unlike conventional landscaping contractors because our projects include curriculum-aligned environmental education and 5-year community stewardship bonds.

### 3. Core Value Proposition
- **Cooling Neighborhoods:** Reducing blacktop playground surface temperatures by up to 18°F.
- **STEM in Nature:** Turning every sapling into a live biological observation station for K-8 students.
- **Civic Pride:** Giving children direct ownership of planting their neighborhood's legacy canopy.

### 4. Audience Personas
- **Persona 1: The Civic Champion (Principal / District Facilities Director)**
  - *Key Need:* Zero burden on school maintenance crews; certified safety guarantees.
- **Persona 2: The Family Donor ($25 - $250/year)**
  - *Key Need:* Clear photographic proof of planted trees and student joy.
- **Persona 3: The Corporate ESG Officer ($10k - $50k Grant)**
  - *Key Need:* Verified carbon offset documentation and employee volunteer planting days.`,
  },
  {
    id: 'out_sarah_2',
    userId: 'user_sarah_jenkins',
    toolId: 'donor-appeal',
    toolName: 'Donor Appeal & Grant Helper',
    title: 'Spring Canopy Challenge 2026 Appeal Letter',
    createdAt: '2026-10-24T10:30:00Z',
    updatedAt: '2026-10-24T10:30:00Z',
    tags: ['Fundraising', 'Spring Campaign'],
    content: `## 2026 Spring Canopy Challenge: Donor Appeal

Dear Friend of GreenRoot,

On an unseasonably warm afternoon last September, the blacktop playground at Roosevelt Elementary reached a blistering 114 degrees. Recess was cancelled. Children remained indoors.

That shouldn't be normal.

With your help, it won't be. This spring, GreenRoot Foundation is launching the **Spring Canopy Challenge** to plant 500 native shade trees across 12 urban schools.

**Here is what your gift accomplishes directly:**
- **$50:** Sponsors two native saplings and soil remediation kits.
- **$150:** Provides planting tools, safety gloves, and STEM field journals for an entire classroom of 25 students.
- **$500:** Funds irrigation hydration bags and 3 years of certified arborist health checks.

Thanks to a generous matching pledge from a local family foundation, **every dollar you give before April 30th is doubled, dollar-for-dollar.**

Will you join us today to give our children shaded, living playgrounds?

With heartfelt gratitude,
**Sarah Jenkins**
Executive Director, GreenRoot Foundation`,
  },
  {
    id: 'out_marcus_1',
    userId: 'user_marcus_chen',
    toolId: 'messaging-builder',
    toolName: 'Messaging Builder',
    title: 'NexaFlow AI Pitch Scripts & Elevator Speeches',
    createdAt: '2026-10-18T09:15:00Z',
    updatedAt: '2026-10-18T09:15:00Z',
    tags: ['Pitch', 'Seed Round', 'Taglines'],
    content: `## NexaFlow AI: Messaging & Elevator Pitch Toolkit

### Tagline Options
1. **The CFO's Radar:** Catch supply chain billing leaks before the wire goes out.
2. **Speed & Accuracy:** 100% Invoice Confidence in 30 Seconds.
3. **The Clean Ledger:** The Autonomous Reconciliation Engine for Global Freight.

---

### Timed Elevator Pitches

#### 15-Second Pitch
"NexaFlow AI catches phantom freight charges and demurrage penalties before accounting pays them—saving logistics mid-markets an average of $280,000 every quarter."

#### 30-Second Pitch
"Mid-market logistics companies process 5,000 fragmented freight invoices every week. Up to 7% contain billing errors, duplicate demurrage, or rate discrepancies that manual AP teams simply don't have time to catch. NexaFlow AI integrates with your ERP to autonomously match contracts, bills of lading, and invoices down to the line item. We find the discrepancies instantly, saving you capital on day one."

#### 60-Second Investor Pitch
"When supply chains expanded post-pandemic, invoice complexity exploded. Today, an enterprise freight movement can involve six different carriers, each with dynamic fuel surcharges and accessorial fees.

Most mid-market CFOs are writing checks blind because their 4-person AP department is drowning in PDFs. NexaFlow replaces that manual bottleneck with a continuous AI verification layer. We ingest multi-format invoices, validate them against master contracts, and flag discrepancies before payments release.

In our first 90 days with our 8 beta customers, we analyzed $42M in freight spend and flagged $1.4M in invalid charges. We are expanding to 50 enterprise pilots this quarter."`,
  },
  {
    id: 'out_linda_1',
    userId: 'user_admin_linda',
    toolId: '90-day-plan',
    toolName: '90-Day Marketing Plan',
    title: 'Millennium Launchpad Agency Outreach Sprint',
    createdAt: '2026-10-15T16:00:00Z',
    updatedAt: '2026-10-15T16:00:00Z',
    tags: ['Agency Strategy', 'Launchpad Sprint'],
    content: `## Millennium Agency Launchpad: 90-Day Community Growth Blueprint

### Month 1: Foundation & Nonprofit Alliances
- **Weeks 1-2:** Partner with New England Council of Nonprofits and Mass Innovation Nights for introductory webinars.
- **Weeks 3-4:** Distribute 50 scholarship Pro tier licenses to promising regional sustainability nonprofits.

### Month 2: Case Studies & Direct Traction
- **Weeks 5-6:** Capture video testimonial with GreenRoot Foundation showcasing their 100% funded Spring Canopy appeal.
- **Weeks 7-8:** Host live interactive masterclass: "How Startups Can Build 6-Figure Pipeline with AI Brand Foundations."

### Month 3: Agency Advisory Funnel
- **Weeks 9-10:** Trigger high-touch advisory invitations to Launchpad users who completed 3+ tools.
- **Weeks 11-12:** Review conversion from free tool users to retainered agency marketing partnerships.`,
  },
];

// Seed Invoices for Billing & Admin Demo
export const SEED_INVOICES: Invoice[] = [
  {
    id: 'inv_1001',
    userId: 'user_sarah_jenkins',
    userName: 'Sarah Jenkins',
    orgName: 'GreenRoot Foundation',
    userEmail: 'sarah@greenrootnonprofit.org',
    date: '2026-10-14',
    amount: 36.75, // Pro with 25% nonprofit discount
    planId: 'pro',
    planName: 'Pro Growth (Nonprofit 25% Off)',
    status: 'paid',
    pdfReceiptId: 'REC-2026-1001',
    billingAddress: '142 Commonwealth Ave, Boston, MA 02116',
  },
  {
    id: 'inv_1002',
    userId: 'user_marcus_chen',
    userName: 'Marcus Chen',
    orgName: 'NexaFlow AI',
    userEmail: 'marcus@nexaflow.io',
    date: '2026-10-02',
    amount: 149.0,
    planId: 'team',
    planName: 'Agency Team',
    status: 'paid',
    pdfReceiptId: 'REC-2026-1002',
    billingAddress: '500 Technology Square, Cambridge, MA 02139',
  },
  {
    id: 'inv_1003',
    userId: 'user_carlos_mendez',
    userName: 'Carlos Mendez',
    orgName: 'FoodBridge Regional Alliance',
    userEmail: 'carlos@foodbridge.org',
    date: '2026-10-11',
    amount: 111.75, // Team with 25% nonprofit discount
    planId: 'team',
    planName: 'Agency Team (Nonprofit 25% Off)',
    status: 'paid',
    pdfReceiptId: 'REC-2026-1003',
    billingAddress: '88 Market St, Worcester, MA 01608',
  },
  {
    id: 'inv_1004',
    userId: 'user_amara_okoro',
    userName: 'Amara Okoro',
    orgName: 'Solis Health',
    userEmail: 'amara@solishealth.co',
    date: '2026-09-22',
    amount: 49.0,
    planId: 'pro',
    planName: 'Pro Growth',
    status: 'paid',
    pdfReceiptId: 'REC-2026-1004',
    billingAddress: '200 Berkeley St, Boston, MA 02116',
  },
  {
    id: 'inv_1005',
    userId: 'user_matthew_brooks',
    userName: 'Matthew Brooks',
    orgName: 'Sanctuary Animal Rescue',
    userEmail: 'mbrooks@sanctuaryshelter.org',
    date: '2026-09-19',
    amount: 36.75,
    planId: 'pro',
    planName: 'Pro Growth (Nonprofit 25% Off)',
    status: 'paid',
    pdfReceiptId: 'REC-2026-1005',
    billingAddress: '45 Pine Ridge Rd, Concord, NH 03301',
  },
  {
    id: 'inv_1006',
    userId: 'user_ananya_sharma',
    userName: 'Ananya Sharma',
    orgName: 'FinPulse AI',
    userEmail: 'ananya@finpulse.io',
    date: '2026-10-01',
    amount: 149.0,
    planId: 'team',
    planName: 'Agency Team',
    status: 'paid',
    pdfReceiptId: 'REC-2026-1006',
    billingAddress: '100 Federal St, Boston, MA 02110',
  },
  {
    id: 'inv_1007',
    userId: 'user_robert_hayes',
    userName: 'Robert Hayes',
    orgName: 'CleanWater Global Initiative',
    userEmail: 'robert@cleanwaterinitiatives.org',
    date: '2026-10-15',
    amount: 36.75,
    planId: 'pro',
    planName: 'Pro Growth (Nonprofit 25% Off)',
    status: 'paid',
    pdfReceiptId: 'REC-2026-1007',
    billingAddress: '312 Elm St, Manchester, NH 03101',
  },
  {
    id: 'inv_1008',
    userId: 'user_tariq_almansoor',
    userName: 'Tariq Al-Mansoor',
    orgName: 'NeuralHire AI',
    userEmail: 'tariq@neuralhire.ai',
    date: '2026-10-01',
    amount: 49.0,
    planId: 'pro',
    planName: 'Pro Growth',
    status: 'paid',
    pdfReceiptId: 'REC-2026-1008',
    billingAddress: '1 Broadway, Cambridge, MA 02142',
  },
];

// Seed Audit Logs
export const SEED_AUDIT_LOGS: AuditLogEntry[] = [
  // Linda Fanaras (Super Admin / Current Demo User)
  {
    id: 'log_linda_01',
    timestamp: '2026-10-28T16:30:00Z',
    actorId: 'user_admin_linda',
    actorName: 'Linda Fanaras',
    actorEmail: 'linda@mill.agency',
    action: 'TOOL_GENERATION',
    details: 'Generated output with Brand Foundations',
    targetUserId: 'user_admin_linda',
  },
  {
    id: 'log_linda_02',
    timestamp: '2026-10-28T16:32:00Z',
    actorId: 'user_admin_linda',
    actorName: 'Linda Fanaras',
    actorEmail: 'linda@mill.agency',
    action: 'OUTPUT_SAVED',
    details: 'Saved output "Millennium Agency Core Brand Positioning" (Brand Foundations)',
    targetUserId: 'user_admin_linda',
  },
  {
    id: 'log_linda_03',
    timestamp: '2026-10-27T11:15:00Z',
    actorId: 'user_admin_linda',
    actorName: 'Linda Fanaras',
    actorEmail: 'linda@mill.agency',
    action: 'TOOL_GENERATION',
    details: 'Generated output with 90-Day Marketing Plan',
    targetUserId: 'user_admin_linda',
  },
  {
    id: 'log_linda_04',
    timestamp: '2026-10-27T11:18:00Z',
    actorId: 'user_admin_linda',
    actorName: 'Linda Fanaras',
    actorEmail: 'linda@mill.agency',
    action: 'OUTPUT_SAVED',
    details: 'Saved output "Q4 Agency Scaled Sprint" (90-Day Marketing Plan)',
    targetUserId: 'user_admin_linda',
  },
  {
    id: 'log_linda_05',
    timestamp: '2026-10-25T09:00:00Z',
    actorId: 'user_admin_linda',
    actorName: 'Linda Fanaras',
    actorEmail: 'linda@mill.agency',
    action: 'PLAN_UPGRADED',
    details: 'Linda Fanaras upgraded to Agency Team ($149.00)',
    targetUserId: 'user_admin_linda',
  },
  {
    id: 'log_linda_06',
    timestamp: '2026-10-24T14:20:00Z',
    actorId: 'user_admin_linda',
    actorName: 'Linda Fanaras',
    actorEmail: 'linda@mill.agency',
    action: 'TOOL_GENERATION',
    details: 'Generated output with Messaging Builder',
    targetUserId: 'user_admin_linda',
  },
  {
    id: 'log_linda_07',
    timestamp: '2026-10-22T10:05:00Z',
    actorId: 'user_admin_linda',
    actorName: 'Linda Fanaras',
    actorEmail: 'linda@mill.agency',
    action: 'TOOL_GENERATION',
    details: 'Generated output with Social Post Generator',
    targetUserId: 'user_admin_linda',
  },
  {
    id: 'log_linda_08',
    timestamp: '2026-10-15T08:00:00Z',
    actorId: 'user_admin_linda',
    actorName: 'Linda Fanaras',
    actorEmail: 'linda@mill.agency',
    action: 'BONUS_GENERATIONS_GRANTED',
    details: 'Granted +250 bonus generations for platform onboarding demonstration',
    targetUserId: 'user_admin_linda',
  },
  {
    id: 'log_linda_09',
    timestamp: '2026-10-01T00:00:00Z',
    actorId: 'system',
    actorName: 'System Automation',
    actorEmail: 'system@mill.agency',
    action: 'USAGE_RESET',
    details: 'Monthly generation quota reset for new billing cycle',
    targetUserId: 'user_admin_linda',
  },
  {
    id: 'log_linda_10',
    timestamp: '2026-09-15T10:00:00Z',
    actorId: 'user_admin_linda',
    actorName: 'Linda Fanaras',
    actorEmail: 'linda@mill.agency',
    action: 'PROFILE_CONFIGURED',
    details: 'Configured organization profile for Millennium Agency',
    targetUserId: 'user_admin_linda',
  },

  // Sarah Jenkins (Nonprofit Executive Director)
  {
    id: 'log_sarah_01',
    timestamp: '2026-10-28T10:45:00Z',
    actorId: 'user_sarah_jenkins',
    actorName: 'Sarah Jenkins',
    actorEmail: 'sarah@greenrootnonprofit.org',
    action: 'TOOL_GENERATION',
    details: 'Generated output with Donor Appeal & Grant Narrative',
    targetUserId: 'user_sarah_jenkins',
  },
  {
    id: 'log_sarah_02',
    timestamp: '2026-10-28T10:50:00Z',
    actorId: 'user_sarah_jenkins',
    actorName: 'Sarah Jenkins',
    actorEmail: 'sarah@greenrootnonprofit.org',
    action: 'OUTPUT_SAVED',
    details: 'Saved output "GreenRoot Fall Tree Canopy Appeal" (Donor Appeal & Grant Narrative)',
    targetUserId: 'user_sarah_jenkins',
  },
  {
    id: 'log_sarah_03',
    timestamp: '2026-10-26T14:10:00Z',
    actorId: 'user_sarah_jenkins',
    actorName: 'Sarah Jenkins',
    actorEmail: 'sarah@greenrootnonprofit.org',
    action: 'TOOL_GENERATION',
    details: 'Generated output with Social Post Generator',
    targetUserId: 'user_sarah_jenkins',
  },
  {
    id: 'log_sarah_04',
    timestamp: '2026-10-24T09:30:00Z',
    actorId: 'user_sarah_jenkins',
    actorName: 'Sarah Jenkins',
    actorEmail: 'sarah@greenrootnonprofit.org',
    action: 'PLAN_UPGRADED',
    details: 'Sarah Jenkins upgraded to Pro Growth ($36.75 with 25% nonprofit discount)',
    targetUserId: 'user_sarah_jenkins',
  },
  {
    id: 'log_sarah_05',
    timestamp: '2026-10-22T11:15:00Z',
    actorId: 'user_admin_linda',
    actorName: 'Linda Fanaras',
    actorEmail: 'linda@mill.agency',
    action: 'DISCOUNT_APPROVED',
    details: 'Approved 25% Nonprofit Discount for GreenRoot Environmental Initiative',
    targetUserId: 'user_sarah_jenkins',
  },
  {
    id: 'log_sarah_06',
    timestamp: '2026-10-18T16:20:00Z',
    actorId: 'user_sarah_jenkins',
    actorName: 'Sarah Jenkins',
    actorEmail: 'sarah@greenrootnonprofit.org',
    action: 'TOOL_GENERATION',
    details: 'Generated output with Brand Foundations',
    targetUserId: 'user_sarah_jenkins',
  },
  {
    id: 'log_sarah_07',
    timestamp: '2026-10-18T16:25:00Z',
    actorId: 'user_sarah_jenkins',
    actorName: 'Sarah Jenkins',
    actorEmail: 'sarah@greenrootnonprofit.org',
    action: 'OUTPUT_SAVED',
    details: 'Saved output "GreenRoot Mission & Value Pillars" (Brand Foundations)',
    targetUserId: 'user_sarah_jenkins',
  },
  {
    id: 'log_sarah_08',
    timestamp: '2026-10-10T13:40:00Z',
    actorId: 'user_sarah_jenkins',
    actorName: 'Sarah Jenkins',
    actorEmail: 'sarah@greenrootnonprofit.org',
    action: 'TOOL_GENERATION',
    details: 'Generated output with Website Copy Builder',
    targetUserId: 'user_sarah_jenkins',
  },

  // Marcus Chen (Startup Founder)
  {
    id: 'log_marcus_01',
    timestamp: '2026-10-28T15:10:00Z',
    actorId: 'user_marcus_chen',
    actorName: 'Marcus Chen',
    actorEmail: 'marcus@nexaflow.ai',
    action: 'TOOL_GENERATION',
    details: 'Generated output with Startup Pitch & Launch Helper',
    targetUserId: 'user_marcus_chen',
  },
  {
    id: 'log_marcus_02',
    timestamp: '2026-10-28T15:15:00Z',
    actorId: 'user_marcus_chen',
    actorName: 'Marcus Chen',
    actorEmail: 'marcus@nexaflow.ai',
    action: 'OUTPUT_SAVED',
    details: 'Saved output "NexaFlow AI Seed Pitch Script" (Startup Pitch & Launch Helper)',
    targetUserId: 'user_marcus_chen',
  },
  {
    id: 'log_02',
    timestamp: '2026-10-27T14:40:00Z',
    actorId: 'user_admin_linda',
    actorName: 'Linda Fanaras',
    actorEmail: 'linda@mill.agency',
    action: 'BONUS_GENERATIONS_GRANTED',
    details: 'Granted +100 bonus generations to NexaFlow AI for beta participation',
    targetUserId: 'user_marcus_chen',
  },
  {
    id: 'log_marcus_03',
    timestamp: '2026-10-25T11:30:00Z',
    actorId: 'user_marcus_chen',
    actorName: 'Marcus Chen',
    actorEmail: 'marcus@nexaflow.ai',
    action: 'TOOL_GENERATION',
    details: 'Generated output with 90-Day Marketing Plan',
    targetUserId: 'user_marcus_chen',
  },
  {
    id: 'log_marcus_04',
    timestamp: '2026-10-20T10:00:00Z',
    actorId: 'user_marcus_chen',
    actorName: 'Marcus Chen',
    actorEmail: 'marcus@nexaflow.ai',
    action: 'PLAN_UPGRADED',
    details: 'Marcus Chen upgraded to Pro Growth ($49.00)',
    targetUserId: 'user_marcus_chen',
  },

  // Other system & admin logs
  {
    id: 'log_01',
    timestamp: '2026-10-28T09:12:00Z',
    actorId: 'user_admin_linda',
    actorName: 'Linda Fanaras',
    actorEmail: 'linda@mill.agency',
    action: 'DISCOUNT_APPROVED',
    details: 'Approved 25% Nonprofit Discount for CleanWater Global Initiative',
    targetUserId: 'user_robert_hayes',
  },
  {
    id: 'log_03',
    timestamp: '2026-10-26T11:22:00Z',
    actorId: 'user_admin_linda',
    actorName: 'Linda Fanaras',
    actorEmail: 'linda@mill.agency',
    action: 'USER_SUSPENDED',
    details: 'Suspended Vance Battery account pending email domain confirmation',
    targetUserId: 'user_tyler_vance',
  },
  {
    id: 'log_04',
    timestamp: '2026-10-25T15:30:00Z',
    actorId: 'user_admin_linda',
    actorName: 'Linda Fanaras',
    actorEmail: 'linda@mill.agency',
    action: 'PLAN_LIMIT_UPDATED',
    details: 'Updated Pro Plan limit to 500 generations/mo and added custom brand tone memory feature',
  },
];

// Seed Access Rules
export const SEED_ACCESS_RULES: AccessRule[] = [
  {
    id: 'rule_1',
    type: 'allow',
    value: '@mill.agency',
    notes: 'Internal agency team members auto-approved for Super Admin & Staff roles',
    createdAt: '2025-01-01T00:00:00Z',
  },
  {
    id: 'rule_2',
    type: 'allow',
    value: '@greenrootnonprofit.org',
    notes: 'VIP Community Partner Program',
    createdAt: '2025-03-01T00:00:00Z',
  },
  {
    id: 'rule_3',
    type: 'block',
    value: 'spamdomain.xyz',
    notes: 'Known scraping and bot domain',
    createdAt: '2025-08-10T00:00:00Z',
  },
];

// Browser Local Storage Helper
function getStored<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch (e) {
    console.error(`Failed to read ${key} from storage:`, e);
    return fallback;
  }
}

function setStored<T>(key: string, data: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch (e) {
    console.error(`Failed to write ${key} to storage:`, e);
  }
}

/**
 * Data Service Implementation
 * Supports LocalStorage (Demo Mode) and Firestore (Production Mode)
 */
class DataService {
  constructor() {
    this.ensureInitialized();
  }

  public ensureInitialized(): void {
    if (typeof window === 'undefined') return;

    if (!localStorage.getItem(STORAGE_KEYS.USERS)) {
      setStored(STORAGE_KEYS.USERS, SEED_USERS);
    }
    if (!localStorage.getItem(STORAGE_KEYS.OUTPUTS)) {
      setStored(STORAGE_KEYS.OUTPUTS, SEED_OUTPUTS);
    }
    if (!localStorage.getItem(STORAGE_KEYS.INVOICES)) {
      setStored(STORAGE_KEYS.INVOICES, SEED_INVOICES);
    }
    if (!localStorage.getItem(STORAGE_KEYS.AUDIT_LOGS)) {
      setStored(STORAGE_KEYS.AUDIT_LOGS, SEED_AUDIT_LOGS);
    }
    if (!localStorage.getItem(STORAGE_KEYS.ACCESS_RULES)) {
      setStored(STORAGE_KEYS.ACCESS_RULES, SEED_ACCESS_RULES);
    }
    if (!localStorage.getItem(STORAGE_KEYS.PLANS)) {
      setStored(STORAGE_KEYS.PLANS, INITIAL_PLANS);
    }
    if (!localStorage.getItem(STORAGE_KEYS.TOOLS)) {
      setStored(STORAGE_KEYS.TOOLS, INITIAL_TOOLS);
    }
    if (!localStorage.getItem(STORAGE_KEYS.SETTINGS)) {
      setStored(STORAGE_KEYS.SETTINGS, INITIAL_SETTINGS);
    }
  }

  public resetDemoData(): void {
    localStorage.removeItem(STORAGE_KEYS.USERS);
    localStorage.removeItem(STORAGE_KEYS.OUTPUTS);
    localStorage.removeItem(STORAGE_KEYS.INVOICES);
    localStorage.removeItem(STORAGE_KEYS.AUDIT_LOGS);
    localStorage.removeItem(STORAGE_KEYS.ACCESS_RULES);
    localStorage.removeItem(STORAGE_KEYS.PLANS);
    localStorage.removeItem(STORAGE_KEYS.TOOLS);
    localStorage.removeItem(STORAGE_KEYS.SETTINGS);
    localStorage.removeItem(STORAGE_KEYS.CURRENT_USER_ID);
    localStorage.removeItem(STORAGE_KEYS.IMPERSONATED_BY);

    this.ensureInitialized();
    this.logAction('DEMO_RESET', 'All application data reset to pristine seed state');
  }

  /* =========================================================================
   * USERS CRUD
   * ========================================================================= */
  public getUsers(): User[] {
    /* TODO [FIRESTORE INTEGRATION]:
     * const snapshot = await getDocs(collection(db, 'users'));
     * return snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
     */
    return getStored<User[]>(STORAGE_KEYS.USERS, SEED_USERS);
  }

  public getUserById(id: string): User | null {
    const users = this.getUsers();
    return users.find((u) => u.id === id) || null;
  }

  public getUserByEmail(email: string): User | null {
    const users = this.getUsers();
    return users.find((u) => u.email.toLowerCase() === email.toLowerCase()) || null;
  }

  public createUser(userData: Partial<User> & { email: string; name: string }): User {
    const users = this.getUsers();
    const newUser: User = {
      id: `user_${Date.now()}`,
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
      billingResetDate: new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
      nonprofitDiscountApproved: false,
      organizationProfile: userData.organizationProfile,
    };

    users.push(newUser);
    setStored(STORAGE_KEYS.USERS, users);
    this.logAction('USER_SIGNUP', `New user registered: ${newUser.name} (${newUser.email})`, newUser.id);
    return newUser;
  }

  public updateUser(id: string, updates: Partial<User>): User | null {
    const users = this.getUsers();
    const index = users.findIndex((u) => u.id === id);
    if (index === -1) return null;

    users[index] = { ...users[index], ...updates };
    setStored(STORAGE_KEYS.USERS, users);
    return users[index];
  }

  public deleteUser(id: string): boolean {
    const users = this.getUsers();
    const filtered = users.filter((u) => u.id !== id);
    if (filtered.length === users.length) return false;

    setStored(STORAGE_KEYS.USERS, filtered);
    this.logAction('USER_DELETED', `User account permanently deleted (ID: ${id})`, id);
    return true;
  }

  public incrementUsage(userId: string): number {
    const user = this.getUserById(userId);
    if (!user) return 0;

    const newUsage = (user.generationsUsedThisMonth || 0) + 1;
    this.updateUser(userId, { generationsUsedThisMonth: newUsage });
    return newUsage;
  }

  public grantBonusGenerations(userId: string, amount: number): void {
    const user = this.getUserById(userId);
    if (!user) return;

    const updatedBonus = (user.bonusGenerations || 0) + amount;
    this.updateUser(userId, { bonusGenerations: updatedBonus });
    this.logAction('BONUS_GENERATIONS_GRANTED', `Granted +${amount} bonus generations to ${user.name}`, userId);
  }

  public resetUsage(userId: string): void {
    const user = this.getUserById(userId);
    if (!user) return;

    this.updateUser(userId, { generationsUsedThisMonth: 0 });
    this.logAction('USAGE_RESET', `Monthly generation usage reset to 0 for ${user.name}`, userId);
  }

  /* =========================================================================
   * OUTPUTS / MY LIBRARY CRUD
   * ========================================================================= */
  public getOutputs(userId?: string): SavedOutput[] {
    const all = getStored<SavedOutput[]>(STORAGE_KEYS.OUTPUTS, SEED_OUTPUTS);
    if (!userId) return all;
    return all.filter((o) => o.userId === userId);
  }

  public saveOutput(output: Omit<SavedOutput, 'id' | 'createdAt' | 'updatedAt'>): SavedOutput {
    const outputs = this.getOutputs();
    const newOutput: SavedOutput = {
      ...output,
      id: `out_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    outputs.unshift(newOutput);
    setStored(STORAGE_KEYS.OUTPUTS, outputs);
    this.logAction('OUTPUT_SAVED', `Saved output "${newOutput.title}" (${newOutput.toolName})`, newOutput.userId);
    return newOutput;
  }

  public updateOutput(id: string, updates: Partial<SavedOutput>): SavedOutput | null {
    const outputs = this.getOutputs();
    const idx = outputs.findIndex((o) => o.id === id);
    if (idx === -1) return null;

    outputs[idx] = { ...outputs[idx], ...updates, updatedAt: new Date().toISOString() };
    setStored(STORAGE_KEYS.OUTPUTS, outputs);
    return outputs[idx];
  }

  public deleteOutput(id: string): boolean {
    const outputs = this.getOutputs();
    const filtered = outputs.filter((o) => o.id !== id);
    if (filtered.length === outputs.length) return false;

    setStored(STORAGE_KEYS.OUTPUTS, filtered);
    return true;
  }

  /* =========================================================================
   * INVOICES CRUD
   * ========================================================================= */
  public getInvoices(userId?: string): Invoice[] {
    const all = getStored<Invoice[]>(STORAGE_KEYS.INVOICES, SEED_INVOICES);
    if (!userId) return all;
    return all.filter((inv) => inv.userId === userId);
  }

  public addInvoice(invoice: Omit<Invoice, 'id' | 'pdfReceiptId'>): Invoice {
    const invoices = this.getInvoices();
    const newInvoice: Invoice = {
      ...invoice,
      id: `inv_${Date.now()}`,
      pdfReceiptId: `REC-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`,
    };
    invoices.unshift(newInvoice);
    setStored(STORAGE_KEYS.INVOICES, invoices);
    this.logAction('INVOICE_CREATED', `Invoice ${newInvoice.id} created for ${newInvoice.userName} ($${newInvoice.amount})`, newInvoice.userId);
    return newInvoice;
  }

  public updateInvoice(id: string, updates: Partial<Invoice>): Invoice | null {
    const invoices = this.getInvoices();
    const idx = invoices.findIndex((i) => i.id === id);
    if (idx === -1) return null;

    invoices[idx] = { ...invoices[idx], ...updates };
    setStored(STORAGE_KEYS.INVOICES, invoices);
    return invoices[idx];
  }

  /* =========================================================================
   * AUDIT LOG
   * ========================================================================= */
  public getAuditLogs(): AuditLogEntry[] {
    return getStored<AuditLogEntry[]>(STORAGE_KEYS.AUDIT_LOGS, SEED_AUDIT_LOGS);
  }

  public getUserActivity(userId: string): AuditLogEntry[] {
    const allLogs = this.getAuditLogs();

    // Filter matching logs: where targetUserId matches OR actorId matches
    const userLogs = allLogs.filter(
      (log) => log.targetUserId === userId || (log.actorId === userId && log.actorId !== 'system')
    );

    // If existing localStorage has no records or partial records for this user,
    // incorporate seed activities so demo users have an immediate, rich timeline
    const seedMatches = SEED_AUDIT_LOGS.filter(
      (log) => log.targetUserId === userId || log.actorId === userId
    );
    const existingIds = new Set(userLogs.map((l) => l.id));
    for (const seed of seedMatches) {
      if (!existingIds.has(seed.id)) {
        userLogs.push(seed);
      }
    }

    return userLogs.sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  }

  public logAction(action: string, details: string, targetUserId?: string): void {
    const logs = this.getAuditLogs();
    const currentUserId = localStorage.getItem(STORAGE_KEYS.CURRENT_USER_ID);
    const currentUser = currentUserId ? this.getUserById(currentUserId) : null;

    const newLog: AuditLogEntry = {
      id: `log_${Date.now()}`,
      timestamp: new Date().toISOString(),
      actorId: currentUser?.id || 'system',
      actorName: currentUser?.name || 'System / Admin',
      actorEmail: currentUser?.email || 'system@mill.agency',
      action,
      details,
      targetUserId,
    };

    logs.unshift(newLog);
    if (logs.length > 200) logs.pop(); // keep log bounded
    setStored(STORAGE_KEYS.AUDIT_LOGS, logs);
  }

  /* =========================================================================
   * ACCESS RULES (Allowlist / Blocklist)
   * ========================================================================= */
  public getAccessRules(): AccessRule[] {
    return getStored<AccessRule[]>(STORAGE_KEYS.ACCESS_RULES, SEED_ACCESS_RULES);
  }

  public addAccessRule(rule: Omit<AccessRule, 'id' | 'createdAt'>): AccessRule {
    const rules = this.getAccessRules();
    const newRule: AccessRule = {
      ...rule,
      id: `rule_${Date.now()}`,
      createdAt: new Date().toISOString(),
    };
    rules.push(newRule);
    setStored(STORAGE_KEYS.ACCESS_RULES, rules);
    this.logAction('ACCESS_RULE_ADDED', `Added ${newRule.type} rule: ${newRule.value}`);
    return newRule;
  }

  public deleteAccessRule(id: string): boolean {
    const rules = this.getAccessRules();
    const filtered = rules.filter((r) => r.id !== id);
    if (filtered.length === rules.length) return false;

    setStored(STORAGE_KEYS.ACCESS_RULES, filtered);
    this.logAction('ACCESS_RULE_DELETED', `Deleted access rule (ID: ${id})`);
    return true;
  }

  /* =========================================================================
   * PLANS & LIMITS (Dynamic config without code change)
   * ========================================================================= */
  public getPlans(): Plan[] {
    return getStored<Plan[]>(STORAGE_KEYS.PLANS, INITIAL_PLANS);
  }

  public updatePlan(planId: string, updates: Partial<Plan>): Plan | null {
    const plans = this.getPlans();
    const idx = plans.findIndex((p) => p.id === planId);
    if (idx === -1) return null;

    plans[idx] = { ...plans[idx], ...updates };
    setStored(STORAGE_KEYS.PLANS, plans);
    this.logAction('PLAN_UPDATED', `Updated configuration for plan "${plans[idx].name}"`);
    return plans[idx];
  }

  /* =========================================================================
   * TOOLS CONFIGURATION (Global / Per-Plan toggles)
   * ========================================================================= */
  public getTools(): ToolDefinition[] {
    return getStored<ToolDefinition[]>(STORAGE_KEYS.TOOLS, INITIAL_TOOLS);
  }

  public updateTool(toolId: string, updates: Partial<ToolDefinition>): ToolDefinition | null {
    const tools = this.getTools();
    const idx = tools.findIndex((t) => t.id === toolId);
    if (idx === -1) return null;

    tools[idx] = { ...tools[idx], ...updates };
    setStored(STORAGE_KEYS.TOOLS, tools);
    this.logAction('TOOL_CONFIG_UPDATED', `Updated tool configuration for "${tools[idx].name}"`);
    return tools[idx];
  }

  /* =========================================================================
   * AGENCY SETTINGS
   * ========================================================================= */
  public getSettings(): AgencySettings {
    return getStored<AgencySettings>(STORAGE_KEYS.SETTINGS, INITIAL_SETTINGS);
  }

  public updateSettings(updates: Partial<AgencySettings>): AgencySettings {
    const settings = this.getSettings();
    const updated = { ...settings, ...updates };
    setStored(STORAGE_KEYS.SETTINGS, updated);
    this.logAction('SETTINGS_UPDATED', `Updated agency branding and system settings`);
    return updated;
  }
}

export const dataService = new DataService();
