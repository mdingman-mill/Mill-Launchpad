import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const isProduction = process.env.NODE_ENV === 'production';

app.use(express.json({ limit: '10mb' }));

// Initialize Firebase Admin SDK
const firebaseConfig = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, 'firebase-applet-config.json'), 'utf8')
);

const firebaseApp = getApps().length
  ? getApps()[0]
  : initializeApp({ projectId: firebaseConfig.projectId });

const adminAuth = getAuth(firebaseApp);
const adminDb = getFirestore(firebaseApp, firebaseConfig.firestoreDatabaseId);

// Super admin emails from environment variable
const SUPER_ADMIN_EMAILS = (process.env.SUPER_ADMIN_EMAILS || 'mdingman@mill.agency,linda@mill.agency')
  .split(',')
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

// Per-user generation rate limit map (10 generations per minute)
const rateLimitMap = new Map<string, number[]>();
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const MAX_GENERATIONS_PER_MINUTE = 10;

function getNextMonthFirstDay(fromDate: Date = new Date()): string {
  const year = fromDate.getFullYear();
  const month = fromDate.getMonth();
  const nextMonth = new Date(year, month + 1, 1);
  const y = nextMonth.getFullYear();
  const m = String(nextMonth.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}-01`;
}

// Token verification helper
async function verifyFirebaseToken(req: express.Request): Promise<{ uid: string; email?: string; name?: string; picture?: string }> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new Error('Missing or invalid Authorization header');
  }
  const token = authHeader.split('Bearer ')[1]?.trim();
  if (!token) {
    throw new Error('Empty bearer token');
  }
  const decoded = await adminAuth.verifyIdToken(token);
  return {
    uid: decoded.uid,
    email: decoded.email,
    name: decoded.name,
    picture: decoded.picture,
  };
}

// Server-side Gemini initialization
const apiKey = process.env.GEMINI_API_KEY;
let ai: GoogleGenAI | null = null;
if (apiKey) {
  ai = new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

// Health check endpoint
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    geminiAvailable: !!apiKey,
    firebaseConfigured: true,
    timestamp: new Date().toISOString(),
  });
});

// Authentication Synchronization Endpoint: validates Firebase ID token and assigns super_admin role
app.post('/api/auth/sync', async (req, res) => {
  try {
    const verified = await verifyFirebaseToken(req);
    const email = (verified.email || '').toLowerCase();
    const isSuperAdmin = SUPER_ADMIN_EMAILS.includes(email);
    const role = isSuperAdmin ? 'super_admin' : 'member';

    const now = new Date().toISOString();
    const userRef = adminDb.collection('users').doc(verified.uid);

    let userData: any = null;
    try {
      const snap = await userRef.get();
      if (snap.exists) {
        const existing = snap.data()!;
        userData = {
          ...existing,
          email: verified.email || existing.email,
          name: verified.name || existing.name || email.split('@')[0],
          avatar: verified.picture || existing.avatar,
          role: isSuperAdmin ? 'super_admin' : (existing.role === 'super_admin' ? 'super_admin' : role),
          lastLogin: now,
        };
        await userRef.set(userData, { merge: true });
      }
    } catch (e: any) {
      console.warn('[Firestore Sync Read Warning]:', e.message);
    }

    if (!userData) {
      userData = {
        id: verified.uid,
        email: verified.email || '',
        name: verified.name || email.split('@')[0] || 'User',
        avatar: verified.picture || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(verified.name || email)}`,
        role,
        planId: 'free',
        status: 'active',
        generationsUsedThisMonth: 0,
        bonusGenerations: 0,
        billingResetDate: getNextMonthFirstDay(),
        nonprofitDiscountApproved: false,
        signupDate: now,
        lastLogin: now,
      };
      try {
        await userRef.set(userData, { merge: true });
      } catch (e: any) {
        console.warn('[Firestore Sync Write Warning]:', e.message);
      }
    }

    if (isSuperAdmin) {
      try {
        await adminDb.collection('admins').doc(verified.uid).set({
          id: verified.uid,
          email: verified.email,
          role: 'super_admin',
          createdAt: now,
        }, { merge: true });
      } catch (e: any) {
        console.warn('[Firestore Admin Registry Write Warning]:', e.message);
      }
    }

    return res.json({ user: userData });
  } catch (err: any) {
    console.error('[Auth Sync Error]', err.message);
    return res.status(401).json({ error: 'Unauthorized: Firebase ID token verification failed' });
  }
});

// Marketing Tool Generation Endpoint
app.post('/api/gemini/generate', async (req, res) => {
  const requestStartTime = Date.now();
  let verifiedUser: { uid: string; email?: string } | null = null;

  // 1. Verify Firebase ID Token
  try {
    verifiedUser = await verifyFirebaseToken(req);
  } catch (err: any) {
    return res.status(401).json({ error: 'Unauthorized: A valid Firebase ID token is required to generate marketing assets.' });
  }

  const userId = verifiedUser.uid;

  // 2. Per-user Rate Limiting (10 generations per minute)
  const now = Date.now();
  const userTimestamps = (rateLimitMap.get(userId) || []).filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  if (userTimestamps.length >= MAX_GENERATIONS_PER_MINUTE) {
    return res.status(429).json({
      error: 'Rate limit exceeded: You can make at most 10 generations per minute. Please wait a moment.',
    });
  }

  // 3. Check and increment monthly usage in a Firestore transaction
  const userRef = adminDb.collection('users').doc(userId);
  try {
    await adminDb.runTransaction(async (transaction) => {
      const snap = await transaction.get(userRef);
      let userData: any = null;
      if (snap.exists) {
        userData = snap.data();
      } else {
        userData = {
          id: userId,
          planId: 'free',
          generationsUsedThisMonth: 0,
          bonusGenerations: 0,
          billingResetDate: getNextMonthFirstDay(),
        };
      }

      const planId = userData.planId || 'free';
      const limits: Record<string, number> = { free: 50, pro: 500, team: 2000 };
      const planLimit = (limits[planId] || 50) + (userData.bonusGenerations || 0);

      // Check billing cycle reset
      let used = userData.generationsUsedThisMonth || 0;
      const todayStr = new Date().toISOString().split('T')[0];
      let resetDate = userData.billingResetDate;
      if (resetDate && todayStr >= resetDate) {
        used = 0;
        resetDate = getNextMonthFirstDay();
      }

      if (used >= planLimit) {
        const quotaErr = new Error(`Monthly generation quota reached (${used}/${planLimit} used). Upgrade to continue generating.`);
        (quotaErr as any).status = 403;
        throw quotaErr;
      }

      const newUsage = used + 1;
      transaction.set(userRef, {
        generationsUsedThisMonth: newUsage,
        billingResetDate: resetDate || getNextMonthFirstDay(),
        updatedAt: new Date().toISOString(),
      }, { merge: true });
    });
  } catch (txErr: any) {
    if (txErr.status === 403 || txErr.message?.includes('Monthly generation quota reached')) {
      console.warn(`[Quota Blocked] User ${userId} exceeded monthly generation limit.`);
      return res.status(403).json({ error: txErr.message });
    }
    console.warn(`[Usage Transaction Warning]: ${txErr.message}`);
  }

  // Record generation timestamp for rate limit sliding window
  userTimestamps.push(now);
  rateLimitMap.set(userId, userTimestamps);

  const { toolId, toolName, organizationProfile, userInputs } = req.body;
  console.log(`[Gemini Request] Started generation for "${toolName}" (${toolId}) by user ${userId} at ${new Date().toISOString()}`);

  try {
    const orgName = organizationProfile?.orgName || 'Our Organization';
    const orgType = organizationProfile?.type || 'Startup';
    const whatTheyDo = organizationProfile?.whatTheyDo || '';
    const audience = organizationProfile?.targetAudience || '';
    const goals = organizationProfile?.goals || [];
    const brandTone = organizationProfile?.brandTone?.join(', ') || 'Professional, Inspiring';
    const budget = organizationProfile?.budget || 'Under $500/month';

    const systemInstruction = `You are the Senior Marketing Strategist and Creative Director at Millennium Agency (mill.agency), an elite branding and growth agency.
You are generating real, production-ready, custom marketing assets for "${orgName}", a ${orgType}.

AGENCY QUALITY STANDARDS:
1. CUSTOM & SPECIFIC: Write REAL, compelling, finished copy tailored to this specific organization. Do NOT use generic placeholder templates (such as "[Pillar 1 Title]" or "[Insert problem here]")—write the actual thoughtful copy based on what this organization does!
2. GROUNDED & AUTHENTIC: Never invent fake awards, fake statistical studies, or fake client testimonials. Where a specific internal date, metric, or donor name will be required, use clear brackets such as [Insert Launch Date] or [$X Target].
3. BRAND VOICE: Match the requested brand tone: ${brandTone}. Be clear, punchy, persuasive, and encouraging.
4. STRUCTURE: Use clean Markdown with headers (##, ###), bullet points, and blockquotes so the deliverable is immediately usable.`;

    const toolPromptGuides: Record<string, string> = {
      'brand-foundations': `Deliver a complete Brand Foundations Blueprint:
1. Core Mission Statement (refined and inspiring)
2. Strategic Positioning Statement following the agency formula: "For [target audience] who [core need], ${orgName} is the [category] that [key benefit], unlike [alternatives] because [differentiator]."
3. Core Value Proposition with 3 distinct pillars written in full.
4. Three detailed Audience Personas (Decision Maker, Direct Supporter/User, Strategic Partner) with demographics, motivations, pain points, and specific tailored messages.`,

      'messaging-builder': `Deliver a complete Messaging & Pitch Toolkit:
1. Four Tagline Options (Empowerment, Action-Oriented, Outcome-Focused, Bold).
2. Three Timed Elevator Pitches written out in natural conversational language:
   - 15-Second Handshake Pitch (approx. 35 words)
   - 30-Second Networking Pitch (approx. 70 words)
   - 60-Second Executive Pitch (approx. 140 words)
3. Three Key Messaging Pillars with proof points and supporting arguments.`,

      '90-day-plan': `Deliver a realistic 12-Week Marketing Action Plan:
- Prioritize high-impact, low-cost organic channels matched to a budget of ${budget}.
- Month 1 (Weeks 1-4): Setup, messaging audit, direct outreach, and quick wins.
- Month 2 (Weeks 5-8): Content engine cadence, community engagement, and partner co-marketing.
- Month 3 (Weeks 9-12): Conversion sprint, campaign push toward primary 6-month goals, and review.
- Include weekly actionable tasks with estimated hours per week.`,

      'social-generator': `Deliver a ready-to-publish Multi-Platform Social Media Suite:
1. LinkedIn Post (thought-leadership, narrative hook, insight, and call to engagement).
2. Instagram Post (visual carousel slide-by-slide copy from Slide 1 Hook to Slide 5 CTA, with hashtags).
3. X / Twitter Thread (engaging 3-tweet hook and breakdown).
4. Facebook / Community Post (warm, community-focused update with celebration).
5. A 4-Week Thematic Content Calendar outline with weekly post topics.`,

      'email-writer': `Deliver an Email Campaign Suite:
1. Five high-open-rate Subject Line options (Curiosity, Benefit, Story, Urgency, Short).
2. Email 1: Welcome & Onboarding Note (warm, personal, setting expectations).
3. Email 2: Story / Impact / Behind-the-Scenes Spotlight (emotional or analytical proof of value).
4. Email 3: Direct Call-to-Action (driving signups, donations, or discovery calls).
Include sender notes and preview text for each email.`,

      'website-copy': `Deliver a Website Copy & SEO Blueprint:
1. SEO Title (under 60 chars) and Meta Description (under 155 chars) optimized for target keywords.
2. Homepage Hero Section: Punchy Headline (H1), compelling Subheadline (H2), Primary CTA button text, and Secondary CTA.
3. Problem & Solution Section: Explaining the status quo frustration and ${orgName}'s better approach.
4. Three Feature / Program Pillars written out with benefit-driven copy.
5. "About Us" Origin Hook: A powerful narrative introducing the founder's conviction and mission.`,

      'donor-appeal': `Deliver a Donor Appeal & Grant Narrative Blueprint:
1. Direct Donor Appeal Letter: Emotionally resonant, focused on human impact, transparent about funding needs, with clear giving tiers ($50, $150, $500).
2. Executive Grant Proposal Summary:
   - Project Title & Legal Entity
   - Statement of Need (grounded in community realities)
   - Program Methodology & Direct Service Delivery
   - Measurable Outputs & Outcomes
   - Long-Term Financial Sustainability.`,

      'pitch-launch': `Deliver an Investor Pitch Deck Narrative & Launch Script:
1. 10-Slide Pitch Flow:
   - Slide 1: Title & One-Liner
   - Slide 2: The Acute Problem
   - Slide 3: The Proprietary Solution
   - Slide 4: Market Size & Opportunity
   - Slide 5: Product & Unfair Advantage
   - Slide 6: Business & Monetization Model
   - Slide 7: Traction & Milestones
   - Slide 8: Go-To-Market Engine
   - Slide 9: Team & Superpowers
   - Slide 10: The Ask & Capital Allocation.
2. Product Hunt / Launch Day Announcement Copy.`,

      'keywords-content': `Deliver an SEO Keyword Bank & Content Strategy:
1. 20 High-Intent Keywords grouped by intent:
   - 5 Informational Keywords (Educational / How-To)
   - 5 Commercial Investigation Keywords (Comparison / Best Tools)
   - 5 Transactional Keywords (High Intent / Sign Up / Donate / Hire)
   - 5 Navigational & Branded Keywords.
2. 10 Evergreen Blog / Newsletter Titles with a 1-sentence outline angle for each.`,
    };

    const guide = toolPromptGuides[toolId] || 'Please produce a thorough, high-impact marketing deliverable formatted in clean markdown.';

    const userPrompt = `
DELIVERABLE REQUEST: "${toolName}" for ${orgName} (${orgType}).

ORGANIZATION DETAILS:
- Organization Name: ${orgName}
- Organization Type: ${orgType}
- Core Mission / What we do: ${whatTheyDo}
- Target Audience / Ideal Customer: ${audience}
- Top 6-Month Goals: ${Array.isArray(goals) ? goals.join('; ') : goals}
- Desired Brand Voice: ${brandTone}
- Monthly Marketing Budget: ${budget}

TOOL-SPECIFIC PARAMETERS PROVIDED BY USER:
${Object.entries(userInputs || {})
  .map(([k, v]) => `- ${k}: ${v}`)
  .join('\n')}

DELIVERABLE SPECIFICATIONS:
${guide}

Write the complete deliverable now in full, ready to be reviewed by the marketing team.`;

    const currentKey = process.env.GEMINI_API_KEY || apiKey;
    if (!currentKey) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders?.();
      res.write(
        `data: ${JSON.stringify({
          error: 'GEMINI_API_KEY is not configured on the server. Please check your environment configuration.',
        })}\n\n`
      );
      res.end();
      return;
    }

    // Setup Server-Sent Events headers for real-time text streaming
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    const sendEvent = (data: any) => {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    const genAI = new GoogleGenAI({
      apiKey: currentKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });

    // 3. Remove "gemini-3.8-flash" fallback. Use ONLY gemini-3.1-flash-lite, at most 1 retry, for 429/5xx only.
    const MODEL_NAME = 'gemini-3.1-flash-lite';
    const CALL_TIMEOUT_MS = 30000; // 30-second timeout per Gemini call
    let fullText = '';
    let callSucceeded = false;
    let lastError: any = null;

    // Helper to test if error is a rate-limit (429) or server (5xx) error
    const isRateLimitOrServerError = (err: any): boolean => {
      if (!err) return false;
      if (err.name === 'TimeoutError' || err.message === 'Generation took too long, please try again') {
        return false;
      }
      const status = err.status || err.statusCode || err.code;
      if (status === 429 || (typeof status === 'number' && status >= 500 && status < 600)) {
        return true;
      }
      const msg = (err.message || String(err)).toLowerCase();
      return (
        msg.includes('429') ||
        msg.includes('resource_exhausted') ||
        msg.includes('rate limit') ||
        msg.includes('500') ||
        msg.includes('502') ||
        msg.includes('503') ||
        msg.includes('504') ||
        msg.includes('unavailable') ||
        msg.includes('internal error') ||
        msg.includes('server error')
      );
    };

    // At most 1 retry (maximum 2 attempts) for rate-limit (429) or server (5xx) errors
    for (let attempt = 1; attempt <= 2; attempt++) {
      const callStartTime = Date.now();
      console.log(`[Gemini Call] Starting call to ${MODEL_NAME} (attempt ${attempt}/2, thinkingLevel: LOW, 30s timeout)...`);

      let timerId: NodeJS.Timeout | null = null;
      let isTimedOut = false;

      try {
        // 2. 30-second timeout per Gemini call
        const timeoutPromise = new Promise<never>((_, reject) => {
          timerId = setTimeout(() => {
            isTimedOut = true;
            const err = new Error('Generation took too long, please try again');
            err.name = 'TimeoutError';
            reject(err);
          }, CALL_TIMEOUT_MS);
        });

        // 4. Switch to streaming (generateContentStream)
        const executeStream = async (): Promise<string> => {
          const responseStream = await genAI.models.generateContentStream({
            model: MODEL_NAME,
            contents: userPrompt,
            config: {
              systemInstruction,
              // 1. Set a low thinking level on the Gemini call to cut latency
              thinkingConfig: {
                thinkingLevel: ThinkingLevel.LOW,
              },
            },
          });

          let streamedText = '';
          for await (const chunk of responseStream) {
            if (isTimedOut) {
              const err = new Error('Generation took too long, please try again');
              err.name = 'TimeoutError';
              throw err;
            }
            const textChunk = chunk.text;
            if (textChunk) {
              streamedText += textChunk;
              sendEvent({ chunk: textChunk });
            }
          }
          return streamedText;
        };

        fullText = await Promise.race([executeStream(), timeoutPromise]);

        if (timerId) clearTimeout(timerId);

        // 5. Log the duration of each Gemini call
        const callDuration = Date.now() - callStartTime;
        console.log(`[Gemini Call] Attempt ${attempt} finished in ${callDuration}ms (${(callDuration / 1000).toFixed(2)}s) with ${fullText.length} characters`);

        callSucceeded = true;
        break;
      } catch (err: any) {
        if (timerId) clearTimeout(timerId);
        const callDuration = Date.now() - callStartTime;
        console.warn(`[Gemini Call] Attempt ${attempt} failed after ${callDuration}ms:`, err?.message || err);
        lastError = err;

        // If timed out, do not retry
        if (err.name === 'TimeoutError' || err.message === 'Generation took too long, please try again') {
          console.warn(`[Gemini Call] 30s timeout reached. Aborting without retry.`);
          break;
        }

        // Only retry for 429 or 5xx errors, at most 1 retry
        if (attempt === 1 && isRateLimitOrServerError(err)) {
          console.log(`[Gemini Call] Error is rate-limit (429) or server (5xx). Retrying (attempt 2/2) after 1000ms...`);
          sendEvent({ reset: true });
          await new Promise((r) => setTimeout(r, 1000));
          fullText = '';
          continue;
        }

        // Otherwise (non-retryable error or attempt 2 failed), stop
        break;
      }
    }

    // 5. Log the total request time
    const totalRequestTime = Date.now() - requestStartTime;
    console.log(`[Gemini Request] Total request time for "${toolName}": ${totalRequestTime}ms (${(totalRequestTime / 1000).toFixed(2)}s)`);

    if (callSucceeded && fullText) {
      sendEvent({
        done: true,
        modelUsed: MODEL_NAME,
        text: fullText,
      });
      res.end();
    } else {
      const errorMessage =
        lastError?.name === 'TimeoutError' || lastError?.message === 'Generation took too long, please try again'
          ? 'Generation took too long, please try again'
          : lastError?.message || 'Failed to generate content. Please try again.';

      console.error(`[Gemini Request] Returning error to client: ${errorMessage}`);
      sendEvent({ error: errorMessage });
      res.end();
    }
  } catch (error: any) {
    const totalRequestTime = Date.now() - requestStartTime;
    console.error(`[Gemini Request] Unexpected error after ${totalRequestTime}ms:`, error);
    const errorMessage =
      error?.name === 'TimeoutError' || error?.message === 'Generation took too long, please try again'
        ? 'Generation took too long, please try again'
        : `Gemini Generation Error: ${error?.message || 'Server error. Please try again.'}`;

    if (!res.headersSent) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders?.();
    }
    res.write(`data: ${JSON.stringify({ error: errorMessage })}\n\n`);
    res.end();
  }
});

function generateFallbackContent(
  toolId: string,
  toolName: string,
  orgName: string,
  orgType: string,
  brandTone: string,
  inputs: any = {}
): string {
  const isNonprofit = orgType?.toLowerCase() === 'nonprofit';

  switch (toolId) {
    case 'brand-foundations':
      return `## Brand Foundations Blueprint: ${orgName}

### 1. Mission Statement
${orgName} empowers [community/target audience] by providing [primary solution/program], ensuring that [ultimate transformative outcome] becomes an accessible reality.

### 2. Positioning Statement
For [target audience] who struggle with [core problem/need], **${orgName}** is the [category definition] that delivers [unique key benefit], unlike [status quo/alternatives] because of our [distinct advantage or proprietary approach].

### 3. Core Value Proposition
- **Clarity Over Complexity:** We cut through the noise with [direct approach].
- **Proven Impact:** Grounded in measurable outcomes for [key group].
- **Community-First Delivery:** Designed alongside the people we serve.

### 4. Audience Personas

#### Persona A: The Champion / Primary Decision-Maker
- **Role:** Executive Director / Founder / Primary Buyer
- **Core Motivation:** Maximizing return on every dollar and minute invested.
- **Pain Point:** Lack of bandwidth and fear of misallocating scarce resources.
- **Key Message:** "${orgName} provides immediate peace of mind and measurable progress."

#### Persona B: The Grassroots Supporter / Everyday User
- **Role:** Program Participant / Early Adopter / Monthly Donor
- **Core Motivation:** Being part of an authentic mission that makes tangible change.
- **Pain Point:** Inconsistent communication and vague updates.
- **Key Message:** "Your active involvement directly changes [specific outcome]."

#### Persona C: The Strategic Partner
- **Role:** Grantor / Corporate Sponsor / Alliance Partner
- **Core Motivation:** Verifiable accountability and alignment with broader ESG/growth goals.
- **Pain Point:** Lack of transparent metrics or professional reporting.
- **Key Message:** "Partner with ${orgName} to scale verified impact in [geographic/domain area]."`;

    case 'messaging-builder':
      return `## Messaging & Pitch Kit: ${orgName}

### Tagline Options
1. **Bold:** Impact That Speaks for Itself.
2. **Action-Oriented:** Building the Future of [Domain], Together.
3. **Approachable:** Better [Solution]. Real Results. No Guesswork.

---

### Elevator Pitches

#### 15-Second Pitch (The Handshake)
"${orgName} helps [primary audience] overcome [core hurdle] through [differentiating method]—so they can achieve [highest priority goal] without [common friction]."

#### 30-Second Pitch (The Networking Standard)
"Most [startups / nonprofits] in our space struggle with [major obstacle]. At ${orgName}, we solved this by developing [key solution]. Today, we help [target group] streamline [key activity], resulting in [quantifiable target placeholder, e.g. 40% time savings]. We're currently expanding to reach [next milestone]."

#### 60-Second Pitch (The Executive Overview)
"When you look at [industry/social issue], the biggest gap isn't passion—it's execution. [Target demographic] is frequently held back by [status quo problem].

${orgName} was created to change that dynamic. By combining [Approach 1] with [Approach 2], we provide an end-to-end framework that makes [desired result] predictable.

Over the past year, we've demonstrated that [key proof point]. We are now actively scaling our [program/product], and we're looking to connect with [ideal partner or customer] who share our dedication to [vision]."

---

### 3 Key Pillars & Proof Points
1. **Pillar 1: Accessibility & Simplicity**
   - *Proof Point:* Designed for immediate adoption with zero steep learning curve.
2. **Pillar 2: Verifiable Accountability**
   - *Proof Point:* Backed by [transparent reporting mechanism / client reviews].
3. **Pillar 3: Long-Term Sustainability**
   - *Proof Point:* Every initiative is built to endure beyond short-term funding cycles.`;

    case '90-day-plan':
      return `## 90-Day Low-Cost Growth & Marketing Plan

### Month 1: Foundation & Low-Hanging Fruit
- **Week 1-2 (Audit & Setup):**
  - Verify Google Business Profile and LinkedIn organization page.
  - Set up clean email capture on the homepage with an ethical bribe (e.g. 1-page Checklist).
- **Week 3-4 (Direct Outreach):**
  - Draft personalized email outreach to 25 warm past supporters or industry peers.
  - Publish 2 foundational thought-leadership posts highlighting [Core Mission].

### Month 2: Cadence & Community Traction
- **Week 5-6 (Content Engine):**
  - Launch bi-weekly newsletter sharing 1 practical tip and 1 behind-the-scenes story.
  - Distribute a press release or local media pitch focused on [new initiative].
- **Week 7-8 (Partnership Co-Marketing):**
  - Identify 3 non-competing partner organizations for reciprocal newsletter shoutouts or guest webinars.
  - Host a free 45-minute virtual Q&A session.

### Month 3: Conversion & Optimization
- **Week 9-10 (Campaign Sprint):**
  - Execute a targeted 2-week mini-campaign focused on [6-Month Goal #1].
  - Leverage testimonials and quotes from [early participant/customer].
- **Week 11-12 (Review & Next Horizon):**
  - Analyze top traffic sources and conversion rates.
  - Double down on the single highest-performing channel (LinkedIn vs Email vs Direct Outreach).`;

    case 'social-generator':
      return `## Multi-Platform Social Post Suite & 4-Week Calendar

### Platform Posts

#### 1. LinkedIn (Thought Leadership)
> The biggest misconception in [our industry] is that [common myth].
>
> In reality, [insightful counter-truth].
>
> At ${orgName}, we've learned that focusing on [Core Value] produces 3 unexpected advantages:
> 1. [Advantage One]
> 2. [Advantage Two]
> 3. [Advantage Three]
>
> What has been your experience dealing with [Topic]? Drop your thoughts below. 👇
>
> #Leadership #Innovation #${orgType} #Growth

#### 2. Instagram (Visual Storytelling & Carousel Copy)
> **Slide 1:** Stop trying to fix [problem] the old way.
> **Slide 2:** Here is what 90% of people overlook: [Key Insight].
> **Slide 3:** When ${orgName} stepped in, the focus shifted to [Solution].
> **Slide 4:** Save this post for your next planning session. Link in bio to learn more!

#### 3. X / Twitter (Punchy Thread Hook)
> 1/5 The hardest part of [industry problem] isn’t what you think. It's [surprising element]. Here is how ${orgName} approaches it: 🧵

#### 4. Facebook (Community Focus)
> We're proud to share an update from ${orgName}! This week, our team focused on [recent milestone], ensuring [community benefit]. Thank you to everyone standing with us on this journey!

---

### 4-Week Social Calendar Outline
- **Week 1:** Educational breakdown of [Top Problem].
- **Week 2:** Spotlight on someone impacted by [Our Mission].
- **Week 3:** Practical checklist / how-to tip.
- **Week 4:** Direct call-to-action (Subscribe, Donate, or Book a Discovery Call).`;

    case 'email-writer':
      return `## Email Campaign Kit: ${orgName}

### Subject Line Options
- **Curiosity:** "The one thing nobody told us about [Industry Topic]..."
- **Direct:** "How ${orgName} is tackling [Specific Hurdle]"
- **Inspiring:** "A quick note of gratitude (and what's next)"

---

### Email 1: Welcome / Orientation
**Subject:** Welcome to ${orgName} – here's what to expect!

Hi [First Name],

Welcome! When we launched ${orgName}, our goal was straightforward: make [Core Benefit] accessible to [Target Audience], without the typical headaches.

Here are two quick ways to make the most of our community:
1. **Explore [Resource #1]:** A quick 3-minute guide to [Topic].
2. **Tell us your biggest challenge:** Reply directly to this email—our team reads every response.

We’re thrilled to have you with us.

Warmly,
The ${orgName} Team

---

### Email 2: High-Impact Announcement / Story
**Subject:** Behind the scenes: What we learned this month

Hi [First Name],

Last week, we hit a notable milestone: [Describe event or program achievement].

Behind that milestone is a simple lesson: when you stay focused on [Core Mission], great things follow.

If you know someone in need of [Service/Solution], feel free to forward this note!

Best regards,
[Your Name / Title]`;

    case 'website-copy':
      return `## Website Copy & SEO Blueprint

### SEO Metadata
- **SEO Title:** ${orgName} | [Primary Benefit & Category Keyword]
- **Meta Description:** Discover how ${orgName} helps [Target Audience] achieve [Key Outcome] with [Differentiator]. Explore our programs and start today.

---

### Homepage Copy

#### Hero Section
- **Headline (H1):** The Smarter Way to [Achieve Desired Result].
- **Subheadline:** ${orgName} provides [core solution] tailored for [target audience], so you can move forward with confidence.
- **Primary CTA Button:** [Get Started Today / Join Our Mission]
- **Secondary CTA:** [Learn How It Works]

#### Problem & Solution Section (H2)
- **Heading:** Why Traditional Approaches Fall Short
- **Body:** Most people encounter [Frustration A] and [Frustration B]. We engineered ${orgName} to remove the obstacles, delivering [Concrete Outcome].

#### Three Pillar Features
1. **[Pillar 1 Title]:** Brief sentence explaining benefit.
2. **[Pillar 2 Title]:** Brief sentence explaining benefit.
3. **[Pillar 3 Title]:** Brief sentence explaining benefit.

---

### About Page Story Hook
"${orgName} was founded with a singular conviction: that [core belief]. What started as [brief origin] has evolved into a dedicated team serving [audience]. Here is why we do it..."`;

    case 'donor-appeal':
    case 'pitch-launch':
      if (isNonprofit) {
        return `## Donor Appeal & Grant Narrative Blueprint

### 1. Direct Donor Appeal Letter
**Salutation:** Dear [Supporter Name / Friend of ${orgName}],

Right now, [number or group] in our community are facing [pressing reality]. While the challenges are real, there is proven hope.

At ${orgName}, your gift doesn't sit on the sidelines. Every $[Amount] directly funds [specific outcome or program supply].

Last year alone, our supporters helped [accomplishment placeholder, e.g. deliver 500 hours of direct mentoring]. But as we enter the next quarter, demand has grown by [X]%.

Will you consider a special gift of $[50 / $100 / $250] today to keep this vital work moving forward?

With deep gratitude,
[Executive Director Name]
${orgName}

---

### 2. Grant Narrative Executive Summary
- **Organization Legal Name:** ${orgName}
- **Project Title:** [Initiative Name: Expanding Access to Key Program]
- **Statement of Need:** In our target service area, [quantified need placeholder]. Existing infrastructure fails to address [specific gap].
- **Proposed Methodology:** ${orgName} utilizes a proven three-phase model: Intake, Direct Service Delivery, and Longitudinal Outcome Tracking.
- **Expected Outcomes:** [Output metric 1, e.g. 200 participants trained]; [Outcome metric 2, e.g. 85% completion rate].
- **Sustainability Plan:** Multi-channel revenue strategy including private philanthropy, earned revenue, and municipal partnerships.`;
      } else {
        return `## Startup Pitch Deck Narrative & Launch Script

### 1. The 10-Slide Pitch Flow
- **Slide 1: Title:** ${orgName} – The next generation of [Category].
- **Slide 2: Problem:** [Target Customer] spends $[X] and [Y] hours per month struggling with [Core Friction].
- **Slide 3: Solution:** ${orgName} automates and streamlines [Process] with [Unique IP/Secret Sauce].
- **Slide 4: Market Size:** TAM $[X]B, SAM $[Y]M, SOM $[Z]M.
- **Slide 5: Product Demo / Screenshots:** Showing the 3-step magic workflow.
- **Slide 6: Business Model:** Recurring subscription ($[X]/mo tier) with [LTV:CAC ratio placeholder].
- **Slide 7: Go-To-Market:** Direct inbound content, strategic agency channel partners, targeted founder communities.
- **Slide 8: Traction & Milestones:** [X] beta waitlist users, [Y] pilot signups, positive feedback.
- **Slide 9: Team:** Seasoned operators with domain background in [Field].
- **Slide 10: The Ask:** Raising $[Amount] to accelerate product velocity and reach $[Target ARR] within 12 months.

---

### 2. Product Hunt / Launch Day Teaser
> 🚀 Excited to announce the launch of ${orgName}!
>
> We built this because we were tired of [annoying industry status quo].
>
> With ${orgName}, you can [achieve Key Benefit] in under 5 minutes.
>
> We're offering our early community 25% off for life. Check out the link and let us know what you think!`;
      }

    case 'keywords-content':
      return `## SEO Keyword Bank & 10 High-Intent Blog Topics

### 20 Curated Keywords Grouped by Intent

#### 1. Informational Intent (Top of Funnel - Educational)
1. "how to improve [industry process]"
2. "what is [key industry term]"
3. "guide to [target problem] for beginners"
4. "best practices for [audience] in 2026"
5. "common mistakes when starting [activity]"

#### 2. Commercial Investigation (Middle of Funnel - Comparison)
6. "top tools for [target audience]"
7. "${orgName} vs [general alternative]"
8. "best low-cost solutions for [problem]"
9. "reviews of modern [category] software"
10. "checklist before choosing a [service provider]"

#### 3. Transactional Intent (Bottom of Funnel - High Buyer Intent)
11. "hire [service type] for ${orgType.toLowerCase()}"
12. "affordable [software/service] pricing"
13. "sign up for [key program]"
14. "buy [primary product] online"
15. "schedule consultation for [domain]"

#### 4. Navigational & Branded Intent
16. "${orgName} login"
17. "${orgName} customer reviews"
18. "${orgName} programs"
19. "${orgName} contact"
20. "${orgName} support"

---

### 10 Evergreen Blog & Newsletter Topics
1. **The Ultimate Blueprint:** How to solve [Core Problem] without spending a fortune.
2. **Case in Point:** What happens when you rethink [Status Quo Habit].
3. **The 10-Minute Audit:** Is your current [Strategy] actually working?
4. **Behind the Curtain:** Why ${orgName} decided to build things differently.
5. **Debunked:** 5 pervasive myths about [Industry Topic] holding you back.
6. **Step-by-Step:** The beginner's guide to achieving [Desirable Milestone].
7. **Budget Friendly:** How to stretch every dollar in your [Department].
8. **Interview / Profile:** Lessons from a leader in [Sector].
9. **Trend Forecast:** What the next 2 years hold for [Niche].
10. **Resource Round-up:** Our top 7 free tools for [Audience].`;

    default:
      return `## Generated Marketing Strategy: ${toolName} for ${orgName}

### Executive Overview
This deliverable has been tailored for **${orgName}** (${orgType}), calibrated for a brand tone of **${brandTone}**.

### Strategic Recommendations
1. **Immediate Execution:** Implement the primary recommendation within 7 business days to validate response.
2. **Measurement:** Track click-through rates and engagement against baseline [Historical Baseline Placeholder].
3. **Iteration:** Refine messaging every 30 days based on direct customer / donor feedback.`;
  }
}

// Vite or Static Serving
async function startServer() {
  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Millennium Agency Launchpad server running at http://0.0.0.0:${PORT}`);
  });
}

startServer();
