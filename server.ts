import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

dotenv.config();

const serverFile = fileURLToPath(import.meta.url);
const serverDir = path.dirname(serverFile);

// Helper to load firebase config robustly across local dev and Netlify functions
function loadFirebaseConfig(): any {
  const candidates = [
    path.resolve(serverDir, 'firebase-applet-config.json'),
    path.resolve(process.cwd(), 'firebase-applet-config.json'),
    path.resolve(serverDir, '../firebase-applet-config.json'),
    path.resolve(serverDir, '../../firebase-applet-config.json'),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) {
      return JSON.parse(fs.readFileSync(c, 'utf8'));
    }
  }
  throw new Error('firebase-applet-config.json not found');
}

const firebaseConfig = loadFirebaseConfig();

// Helper to parse service account key (JSON or base64 encoded JSON)
function parseServiceAccountKey(raw: string): any {
  const trimmed = raw.trim();
  if (trimmed.startsWith('{')) {
    return JSON.parse(trimmed);
  }
  try {
    const decoded = Buffer.from(trimmed, 'base64').toString('utf8');
    return JSON.parse(decoded);
  } catch {
    return JSON.parse(trimmed);
  }
}

let credentialOption: any = undefined;
if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
  try {
    const serviceAccount = parseServiceAccountKey(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
    credentialOption = cert(serviceAccount);
  } catch (err: any) {
    console.error('Failed to parse FIREBASE_SERVICE_ACCOUNT_KEY:', err.message);
  }
}

const firebaseApp = getApps().length
  ? getApps()[0]
  : initializeApp({
      projectId: firebaseConfig.projectId,
      ...(credentialOption ? { credential: credentialOption } : {}),
    });

export const adminAuth = getAuth(firebaseApp);
export const adminDb = getFirestore(firebaseApp, firebaseConfig.firestoreDatabaseId);

// Super admin emails from environment variable
const rawSuperAdminEmails = process.env.SUPER_ADMIN_EMAILS;
if (!rawSuperAdminEmails || !rawSuperAdminEmails.trim()) {
  console.warn('SUPER_ADMIN_EMAILS not set; no users assigned super_admin role');
}
export const SUPER_ADMIN_EMAILS = (rawSuperAdminEmails || '')
  .split(',')
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

// CORS configuration
export const ALLOWED_ORIGINS = [
  'https://launchpad.mill.agency',
  'https://millennium-launchpad.netlify.app',
  ...(process.env.APP_URL ? [process.env.APP_URL.trim().replace(/\/$/, '')] : []),
];

export function getCorsHeaders(requestOrigin?: string | null): Record<string, string> {
  let matchedOrigin = '';
  if (requestOrigin) {
    const cleaned = requestOrigin.trim().replace(/\/$/, '');
    if (
      ALLOWED_ORIGINS.includes(cleaned) ||
      process.env.NODE_ENV !== 'production' ||
      cleaned.includes('localhost') ||
      cleaned.includes('127.0.0.1')
    ) {
      matchedOrigin = requestOrigin;
    }
  }
  const allowOrigin = matchedOrigin || (ALLOWED_ORIGINS[0] || '*');
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
    'Access-Control-Allow-Credentials': 'true',
  };
}

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

// Token verification helper
export async function verifyFirebaseTokenFromHeader(
  authHeader?: string | null
): Promise<{ uid: string; email?: string; name?: string; picture?: string }> {
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

// Audit log helper function using Admin SDK
export async function logServerAudit(
  action: string,
  details: string,
  actor: { uid: string; email?: string; name?: string },
  targetUserId?: string
) {
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

// =========================================================================
// EXPORTED NAMED ROUTE HANDLERS
// =========================================================================

// 1. Health check
export async function handleHealthCheck(): Promise<{ status: number; data: any }> {
  return {
    status: 200,
    data: {
      status: 'ok',
      geminiAvailable: !!(process.env.GEMINI_API_KEY || apiKey),
      firebaseConfigured: true,
      timestamp: new Date().toISOString(),
    },
  };
}

// 2. Auth sync
export async function handleAuthSync(authHeader?: string | null): Promise<{ status: number; data: any }> {
  try {
    const verified = await verifyFirebaseTokenFromHeader(authHeader);
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
          role: isSuperAdmin ? 'super_admin' : existing.role === 'super_admin' ? 'super_admin' : role,
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
        avatar:
          verified.picture ||
          `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(verified.name || email)}`,
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
        await adminDb.collection('admins').doc(verified.uid).set(
          {
            id: verified.uid,
            email: verified.email,
            role: 'super_admin',
            createdAt: now,
          },
          { merge: true }
        );
      } catch (e: any) {
        console.warn('[Firestore Admin Registry Write Warning]:', e.message);
      }
    }

    return { status: 200, data: { user: userData } };
  } catch (err: any) {
    console.error('[Auth Sync Error]', err.message);
    return { status: 401, data: { error: 'Unauthorized: Firebase ID token verification failed' } };
  }
}

// 3. List invites (super admins only)
export async function handleGetInvites(authHeader?: string | null): Promise<{ status: number; data: any }> {
  try {
    const verified = await verifyFirebaseTokenFromHeader(authHeader);
    const email = (verified.email || '').toLowerCase();
    if (!SUPER_ADMIN_EMAILS.includes(email)) {
      return { status: 403, data: { error: 'Forbidden: Super admin privileges required' } };
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
    return { status: 200, data: { invites } };
  } catch (err: any) {
    return { status: 500, data: { error: err.message } };
  }
}

// 4. Create invite (super admins only)
export async function handleCreateInvite(
  authHeader: string | null | undefined,
  body: any
): Promise<{ status: number; data: any }> {
  try {
    const verified = await verifyFirebaseTokenFromHeader(authHeader);
    const superAdminEmail = (verified.email || '').toLowerCase();
    if (!SUPER_ADMIN_EMAILS.includes(superAdminEmail)) {
      return { status: 403, data: { error: 'Forbidden: Super admin privileges required' } };
    }

    const { email, note, expiresAt } = body || {};
    if (!email || typeof email !== 'string' || !email.includes('@')) {
      return { status: 400, data: { error: 'Valid email address is required' } };
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

    return { status: 200, data: { invite: inviteData } };
  } catch (err: any) {
    return { status: 500, data: { error: err.message } };
  }
}

// 5. Revoke invite (super admins only)
export async function handleRevokeInvite(
  authHeader: string | null | undefined,
  inviteId?: string
): Promise<{ status: number; data: any }> {
  try {
    if (!inviteId) {
      return { status: 400, data: { error: 'Invite ID is required' } };
    }
    const verified = await verifyFirebaseTokenFromHeader(authHeader);
    const superAdminEmail = (verified.email || '').toLowerCase();
    if (!SUPER_ADMIN_EMAILS.includes(superAdminEmail)) {
      return { status: 403, data: { error: 'Forbidden: Super admin privileges required' } };
    }

    const inviteRef = adminDb.collection('invites').doc(inviteId);
    const snap = await inviteRef.get();
    if (!snap.exists) {
      return { status: 404, data: { error: 'Invite not found' } };
    }

    const invData = snap.data()!;
    const now = new Date().toISOString();

    await inviteRef.update({
      status: 'revoked',
      revokedAt: now,
      revokedBy: verified.uid,
    });

    // Revoking an invite moves an accepted user back to the free plan
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

    await logServerAudit('INVITE_REVOKED', `Revoked complimentary access invite for ${invData.email}`, verified);

    return { status: 200, data: { success: true } };
  } catch (err: any) {
    return { status: 500, data: { error: err.message } };
  }
}

// 6. Get single invite details
export async function handleGetInvite(inviteId?: string): Promise<{ status: number; data: any }> {
  try {
    if (!inviteId) {
      return { status: 400, data: { error: 'Invite ID is required' } };
    }
    const inviteRef = adminDb.collection('invites').doc(inviteId);
    const snap = await inviteRef.get();
    if (!snap.exists) {
      return { status: 404, data: { error: 'Invite not found' } };
    }

    const data = snap.data()!;
    const now = Date.now();
    let status = data.status || 'pending';
    if (status === 'pending' && data.expiresAt && new Date(data.expiresAt).getTime() <= now) {
      status = 'expired';
    }

    return {
      status: 200,
      data: {
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
    return { status: 500, data: { error: err.message } };
  }
}

// 7. Accept invite via link
export async function handleAcceptInvite(
  authHeader: string | null | undefined,
  inviteId?: string
): Promise<{ status: number; data: any }> {
  try {
    if (!inviteId) {
      return { status: 400, data: { error: 'Invite ID is required' } };
    }
    const verified = await verifyFirebaseTokenFromHeader(authHeader);
    const userEmail = (verified.email || '').toLowerCase();

    const inviteRef = adminDb.collection('invites').doc(inviteId);
    const snap = await inviteRef.get();
    if (!snap.exists) {
      return { status: 404, data: { error: 'Invite not found' } };
    }

    const invData = snap.data()!;
    if (invData.email.toLowerCase() !== userEmail) {
      return {
        status: 403,
        data: {
          error: `This invite was sent to ${invData.email}. You are signed in as ${userEmail}. Please sign in with the invited email address.`,
        },
      };
    }

    const now = new Date().toISOString();
    if (invData.expiresAt && new Date(invData.expiresAt).getTime() <= Date.now()) {
      await inviteRef.update({ status: 'expired' });
      return { status: 400, data: { error: 'This invitation has expired.' } };
    }

    if (invData.status === 'revoked') {
      return { status: 400, data: { error: 'This invitation has been revoked.' } };
    }

    // Set user's plan to complimentary
    const userRef = adminDb.collection('users').doc(verified.uid);
    await userRef.set(
      {
        planId: 'complimentary',
        updatedAt: now,
      },
      { merge: true }
    );

    await inviteRef.update({
      status: 'accepted',
      acceptedAt: now,
      acceptedBy: verified.uid,
    });

    await logServerAudit('INVITE_ACCEPTED', `User ${userEmail} accepted complimentary access invite ${inviteId}`, verified, verified.uid);
    await logServerAudit('PLAN_CHANGED', `Plan changed to complimentary for ${userEmail} via invite ${inviteId}`, verified, verified.uid);

    const userSnap = await userRef.get();
    return { status: 200, data: { success: true, user: userSnap.data() } };
  } catch (err: any) {
    return { status: 500, data: { error: err.message } };
  }
}

// 8. Super admin update user plan
export async function handleUpdateUserPlan(
  authHeader: string | null | undefined,
  userId?: string,
  planId?: string
): Promise<{ status: number; data: any }> {
  try {
    if (!userId) {
      return { status: 400, data: { error: 'User ID is required' } };
    }
    const verified = await verifyFirebaseTokenFromHeader(authHeader);
    const email = (verified.email || '').toLowerCase();
    if (!SUPER_ADMIN_EMAILS.includes(email)) {
      return { status: 403, data: { error: 'Forbidden: Super admin privileges required' } };
    }

    if (!planId || !['free', 'pro', 'team', 'complimentary'].includes(planId)) {
      return { status: 400, data: { error: 'Invalid planId' } };
    }

    const userRef = adminDb.collection('users').doc(userId);
    const snap = await userRef.get();
    if (!snap.exists) {
      return { status: 404, data: { error: 'User not found' } };
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

    return { status: 200, data: { success: true } };
  } catch (err: any) {
    return { status: 500, data: { error: err.message } };
  }
}

// 9. Super admin update user role
export async function handleUpdateUserRole(
  authHeader: string | null | undefined,
  userId?: string,
  role?: string
): Promise<{ status: number; data: any }> {
  try {
    if (!userId) {
      return { status: 400, data: { error: 'User ID is required' } };
    }
    const verified = await verifyFirebaseTokenFromHeader(authHeader);
    const email = (verified.email || '').toLowerCase();
    if (!SUPER_ADMIN_EMAILS.includes(email)) {
      return { status: 403, data: { error: 'Forbidden: Super admin privileges required' } };
    }

    if (!role || !['super_admin', 'member', 'admin', 'support'].includes(role)) {
      return { status: 400, data: { error: 'Invalid role' } };
    }

    const userRef = adminDb.collection('users').doc(userId);
    const snap = await userRef.get();
    if (!snap.exists) {
      return { status: 404, data: { error: 'User not found' } };
    }

    const prevRole = snap.data()?.role || 'member';
    const targetEmail = snap.data()?.email || userId;
    const now = new Date().toISOString();

    await userRef.update({
      role,
      updatedAt: now,
    });

    if (role === 'super_admin') {
      await adminDb.collection('admins').doc(userId).set(
        {
          id: userId,
          email: targetEmail,
          role: 'super_admin',
          createdAt: now,
        },
        { merge: true }
      );
    } else if (prevRole === 'super_admin') {
      await adminDb.collection('admins').doc(userId).delete().catch(() => {});
    }

    await logServerAudit(
      'ROLE_CHANGED',
      `Super admin changed role for ${targetEmail} from ${prevRole} to ${role}`,
      verified,
      userId
    );

    return { status: 200, data: { success: true } };
  } catch (err: any) {
    return { status: 500, data: { error: err.message } };
  }
}

// 10. Gemini generation
export interface GeminiGenerateResult {
  errorStatus?: number;
  errorData?: any;
  stream?: ReadableStream<Uint8Array>;
}

export async function handleGeminiGenerate(
  authHeader: string | null | undefined,
  body: any
): Promise<GeminiGenerateResult> {
  const requestStartTime = Date.now();
  let verifiedUser: { uid: string; email?: string } | null = null;

  // 1. Verify Firebase ID Token
  try {
    verifiedUser = await verifyFirebaseTokenFromHeader(authHeader);
  } catch (err: any) {
    return {
      errorStatus: 401,
      errorData: { error: 'Unauthorized: A valid Firebase ID token is required to generate marketing assets.' },
    };
  }

  const userId = verifiedUser.uid;

  // 2. Per-user Rate Limiting (10 generations per minute)
  const now = Date.now();
  const userTimestamps = (rateLimitMap.get(userId) || []).filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  if (userTimestamps.length >= MAX_GENERATIONS_PER_MINUTE) {
    return {
      errorStatus: 429,
      errorData: {
        error: 'Rate limit exceeded: You can make at most 10 generations per minute. Please wait a moment.',
      },
    };
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
      const limits: Record<string, number> = { free: 50, pro: 500, team: 2000, complimentary: 2000 };
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
      transaction.set(
        userRef,
        {
          generationsUsedThisMonth: newUsage,
          billingResetDate: resetDate || getNextMonthFirstDay(),
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );
    });
  } catch (txErr: any) {
    if (txErr.status === 403 || txErr.message?.includes('Monthly generation quota reached')) {
      console.warn(`[Quota Blocked] User ${userId} exceeded monthly generation limit.`);
      return {
        errorStatus: 403,
        errorData: { error: txErr.message },
      };
    }
    console.error(`[Usage Transaction Error]: ${txErr.message}`);
    return {
      errorStatus: 503,
      errorData: { error: 'Usage transaction failed. Please try again later.' },
    };
  }

  // Record generation timestamp for rate limit sliding window
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

  const currentKey = process.env.GEMINI_API_KEY || apiKey;
  const encoder = new TextEncoder();

  if (!currentKey) {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              error: 'GEMINI_API_KEY is not configured on the server. Please check your environment configuration.',
            })}\n\n`
          )
        );
        controller.close();
      },
    });
    return { stream };
  }

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

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const sendEvent = (data: any) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch {
          // Client stream closed
        }
      };

      try {
        let fullText = '';
        let callSucceeded = false;
        let lastError: any = null;

        for (let attempt = 1; attempt <= 2; attempt++) {
          const callStartTime = Date.now();
          console.log(`[Gemini Call] Starting call to ${MODEL_NAME} (attempt ${attempt}/2, thinkingLevel: LOW, 30s timeout)...`);

          let timerId: NodeJS.Timeout | null = null;
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
                contents: userPrompt,
                config: {
                  systemInstruction,
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

        const totalRequestTime = Date.now() - requestStartTime;
        console.log(`[Gemini Request] Total request time for "${toolName}": ${totalRequestTime}ms (${(totalRequestTime / 1000).toFixed(2)}s)`);

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
        const totalRequestTime = Date.now() - requestStartTime;
        console.error(`[Gemini Request] Unexpected error after ${totalRequestTime}ms:`, error);
        const errorMessage =
          error?.name === 'TimeoutError' || error?.message === 'Generation took too long, please try again'
            ? 'Generation took too long, please try again'
            : `Gemini Generation Error: ${error?.message || 'Server error. Please try again.'}`;
        sendEvent({ error: errorMessage });
      } finally {
        try {
          controller.close();
        } catch {}
      }
    },
  });

  return { stream };
}

export function generateFallbackContent(
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

### 2. Strategic Brand Positioning Statement
For [target customer / donor segment] who [core pain point or challenge], ${orgName} is the premier [category / initiative] that [delivers breakthrough benefit], unlike [generic alternatives] because [unique agency-crafted differentiator].

### 3. Core Value Proposition Pillars
* **Pillar 1: Proven Reliability & Trust:** Built upon transparent operations and consistent execution.
* **Pillar 2: Purpose-Driven Innovation:** Combining deep domain expertise with modern tools to deliver outsized results.
* **Pillar 3: Community & Stakeholder Centric:** Every decision is anchored in real impact for the people we serve.

### 4. Target Audience Personas
* **Primary Decision Maker:** Values clear ROI, speed to implementation, and strategic alignment.
* **Direct Beneficiary / Consumer:** Seeks intuitive, compassionate, and high-touch support.
* **Community Champion / Donor:** Motivated by sustainable long-term mission outcomes and accountable leadership.`;

    case 'messaging-builder':
      return `## Messaging & Pitch Toolkit: ${orgName}

### 1. Four Core Tagline Directions
* **Direction 1 (Action & Growth):** Accelerating What Matters for ${orgName}.
* **Direction 2 (Trust & Authority):** The Standard for Modern [Industry / Sector].
* **Direction 3 (Human & Purpose):** Built for People. Powered by Purpose.
* **Direction 4 (Bold & Punchy):** Next-Gen [Solution] Starts Here.

### 2. Elevator Pitches

#### The 15-Second Handshake Pitch
"${orgName} helps [target audience] solve [primary challenge] through our proven [methodology], allowing them to achieve [key outcome] faster than ever before."

#### The 30-Second Networking Pitch
"Did you know that most [audience members] struggle with [key bottleneck]? At ${orgName}, we engineered a better way. By combining [unique asset 1] with [unique asset 2], we provide our partners with unmatched [key benefit], transforming how they work and grow."

#### The 60-Second Executive Pitch
"In today's landscape, organizations are held back by [acute industry problem]. That's why ${orgName} was created. We are a ${orgType.toLowerCase()} dedicated to [mission]. Our approach delivers three decisive advantages: first, [benefit 1]; second, [benefit 2]; and third, [benefit 3]. Today, we're empowering dozens of stakeholders to reach [big vision], and we're just getting started."

### 3. Three Key Messaging Pillars
1. **Pillar 1 - Measurable Outcomes:** We don't just promise results; we quantify our impact every single quarter.
2. **Pillar 2 - Uncompromising Quality:** Designed by industry veterans with an obsession for craft.
3. **Pillar 3 - Accessibility & Heart:** Advanced capabilities delivered with genuine empathy and partnership.`;

    case '90-day-plan':
      return `## 90-Day Marketing Roadmap: ${orgName}

### Month 1: Foundation, Infrastructure & Rapid Wins (Weeks 1-4)
* **Week 1:** Complete organization marketing audit; configure Google Analytics 4 and conversion tracking.
* **Week 2:** Finalize brand foundations, core messaging kit, and one-page marketing overview PDF.
* **Week 3:** Launch personal outreach campaign to top 25 past supporters, partners, or customers.
* **Week 4:** Publish announcement post across LinkedIn and relevant community channels; measure baseline engagement.

### Month 2: Content Acceleration & Community Engine (Weeks 5-8)
* **Week 5:** Initiate bi-weekly thought leadership newsletter featuring founder perspectives.
* **Week 6:** Launch organic social carousel series addressing the #1 customer pain point.
* **Week 7:** Form 2 strategic co-marketing partnerships with non-competing peer organizations.
* **Week 8:** Host a 30-minute virtual AMA or informational session; capture attendee emails.

### Month 3: Conversion Sprint & Scaling Playbook (Weeks 9-12)
* **Week 9:** Introduce high-converting lead magnet (e.g., industry checklist or resource toolkit).
* **Week 10:** Run targeted remarketing sprint to warm website visitors and newsletter subscribers.
* **Week 11:** Gather 3 detailed testimonials or donor/client case studies.
* **Week 12:** Quarterly retrospective: analyze cost per acquisition, refine high-performing channels, set Q2 targets.`;

    case 'social-generator':
      return `## Multi-Platform Social Media Suite: ${orgName}

### 1. LinkedIn Thought-Leadership Post
Most people think [common assumption about industry] is the key to success.

Here's what we learned building ${orgName}:

It's actually about [counterintuitive insight].

When we shifted our focus from [old habit] to [new priority], three things happened:
1. Stakeholder trust increased dramatically
2. Decision fatigue disappeared
3. Our impact scaled by 40%

If you're navigating [current challenge], start with [actionable piece of advice].

What's your biggest takeaway when tackling this? Let's discuss in the comments below.

#Leadership #Strategy #${orgType} #Innovation

---

### 2. Instagram Carousel Copy (5 Slides)
* **Slide 1 (Hook):** The #1 mistake most [Audience Members] make in 2026.
* **Slide 2 (The Problem):** Relying on [Outdated Method] burns budget and exhausts your team.
* **Slide 3 (The Shift):** What if you could [Desirable Outcome] in half the time?
* **Slide 4 (The Solution):** At ${orgName}, we prioritize [Key Feature/Pillar].
* **Slide 5 (Call to Action):** Save this post for your next strategy session & visit the link in bio to learn more!

---

### 3. X / Twitter 3-Post Thread
1/3: If your organization wants to master [Core Goal], stop doing [Ineffective Tactic]. Here's the 3-step agency playbook we recommend at ${orgName} 🧵👇
2/3: Step 1: Clarify your message so a 10-year-old understands it. Step 2: Focus on one primary distribution channel before diversifying. Step 3: Speak to one specific human problem.
3/3: Execution beats perfection every time. If you need a partner to build your foundations, check out ${orgName} at our bio link. Let's make it happen.`;

    case 'email-writer':
      return `## Email Campaign Suite: ${orgName}

### 1. High-Converting Subject Lines
* **Curiosity:** A quick question about your [Industry Priority]...
* **Direct Value:** How ${orgName} is solving [Pain Point] for good
* **Personal Hook:** We made a big decision last week (and why it matters for you)
* **Social Proof:** How 3 organizations transformed their [Outcome] with ${orgName}
* **Urgency:** The one thing to update before next quarter starts

---

### 2. Email 1: Welcome & Mission Introduction
**Subject:** Welcome to ${orgName} — let's build something exceptional together

Hi [First Name],

Thank you for connecting with ${orgName}.

We started this journey with a clear conviction: [summarize primary mission statement in 1 punchy line].

Over the coming weeks, we're going to share practical insights, actionable frameworks, and direct updates on how we are [tackling core challenge].

In the meantime, what is the single biggest goal your team is working toward this quarter? Hit reply and let us know—we read every response.

Warmly,
The ${orgName} Team

---

### 3. Email 2: Direct Value & Impact Showcase
**Subject:** The blueprint behind [desirable milestone]

Hi [First Name],

When organizations attempt to [achieve goal], they usually encounter [major roadblock].

Here is how ${orgName} approaches it differently:
- [Point 1: Strategic clarity over noise]
- [Point 2: Built-in accountability and metrics]
- [Point 3: Dedicated support every step of the way]

Ready to accelerate your progress? [Schedule a conversation / Explore our solutions] today.`;

    case 'website-copy':
      return `## Website Copy & SEO Blueprint: ${orgName}

### Meta Details
* **SEO Page Title:** ${orgName} | Premier [Primary Service] for [Audience]
* **Meta Description:** Discover how ${orgName} helps [audience] achieve [benefit] through customized, mission-driven solutions. Learn more today.

---

### Homepage Hero Section
* **Hero Headline (H1):** Empowering [Target Audience] with Next-Generation [Solutions].
* **Subheadline (H2):** ${orgName} provides the strategic framework, tools, and expertise you need to overcome [challenge] and scale your impact.
* **Primary CTA:** Get Started Free
* **Secondary CTA:** Schedule a Strategy Call

---

### Core Value Pillars (3-Column Layout)
#### 1. Strategic Precision
Stop guessing what works. Our structured methodology delivers repeatable, high-impact outcomes from day one.

#### 2. Purpose-Built Architecture
Engineered specifically for the demands of modern ${orgType.toLowerCase()}s who require agility and measurable performance.

#### 3. Dedicated Partnership
We're not just another vendor. We act as an extension of your leadership team to drive sustainable growth.`;

    case 'donor-appeal':
      return `## Donor Appeal & Grant Proposal Kit: ${orgName}

### 1. Formal Donor Appeal Letter
**Subject:** Your partnership makes [Transformative Outcome] possible

Dear [Donor Name],

Every day in our community, [state the urgent human reality or problem].

At ${orgName}, we believe that no one should have to navigate [challenge] alone. Because of compassionate champions like you, this year we were able to:
* Directly support [Metric 1: e.g., 250 families / individuals]
* Deliver [Metric 2: e.g., 1,200 hours of specialized care / resources]
* Expand our outreach to [Metric 3: target community expansion]

**Your gift today directly funds:**
* **$50:** Provides essential supplies for one program participant.
* **$150:** Funds one full week of direct service delivery and mentorship.
* **$500:** Sponsors an entire workshop series for an underserved cohort.

Will you join us in writing the next chapter of this mission? Every dollar makes a tangible, lasting difference.

With sincere gratitude,
[Executive Director / Founder Name]
${orgName}

---

### 2. Grant Proposal Executive Summary
* **Project Name:** Community Advancement Initiative 2026
* **Organization:** ${orgName} (501(c)(3) Nonprofit)
* **Statement of Need:** Addressing systemic barriers to [Core Need] among [Target Demographic].
* **Proposed Intervention:** A multi-tiered support model delivering direct mentorship, educational toolkits, and measurable community milestones.
* **Expected Outcomes:** 85% completion rate among enrolled participants with documented increases in self-sufficiency.`;

    case 'pitch-launch':
      return `## Investor Pitch & Launch Deck: ${orgName}

### 10-Slide Pitch Narrative Flow

#### Slide 1: Title & Vision
* **Headline:** ${orgName}
* **Tagline:** The Intelligent Infrastructure for [Industry/Sector].

#### Slide 2: The Problem
* The current market relies on fragmented, legacy workflows.
* Customers lose up to 15 hours per week on manual coordination.

#### Slide 3: The Solution
* An integrated, modern platform that automates [Key Bottleneck].
* Delivers 3x faster turnaround times at 50% lower overhead.

#### Slide 4: Market Opportunity
* Total Addressable Market (TAM): $4.2B growing at 18% CAGR.
* Immediate Serviceable Market: Over 45,000 organizations in need of modern upgrades.

#### Slide 5: Product & Unfair Advantage
* Proprietary workflow templates calibrated by agency veterans.
* High switching costs and robust organic word-of-mouth referral engine.

#### Slide 6: Business Model
* Predictable recurring SaaS subscriptions + premium advisory tiers.

#### Slide 7: Traction & Milestones
* Active beta community with 92% retention rate.
* Over 10,000 deliverables generated to date.

#### Slide 8: Go-to-Market
* High-intent organic SEO, community co-marketing, and targeted direct outreach.

#### Slide 9: Team
* Founder-led team with combined 25+ years in agency growth, engineering, and digital strategy.

#### Slide 10: The Ask
* Raising seed funding to accelerate product development and scale direct customer acquisition.`;

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

// =========================================================================
// EXPRESS SERVER & VITE INTEGRATION (ONLY WHEN SERVERLESS IS NOT "true")
// =========================================================================
if (process.env.SERVERLESS !== 'true') {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;
  const isProduction = process.env.NODE_ENV === 'production';

  app.use(express.json({ limit: '10mb' }));

  // CORS middleware for Express
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    const corsHeaders = getCorsHeaders(origin);
    for (const [key, value] of Object.entries(corsHeaders)) {
      res.setHeader(key, value);
    }
    if (req.method === 'OPTIONS') {
      return res.status(204).end();
    }
    next();
  });

  // Health check endpoint
  app.get('/api/health', async (_req, res) => {
    const result = await handleHealthCheck();
    res.status(result.status).json(result.data);
  });

  // Authentication Synchronization Endpoint
  app.post('/api/auth/sync', async (req, res) => {
    const result = await handleAuthSync(req.headers.authorization);
    res.status(result.status).json(result.data);
  });

  // List all invites (super admins only)
  app.get('/api/invites', async (req, res) => {
    const result = await handleGetInvites(req.headers.authorization);
    res.status(result.status).json(result.data);
  });

  // Create invite (super admins only)
  app.post('/api/invites', async (req, res) => {
    const result = await handleCreateInvite(req.headers.authorization, req.body);
    res.status(result.status).json(result.data);
  });

  // Revoke invite (super admins only)
  app.post('/api/invites/:id/revoke', async (req, res) => {
    const result = await handleRevokeInvite(req.headers.authorization, req.params.id);
    res.status(result.status).json(result.data);
  });

  // Get single invite details
  app.get('/api/invites/:id', async (req, res) => {
    const result = await handleGetInvite(req.params.id);
    res.status(result.status).json(result.data);
  });

  // Accept invite via link
  app.post('/api/invites/:id/accept', async (req, res) => {
    const result = await handleAcceptInvite(req.headers.authorization, req.params.id);
    res.status(result.status).json(result.data);
  });

  // Super Admin Update User Plan
  app.post('/api/admin/users/:userId/plan', async (req, res) => {
    const result = await handleUpdateUserPlan(req.headers.authorization, req.params.userId, req.body?.planId);
    res.status(result.status).json(result.data);
  });

  // Super Admin Update User Role
  app.post('/api/admin/users/:userId/role', async (req, res) => {
    const result = await handleUpdateUserRole(req.headers.authorization, req.params.userId, req.body?.role);
    res.status(result.status).json(result.data);
  });

  // Marketing Tool Generation Endpoint
  app.post('/api/gemini/generate', async (req, res) => {
    const result = await handleGeminiGenerate(req.headers.authorization, req.body);
    if (result.errorStatus) {
      return res.status(result.errorStatus).json(result.errorData);
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    const reader = result.stream!.getReader();
    req.on('close', () => {
      reader.cancel().catch(() => {});
    });

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(value);
      }
    } catch (err: any) {
      console.error('[Stream Pipe Error]:', err.message);
    } finally {
      res.end();
    }
  });

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
      const distPath = path.resolve(serverDir, 'dist');
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
}
