import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import { initializeApp, getApps, cert, type App } from 'firebase-admin/app';
import { getAuth, type Auth } from 'firebase-admin/auth';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';

dotenv.config();

interface FirebaseAppletConfig {
  projectId: string;
  firestoreDatabaseId?: string;
}

function loadFirebaseConfig(): FirebaseAppletConfig {
  const candidatePaths: string[] = [
    path.resolve(process.cwd(), 'firebase-applet-config.json'),
  ];

  try {
    const currentFile = fileURLToPath(import.meta.url);
    const currentDir = path.dirname(currentFile);
    candidatePaths.push(
      path.resolve(currentDir, '../firebase-applet-config.json'),
      path.resolve(currentDir, '../../firebase-applet-config.json'),
      path.resolve(currentDir, 'firebase-applet-config.json')
    );
  } catch {
    // ignore if import.meta.url unavailable in CJS/bundled context
  }

  for (const candidate of candidatePaths) {
    if (fs.existsSync(candidate)) {
      const parsed = JSON.parse(fs.readFileSync(candidate, 'utf8'));
      return {
        projectId: process.env.FIREBASE_PROJECT_ID || parsed.projectId,
        firestoreDatabaseId: process.env.FIREBASE_DATABASE_ID || parsed.firestoreDatabaseId,
      };
    }
  }

  if (process.env.FIREBASE_PROJECT_ID) {
    return {
      projectId: process.env.FIREBASE_PROJECT_ID,
      firestoreDatabaseId: process.env.FIREBASE_DATABASE_ID,
    };
  }

  throw new Error('firebase-applet-config.json not found and FIREBASE_PROJECT_ID is not set.');
}

function parseServiceAccountFromEnv(): Record<string, any> | null {
  const rawJsonOrBase64 = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (rawJsonOrBase64 && rawJsonOrBase64.trim()) {
    const trimmed = rawJsonOrBase64.trim();
    try {
      if (trimmed.startsWith('{')) {
        return JSON.parse(trimmed);
      }
      const decoded = Buffer.from(trimmed, 'base64').toString('utf8');
      return JSON.parse(decoded);
    } catch (err: any) {
      console.error('[Firebase Admin] Failed to parse FIREBASE_SERVICE_ACCOUNT_KEY:', err.message);
    }
  }

  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY;
  const projectId = process.env.FIREBASE_PROJECT_ID;
  if (clientEmail && privateKey) {
    return {
      project_id: projectId,
      client_email: clientEmail.trim(),
      private_key: privateKey.replace(/\\n/g, '\n'),
    };
  }

  return null;
}

const firebaseConfig = loadFirebaseConfig();

function initAdminApp(): App {
  if (getApps().length > 0) {
    return getApps()[0];
  }

  const serviceAccount = parseServiceAccountFromEnv();
  if (serviceAccount) {
    const resolvedProjectId = serviceAccount.project_id || firebaseConfig.projectId;
    return initializeApp({
      credential: cert(serviceAccount as any),
      projectId: resolvedProjectId,
    });
  }

  return initializeApp({ projectId: firebaseConfig.projectId });
}

export const firebaseApp: App = initAdminApp();
export const adminAuth: Auth = getAuth(firebaseApp);
export const adminDb: Firestore = firebaseConfig.firestoreDatabaseId
  ? getFirestore(firebaseApp, firebaseConfig.firestoreDatabaseId)
  : getFirestore(firebaseApp);

// Super admin emails from environment variable
const rawSuperAdminEmails = process.env.SUPER_ADMIN_EMAILS;
if (!rawSuperAdminEmails || !rawSuperAdminEmails.trim()) {
  console.warn('SUPER_ADMIN_EMAILS not set; no users assigned super_admin role');
}
export const SUPER_ADMIN_EMAILS = (rawSuperAdminEmails || '')
  .split(',')
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

// Per-user generation rate limit map (10 generations per minute)
const rateLimitMap = new Map<string, number[]>();
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const MAX_GENERATIONS_PER_MINUTE = 10;

export function getNextMonthFirstDay(fromDate: Date = new Date()): string {
  const year = fromDate.getFullYear();
  const month = fromDate.getMonth();
  const nextMonth = new Date(year, month + 1, 1);
  const y = nextMonth.getFullYear();
  const m = String(nextMonth.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}-01`;
}

export interface VerifiedActor {
  uid: string;
  email?: string;
  name?: string;
  picture?: string;
}

export async function verifyBearerToken(authHeader?: string | null): Promise<VerifiedActor> {
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

export function getHealthStatus() {
  const apiKey = process.env.GEMINI_API_KEY;
  return {
    status: 'ok',
    geminiAvailable: !!apiKey,
    firebaseConfigured: true,
    timestamp: new Date().toISOString(),
  };
}

export async function logServerAudit(
  action: string,
  details: string,
  actor: { uid: string; email?: string; name?: string },
  targetUserId?: string
): Promise<void> {
  try {
    const id = `log_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const entry = {
      id,
      timestamp: new Date().toISOString(),
      actorId: actor.uid,
      actorEmail: actor.email || 'system@mill.agency',
      actorName: actor.name || (actor.email ? actor.email.split('@')[0] : 'System'),
      action,
      details,
      targetUserId: targetUserId || actor.uid,
    };
    await adminDb.collection('auditLogs').doc(id).set(entry);
  } catch (err: any) {
    console.warn('[Audit Log Write Warning]:', err.message);
  }
}

export interface HandlerResponse {
  status: number;
  body: Record<string, any>;
}

export async function handleAuthSync(authHeader?: string | null): Promise<HandlerResponse> {
  try {
    const verified = await verifyBearerToken(authHeader);
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

    // Check for pending, unexpired invite matching user's exact email
    try {
      const inviteSnap = await adminDb
        .collection('invites')
        .where('email', '==', email)
        .where('status', '==', 'pending')
        .get();

      if (!inviteSnap.empty) {
        for (const doc of inviteSnap.docs) {
          const inv = doc.data();
          const expiresAt = inv.expiresAt;
          if (expiresAt && new Date(expiresAt).getTime() <= Date.now()) {
            await doc.ref.update({ status: 'expired' });
          } else {
            userData.planId = 'complimentary';
            await userRef.set({ planId: 'complimentary', updatedAt: now }, { merge: true });
            await doc.ref.update({
              status: 'accepted',
              acceptedAt: now,
              acceptedBy: verified.uid,
            });
            await logServerAudit('INVITE_ACCEPTED', `Accepted complimentary access invite for ${email}`, verified, verified.uid);
            await logServerAudit('PLAN_CHANGED', `Plan changed to complimentary for ${email} via invite`, verified, verified.uid);
            break;
          }
        }
      }
    } catch (invErr: any) {
      console.warn('[Invite Check Warning]:', invErr.message);
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

    return { status: 200, body: { user: userData } };
  } catch (err: any) {
    console.error('[Auth Sync Error]', err.message);
    return { status: 401, body: { error: 'Unauthorized: Firebase ID token verification failed' } };
  }
}

export async function handleListInvites(authHeader?: string | null): Promise<HandlerResponse> {
  try {
    const verified = await verifyBearerToken(authHeader);
    const email = (verified.email || '').toLowerCase();
    if (!SUPER_ADMIN_EMAILS.includes(email)) {
      return { status: 403, body: { error: 'Forbidden: Super admin privileges required' } };
    }

    const snap = await adminDb.collection('invites').get();
    const invites: any[] = [];
    const now = Date.now();

    for (const doc of snap.docs) {
      const data = doc.data();
      let status = data.status || 'pending';
      if (status === 'pending' && data.expiresAt && new Date(data.expiresAt).getTime() <= now) {
        status = 'expired';
        await doc.ref.update({ status: 'expired' });
      }
      invites.push({
        id: doc.id,
        ...data,
        status,
      });
    }

    invites.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
    return { status: 200, body: { invites } };
  } catch (err: any) {
    return { status: 500, body: { error: err.message } };
  }
}

export async function handleCreateInvite(authHeader?: string | null, body?: any): Promise<HandlerResponse> {
  try {
    const verified = await verifyBearerToken(authHeader);
    const superAdminEmail = (verified.email || '').toLowerCase();
    if (!SUPER_ADMIN_EMAILS.includes(superAdminEmail)) {
      return { status: 403, body: { error: 'Forbidden: Super admin privileges required' } };
    }

    const { email, note, expiresAt } = body || {};
    if (!email || typeof email !== 'string' || !email.includes('@')) {
      return { status: 400, body: { error: 'Valid email address is required' } };
    }

    const cleanEmail = email.trim().toLowerCase();
    const now = new Date().toISOString();
    const inviteRef = adminDb.collection('invites').doc();

    const inviteData = {
      id: inviteRef.id,
      email: cleanEmail,
      plan: 'complimentary',
      status: 'pending',
      createdBy: verified.uid,
      createdByEmail: verified.email || '',
      createdAt: now,
      expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
      note: note ? String(note).trim() : '',
    };

    await inviteRef.set(inviteData);

    await logServerAudit(
      'INVITE_CREATED',
      `Created complimentary access invite for ${cleanEmail}${expiresAt ? ` (expires ${expiresAt})` : ''}`,
      verified
    );

    return { status: 200, body: { invite: inviteData } };
  } catch (err: any) {
    return { status: 500, body: { error: err.message } };
  }
}

export async function handleRevokeInvite(authHeader?: string | null, inviteId?: string): Promise<HandlerResponse> {
  try {
    const verified = await verifyBearerToken(authHeader);
    const superAdminEmail = (verified.email || '').toLowerCase();
    if (!SUPER_ADMIN_EMAILS.includes(superAdminEmail)) {
      return { status: 403, body: { error: 'Forbidden: Super admin privileges required' } };
    }

    if (!inviteId) {
      return { status: 400, body: { error: 'Invite ID is required' } };
    }

    const inviteRef = adminDb.collection('invites').doc(inviteId);
    const snap = await inviteRef.get();
    if (!snap.exists) {
      return { status: 404, body: { error: 'Invite not found' } };
    }

    const invData = snap.data()!;
    const now = new Date().toISOString();

    await inviteRef.update({
      status: 'revoked',
      revokedAt: now,
      revokedBy: verified.uid,
    });

    const userQuery = await adminDb
      .collection('users')
      .where('email', '==', invData.email.toLowerCase())
      .get();

    for (const uDoc of userQuery.docs) {
      const uData = uDoc.data();
      if (uData.planId === 'complimentary') {
        await uDoc.ref.update({
          planId: 'free',
          updatedAt: now,
        });
        await logServerAudit(
          'PLAN_CHANGED',
          `Plan reverted to free due to invite revocation for ${invData.email}`,
          verified,
          uDoc.id
        );
      }
    }

    await logServerAudit(
      'INVITE_REVOKED',
      `Revoked complimentary access invite for ${invData.email}`,
      verified
    );

    return { status: 200, body: { success: true } };
  } catch (err: any) {
    return { status: 500, body: { error: err.message } };
  }
}

export async function handleGetInvite(inviteId?: string): Promise<HandlerResponse> {
  try {
    if (!inviteId) {
      return { status: 400, body: { error: 'Invite ID is required' } };
    }
    const inviteRef = adminDb.collection('invites').doc(inviteId);
    const snap = await inviteRef.get();
    if (!snap.exists) {
      return { status: 404, body: { error: 'Invite not found' } };
    }

    const data = snap.data()!;
    const now = Date.now();
    let status = data.status || 'pending';
    if (status === 'pending' && data.expiresAt && new Date(data.expiresAt).getTime() <= now) {
      status = 'expired';
    }

    return {
      status: 200,
      body: {
        invite: {
          id: snap.id,
          email: data.email,
          plan: data.plan,
          status,
          note: data.note,
          expiresAt: data.expiresAt,
          createdAt: data.createdAt,
        },
      },
    };
  } catch (err: any) {
    return { status: 500, body: { error: err.message } };
  }
}

export async function handleAcceptInvite(authHeader?: string | null, inviteId?: string): Promise<HandlerResponse> {
  try {
    const verified = await verifyBearerToken(authHeader);
    const userEmail = (verified.email || '').toLowerCase();
    if (!inviteId) {
      return { status: 400, body: { error: 'Invite ID is required' } };
    }

    const inviteRef = adminDb.collection('invites').doc(inviteId);
    const snap = await inviteRef.get();
    if (!snap.exists) {
      return { status: 404, body: { error: 'Invite not found' } };
    }

    const invData = snap.data()!;
    if (invData.email.toLowerCase() !== userEmail) {
      return {
        status: 403,
        body: {
          error: `This invite was sent to ${invData.email}. You are signed in as ${userEmail}. Please sign in with the invited email address.`,
        },
      };
    }

    const now = new Date().toISOString();
    if (invData.expiresAt && new Date(invData.expiresAt).getTime() <= Date.now()) {
      await inviteRef.update({ status: 'expired' });
      return { status: 400, body: { error: 'This invitation has expired.' } };
    }

    if (invData.status === 'revoked') {
      return { status: 400, body: { error: 'This invitation has been revoked.' } };
    }

    const userRef = adminDb.collection('users').doc(verified.uid);
    await userRef.set({
      planId: 'complimentary',
      updatedAt: now,
    }, { merge: true });

    await inviteRef.update({
      status: 'accepted',
      acceptedAt: now,
      acceptedBy: verified.uid,
    });

    await logServerAudit('INVITE_ACCEPTED', `User ${userEmail} accepted complimentary access invite ${inviteId}`, verified, verified.uid);
    await logServerAudit('PLAN_CHANGED', `Plan changed to complimentary for ${userEmail} via invite ${inviteId}`, verified, verified.uid);

    const userSnap = await userRef.get();
    return { status: 200, body: { success: true, user: userSnap.data() } };
  } catch (err: any) {
    return { status: 500, body: { error: err.message } };
  }
}

export async function handleAdminUpdatePlan(authHeader?: string | null, userId?: string, body?: any): Promise<HandlerResponse> {
  try {
    const verified = await verifyBearerToken(authHeader);
    const email = (verified.email || '').toLowerCase();
    if (!SUPER_ADMIN_EMAILS.includes(email)) {
      return { status: 403, body: { error: 'Forbidden: Super admin privileges required' } };
    }

    const { planId } = body || {};
    if (!userId || !['free', 'pro', 'team', 'complimentary'].includes(planId)) {
      return { status: 400, body: { error: 'Invalid userId or planId' } };
    }

    const userRef = adminDb.collection('users').doc(userId);
    const snap = await userRef.get();
    if (!snap.exists) {
      return { status: 404, body: { error: 'User not found' } };
    }

    const prevPlan = snap.data()?.planId || 'free';
    const targetEmail = snap.data()?.email || userId;

    await userRef.update({
      planId,
      updatedAt: new Date().toISOString(),
    });

    await logServerAudit(
      'PLAN_CHANGED',
      `Super admin changed plan for ${targetEmail} from ${prevPlan} to ${planId}`,
      verified,
      userId
    );

    return { status: 200, body: { success: true } };
  } catch (err: any) {
    return { status: 500, body: { error: err.message } };
  }
}

export async function handleAdminUpdateRole(authHeader?: string | null, userId?: string, body?: any): Promise<HandlerResponse> {
  try {
    const verified = await verifyBearerToken(authHeader);
    const email = (verified.email || '').toLowerCase();
    if (!SUPER_ADMIN_EMAILS.includes(email)) {
      return { status: 403, body: { error: 'Forbidden: Super admin privileges required' } };
    }

    const { role } = body || {};
    if (!userId || !['super_admin', 'member', 'admin', 'support'].includes(role)) {
      return { status: 400, body: { error: 'Invalid userId or role' } };
    }

    const userRef = adminDb.collection('users').doc(userId);
    const snap = await userRef.get();
    if (!snap.exists) {
      return { status: 404, body: { error: 'User not found' } };
    }

    const prevRole = snap.data()?.role || 'member';
    const targetEmail = snap.data()?.email || userId;
    const now = new Date().toISOString();

    await userRef.update({
      role,
      updatedAt: now,
    });

    if (role === 'super_admin') {
      await adminDb.collection('admins').doc(userId).set({
        id: userId,
        email: targetEmail,
        role: 'super_admin',
        createdAt: now,
      }, { merge: true });
    } else if (prevRole === 'super_admin') {
      await adminDb.collection('admins').doc(userId).delete().catch(() => {});
    }

    await logServerAudit(
      'ROLE_CHANGED',
      `Super admin changed role for ${targetEmail} from ${prevRole} to ${role}`,
      verified,
      userId
    );

    return { status: 200, body: { success: true } };
  } catch (err: any) {
    return { status: 500, body: { error: err.message } };
  }
}

export interface PreparedGeminiGeneration {
  ok: true;
  toolName: string;
  systemInstruction: string;
  userPrompt: string;
  requestStartTime: number;
}

export interface FailedGeminiPreparation {
  ok: false;
  status: number;
  error: string;
}

export async function prepareGeminiGeneration(
  authHeader: string | null | undefined,
  body: any
): Promise<PreparedGeminiGeneration | FailedGeminiPreparation> {
  const requestStartTime = Date.now();
  let verifiedUser: VerifiedActor;

  try {
    verifiedUser = await verifyBearerToken(authHeader);
  } catch {
    return {
      ok: false,
      status: 401,
      error: 'Unauthorized: A valid Firebase ID token is required to generate marketing assets.',
    };
  }

  const userId = verifiedUser.uid;
  const now = Date.now();
  const userTimestamps = (rateLimitMap.get(userId) || []).filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  if (userTimestamps.length >= MAX_GENERATIONS_PER_MINUTE) {
    return {
      ok: false,
      status: 429,
      error: 'Rate limit exceeded: You can make at most 10 generations per minute. Please wait a moment.',
    };
  }

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
      const limits: Record<string, number> = { free: 50, pro: 500, team: 2000, complimentary: 2000 };
      const planLimit = (limits[planId] || 50) + (userData.bonusGenerations || 0);

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
      return { ok: false, status: 403, error: txErr.message };
    }
    console.error(`[Usage Transaction Error]: ${txErr.message}`);
    return { ok: false, status: 503, error: 'Usage transaction failed. Please try again later.' };
  }

  userTimestamps.push(now);
  rateLimitMap.set(userId, userTimestamps);

  const { toolId, toolName, organizationProfile, userInputs } = body || {};
  console.log(`[Gemini Request] Started generation for "${toolName}" (${toolId}) by user ${userId} at ${new Date().toISOString()}`);

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

  return {
    ok: true,
    toolName: toolName || toolId || 'Marketing Deliverable',
    systemInstruction,
    userPrompt,
    requestStartTime,
  };
}

export async function streamGeminiGeneration(
  prep: PreparedGeminiGeneration,
  sendEvent: (data: Record<string, any>) => void
): Promise<void> {
  const currentKey = process.env.GEMINI_API_KEY;
  if (!currentKey) {
    sendEvent({
      error: 'GEMINI_API_KEY is not configured on the server. Please check your environment configuration.',
    });
    return;
  }

  try {
    const genAI = new GoogleGenAI({
      apiKey: currentKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });

    const MODEL_NAME = 'gemini-3.1-flash-lite';
    const CALL_TIMEOUT_MS = 30000;
    let fullText = '';
    let callSucceeded = false;
    let lastError: any = null;

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

    for (let attempt = 1; attempt <= 2; attempt++) {
      const callStartTime = Date.now();
      console.log(`[Gemini Call] Starting call to ${MODEL_NAME} (attempt ${attempt}/2, thinkingLevel: LOW, 30s timeout)...`);

      let timerId: ReturnType<typeof setTimeout> | null = null;
      let isTimedOut = false;

      try {
        const timeoutPromise = new Promise<never>((_, reject) => {
          timerId = setTimeout(() => {
            isTimedOut = true;
            const err = new Error('Generation took too long, please try again');
            err.name = 'TimeoutError';
            reject(err);
          }, CALL_TIMEOUT_MS);
        });

        const executeStream = async (): Promise<string> => {
          const responseStream = await genAI.models.generateContentStream({
            model: MODEL_NAME,
            contents: prep.userPrompt,
            config: {
              systemInstruction: prep.systemInstruction,
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

        const callDuration = Date.now() - callStartTime;
        console.log(`[Gemini Call] Attempt ${attempt} finished in ${callDuration}ms (${(callDuration / 1000).toFixed(2)}s) with ${fullText.length} characters`);

        callSucceeded = true;
        break;
      } catch (err: any) {
        if (timerId) clearTimeout(timerId);
        const callDuration = Date.now() - callStartTime;
        console.warn(`[Gemini Call] Attempt ${attempt} failed after ${callDuration}ms:`, err?.message || err);
        lastError = err;

        if (err.name === 'TimeoutError' || err.message === 'Generation took too long, please try again') {
          console.warn(`[Gemini Call] 30s timeout reached. Aborting without retry.`);
          break;
        }

        if (attempt === 1 && isRateLimitOrServerError(err)) {
          console.log(`[Gemini Call] Error is rate-limit (429) or server (5xx). Retrying (attempt 2/2) after 1000ms...`);
          sendEvent({ reset: true });
          await new Promise((r) => setTimeout(r, 1000));
          fullText = '';
          continue;
        }

        break;
      }
    }

    const totalRequestTime = Date.now() - prep.requestStartTime;
    console.log(`[Gemini Request] Total request time for "${prep.toolName}": ${totalRequestTime}ms (${(totalRequestTime / 1000).toFixed(2)}s)`);

    if (callSucceeded && fullText) {
      sendEvent({
        done: true,
        modelUsed: MODEL_NAME,
        text: fullText,
      });
    } else {
      const errorMessage =
        lastError?.name === 'TimeoutError' || lastError?.message === 'Generation took too long, please try again'
          ? 'Generation took too long, please try again'
          : lastError?.message || 'Failed to generate content. Please try again.';

      console.error(`[Gemini Request] Returning error to client: ${errorMessage}`);
      sendEvent({ error: errorMessage });
    }
  } catch (error: any) {
    const totalRequestTime = Date.now() - prep.requestStartTime;
    console.error(`[Gemini Request] Unexpected error after ${totalRequestTime}ms:`, error);
    const errorMessage =
      error?.name === 'TimeoutError' || error?.message === 'Generation took too long, please try again'
        ? 'Generation took too long, please try again'
        : `Gemini Generation Error: ${error?.message || 'Server error. Please try again.'}`;

    sendEvent({ error: errorMessage });
  }
}
