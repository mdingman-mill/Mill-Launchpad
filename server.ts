import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore, initializeFirestore } from 'firebase-admin/firestore';

dotenv.config();

const UNHANDLED_REJECTION_GUARD_KEY = '__mlaUnhandledRejectionRegistered';
if (!(globalThis as any)[UNHANDLED_REJECTION_GUARD_KEY]) {
  (globalThis as any)[UNHANDLED_REJECTION_GUARD_KEY] = true;
  process.on('unhandledRejection', (reason: unknown) => {
    console.error(
      '[Unhandled Promise Rejection]:',
      reason instanceof Error ? reason.stack || reason.message : reason
    );
  });
}

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

function initAdminFirestore() {
  const dbId =
    firebaseConfig.firestoreDatabaseId && firebaseConfig.firestoreDatabaseId !== '(default)'
      ? firebaseConfig.firestoreDatabaseId
      : undefined;
  try {
    return dbId
      ? initializeFirestore(firebaseApp, { preferRest: true }, dbId)
      : initializeFirestore(firebaseApp, { preferRest: true });
  } catch {
    return dbId ? getFirestore(firebaseApp, dbId) : getFirestore(firebaseApp);
  }
}

export const adminAuth = getAuth(firebaseApp);
export const adminDb = initAdminFirestore();

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

function isLocalDevOrigin(originUrl: string): boolean {
  if (process.env.NODE_ENV === 'production' || process.env.NETLIFY === 'true' || process.env.CONTEXT === 'production') {
    return false;
  }
  try {
    const parsed = new URL(originUrl);
    return parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
  } catch {
    return false;
  }
}

export function getCorsHeaders(requestOrigin?: string | null): Record<string, string> {
  let matchedOrigin = '';
  if (requestOrigin) {
    const cleaned = requestOrigin.trim().replace(/\/$/, '');
    if (ALLOWED_ORIGINS.includes(cleaned) || isLocalDevOrigin(cleaned)) {
      matchedOrigin = cleaned;
    }
  }
  const allowOrigin = matchedOrigin || (ALLOWED_ORIGINS[0] || 'https://launchpad.mill.agency');
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Vary': 'Origin',
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

class HttpError extends Error {
  status: number;
  code?: string;
  constructor(status: number, message: string, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export interface PlatformSettingsRecord {
  id: 'platform';
  inviteOnlyMode: boolean;
  updatedAt?: string;
  updatedBy?: string;
  updatedByEmail?: string;
}

export async function getPlatformSettings(): Promise<PlatformSettingsRecord> {
  const snap = await adminDb.collection('settings').doc('platform').get();
  if (!snap.exists) {
    return {
      id: 'platform',
      inviteOnlyMode: false,
    };
  }
  const data = snap.data() || {};
  return {
    id: 'platform',
    inviteOnlyMode: data.inviteOnlyMode === true,
    updatedAt: typeof data.updatedAt === 'string' ? data.updatedAt : undefined,
    updatedBy: typeof data.updatedBy === 'string' ? data.updatedBy : undefined,
    updatedByEmail: typeof data.updatedByEmail === 'string' ? data.updatedByEmail : undefined,
  };
}

function isValidFirestoreId(id: unknown): id is string {
  return typeof id === 'string' && id.length > 0 && id.length <= 128 && /^[a-zA-Z0-9_\-.]+$/.test(id);
}

function maskEmailAddress(email: string): string {
  const clean = (email || '').trim();
  const atIdx = clean.indexOf('@');
  if (atIdx <= 0) return '***';
  const local = clean.slice(0, atIdx);
  const domain = clean.slice(atIdx + 1);
  const visible = local.length > 2 ? local.slice(0, 2) : local.slice(0, 1);
  return `${visible}***@${domain}`;
}

function truncateString(val: unknown, maxLen: number): string {
  if (val === null || val === undefined) return '';
  return String(val).slice(0, maxLen);
}

const VALID_TOOL_IDS = new Set([
  'brand-foundations',
  'messaging-builder',
  '90-day-plan',
  'social-generator',
  'email-writer',
  'website-copy',
  'donor-appeal',
  'pitch-launch',
  'keywords-content',
]);

export const DEFAULT_PLAN_CONFIGS: Record<
  'free' | 'pro' | 'team' | 'complimentary',
  { price: number; priceNonprofit: number; generationLimit: number }
> = {
  free: { price: 0, priceNonprofit: 0, generationLimit: 50 },
  pro: { price: 49, priceNonprofit: 36.75, generationLimit: 500 },
  team: { price: 149, priceNonprofit: 111.75, generationLimit: 2000 },
  complimentary: { price: 0, priceNonprofit: 0, generationLimit: 2000 },
};

export const PLAN_LIMITS: Record<string, number> = {
  free: 50,
  pro: 500,
  team: 2000,
  complimentary: 2000,
};

export const SEAT_LIMITS: Record<string, number> = {
  free: 1,
  pro: 1,
  team: 5,
  complimentary: 5,
};

function getDefaultSeatLimit(planId?: string): number {
  return SEAT_LIMITS[planId || 'free'] || 1;
}

function getDefaultGenerationLimit(planId?: string): number {
  return PLAN_LIMITS[planId || 'free'] || 50;
}

export async function getPlanConfigs(): Promise<{
  plans: Record<string, { price: number; priceNonprofit: number; generationLimit: number }>;
  updatedAt?: string;
}> {
  const result: Record<string, { price: number; priceNonprofit: number; generationLimit: number }> = {
    free: { ...DEFAULT_PLAN_CONFIGS.free },
    pro: { ...DEFAULT_PLAN_CONFIGS.pro },
    team: { ...DEFAULT_PLAN_CONFIGS.team },
    complimentary: { ...DEFAULT_PLAN_CONFIGS.complimentary },
  };
  try {
    const snap = await adminDb.collection('settings').doc('plans').get();
    if (snap.exists) {
      const data = snap.data() || {};
      const storedPlans = data.plans && typeof data.plans === 'object' ? data.plans : {};
      for (const planId of Object.keys(DEFAULT_PLAN_CONFIGS) as Array<keyof typeof DEFAULT_PLAN_CONFIGS>) {
        const entry = storedPlans[planId];
        if (entry && typeof entry === 'object') {
          const price =
            typeof entry.price === 'number' && Number.isFinite(entry.price) && entry.price >= 0
              ? Math.round(entry.price * 100) / 100
              : result[planId].price;
          const priceNonprofit =
            typeof entry.priceNonprofit === 'number' && Number.isFinite(entry.priceNonprofit) && entry.priceNonprofit >= 0
              ? Math.round(entry.priceNonprofit * 100) / 100
              : Math.round(price * 0.75 * 100) / 100;
          const generationLimit =
            typeof entry.generationLimit === 'number' && Number.isInteger(entry.generationLimit) && entry.generationLimit >= 1
              ? entry.generationLimit
              : result[planId].generationLimit;
          result[planId] = { price, priceNonprofit, generationLimit };
        }
      }
      return {
        plans: result,
        ...(typeof data.updatedAt === 'string' ? { updatedAt: data.updatedAt } : {}),
      };
    }
  } catch (err: any) {
    console.warn('[Get Plan Configs Warning]:', err?.message);
  }
  return { plans: result };
}

function buildOrgProfileFromOrgDoc(orgData: any): any | undefined {
  if (!orgData || (!orgData.name && !orgData.whatTheyDo)) return undefined;
  return {
    orgName: orgData.name || 'My Organization',
    ...(orgData.website ? { website: orgData.website } : {}),
    type: orgData.type === 'Nonprofit' ? 'Nonprofit' : 'Startup',
    whatTheyDo: orgData.whatTheyDo || '',
    targetAudience: orgData.targetAudience || '',
    goals: Array.isArray(orgData.goals) ? orgData.goals : [],
    brandTone: Array.isArray(orgData.brandTone) && orgData.brandTone.length > 0 ? orgData.brandTone : ['Professional', 'Inspiring'],
    budget: orgData.budget || 'Under $500/month',
  };
}

export const MAX_TEAMS_PER_USER = 10;

function computeUserOrganizationIds(uid: string, rawOrgIds: unknown, extraOrgId?: unknown): string[] {
  const personalOrgId = `org_${uid}`;
  const set = new Set<string>([personalOrgId]);
  if (Array.isArray(rawOrgIds)) {
    for (const id of rawOrgIds) {
      if (isValidFirestoreId(id)) set.add(id);
    }
  }
  if (isValidFirestoreId(extraOrgId)) {
    set.add(extraOrgId);
  }
  // Keep personal workspace first
  return [personalOrgId, ...Array.from(set).filter((id) => id !== personalOrgId)];
}

function normalizeOrganizationRecord(orgId: string, data: any): any {
  const planId = data?.planId || 'free';
  const rawMembers = Array.isArray(data?.memberIds) ? data.memberIds : [];
  const ownerId = data?.ownerId || rawMembers[0] || '';
  const memberIds = Array.from(new Set([...rawMembers, ...(ownerId ? [ownerId] : [])]));
  const memberRoles: Record<string, 'owner' | 'member'> = {};
  for (const mId of memberIds) {
    memberRoles[mId] = mId === ownerId ? 'owner' : 'member';
  }
  return {
    id: orgId,
    name: data?.name || 'Personal Workspace',
    ownerId,
    memberIds,
    memberRoles,
    planId,
    seatLimit: Number(data?.seatLimit || getDefaultSeatLimit(planId)),
    generationsUsedThisMonth: Number(data?.generationsUsedThisMonth || 0),
    bonusGenerations: Number(data?.bonusGenerations || 0),
    billingResetDate: data?.billingResetDate || getNextMonthFirstDay(),
    ...(data?.type ? { type: data.type } : {}),
    ...(data?.whatTheyDo ? { whatTheyDo: data.whatTheyDo } : {}),
    ...(data?.targetAudience ? { targetAudience: data.targetAudience } : {}),
    ...(Array.isArray(data?.goals) ? { goals: data.goals } : {}),
    ...(Array.isArray(data?.brandTone) ? { brandTone: data.brandTone } : {}),
    ...(data?.budget ? { budget: data.budget } : {}),
    ...(data?.website ? { website: data.website } : {}),
    ...(data?.createdAt ? { createdAt: data.createdAt } : {}),
    ...(data?.updatedAt ? { updatedAt: data.updatedAt } : {}),
  };
}

async function ensurePersonalWorkspace(uid: string, userData: any, now: string): Promise<any> {
  const personalOrgId = `org_${uid}`;
  const orgRef = adminDb.collection('organizations').doc(personalOrgId);
  const orgSnap = await orgRef.get();

  if (!orgSnap.exists) {
    const isPersonalActive = !userData?.organizationId || userData.organizationId === personalOrgId;
    const planId = isPersonalActive ? userData?.planId || 'free' : 'free';
    const profile = isPersonalActive ? userData?.organizationProfile : undefined;
    const newOrg = {
      id: personalOrgId,
      name: profile?.orgName || `${userData?.name || userData?.email?.split('@')[0] || 'Personal'}'s Workspace`,
      ownerId: uid,
      memberIds: [uid],
      memberRoles: { [uid]: 'owner' as const },
      planId,
      seatLimit: getDefaultSeatLimit(planId),
      generationsUsedThisMonth: isPersonalActive ? Number(userData?.generationsUsedThisMonth || 0) : 0,
      bonusGenerations: isPersonalActive ? Number(userData?.bonusGenerations || 0) : 0,
      billingResetDate: userData?.billingResetDate || getNextMonthFirstDay(),
      ...(profile
        ? {
            type: profile.type || 'Startup',
            whatTheyDo: profile.whatTheyDo || '',
            targetAudience: profile.targetAudience || '',
            goals: Array.isArray(profile.goals) ? profile.goals : [],
            brandTone: Array.isArray(profile.brandTone) ? profile.brandTone : ['Professional', 'Inspiring'],
            budget: profile.budget || 'Under $500/month',
            website: profile.website || '',
          }
        : {}),
      createdAt: userData?.signupDate || now,
      updatedAt: now,
    };
    await orgRef.set(newOrg, { merge: true });
    return normalizeOrganizationRecord(personalOrgId, newOrg);
  }

  return normalizeOrganizationRecord(personalOrgId, orgSnap.data());
}

async function ensureOrganizationForUser(userData: any, uid: string, now: string): Promise<any> {
  const orgId = isValidFirestoreId(userData.organizationId) ? userData.organizationId : `org_${uid}`;
  const orgRef = adminDb.collection('organizations').doc(orgId);
  const orgSnap = await orgRef.get();

  if (!orgSnap.exists) {
    // If a stale non-personal org was deleted, fall back to personal workspace
    if (orgId !== `org_${uid}`) {
      return ensurePersonalWorkspace(uid, { ...userData, organizationId: `org_${uid}` }, now);
    }
    return ensurePersonalWorkspace(uid, userData, now);
  }

  const rawOrg = orgSnap.data()!;
  const patch: Record<string, any> = {};
  const planId = rawOrg.planId || userData.planId || 'free';
  if (!rawOrg.planId) patch.planId = planId;
  if (typeof rawOrg.seatLimit !== 'number' || rawOrg.seatLimit < 1) {
    patch.seatLimit = getDefaultSeatLimit(planId);
  }
  if (typeof rawOrg.generationsUsedThisMonth !== 'number') {
    patch.generationsUsedThisMonth = Number(userData.generationsUsedThisMonth || 0);
  }
  if (typeof rawOrg.bonusGenerations !== 'number') {
    patch.bonusGenerations = Number(userData.bonusGenerations || 0);
  }
  if (!rawOrg.billingResetDate) {
    patch.billingResetDate = userData.billingResetDate || getNextMonthFirstDay();
  }
  const existingMembers: string[] = Array.isArray(rawOrg.memberIds) ? rawOrg.memberIds : [];
  let updatedMembers = existingMembers;
  if (!existingMembers.includes(uid) && rawOrg.ownerId === uid) {
    updatedMembers = Array.from(new Set([...existingMembers, uid]));
    patch.memberIds = updatedMembers;
  }
  const normalizedRoles: Record<string, 'owner' | 'member'> = {};
  for (const mId of updatedMembers) {
    normalizedRoles[mId] = mId === rawOrg.ownerId ? 'owner' : 'member';
  }
  if (rawOrg.ownerId && !normalizedRoles[rawOrg.ownerId]) {
    normalizedRoles[rawOrg.ownerId] = 'owner';
  }
  if (!rawOrg.memberRoles || JSON.stringify(rawOrg.memberRoles) !== JSON.stringify(normalizedRoles)) {
    patch.memberRoles = normalizedRoles;
  }
  const todayStr = new Date().toISOString().split('T')[0];
  const resetDate = patch.billingResetDate || rawOrg.billingResetDate;
  if (resetDate && todayStr >= resetDate) {
    patch.generationsUsedThisMonth = 0;
    patch.billingResetDate = getNextMonthFirstDay();
  }
  if (Object.keys(patch).length > 0) {
    patch.updatedAt = now;
    await orgRef.set(patch, { merge: true });
  }
  return normalizeOrganizationRecord(orgId, { ...rawOrg, ...patch });
}

async function syncPlanToOrgMembers(orgId: string, planId: string, now: string): Promise<void> {
  const orgSnap = await adminDb.collection('organizations').doc(orgId).get();
  if (!orgSnap.exists) return;
  const orgData = orgSnap.data()!;
  const memberIds = Array.from(
    new Set([...(Array.isArray(orgData.memberIds) ? orgData.memberIds : []), ...(orgData.ownerId ? [orgData.ownerId] : [])])
  ).filter((id) => isValidFirestoreId(id));
  if (memberIds.length === 0) return;

  const memberSnaps = await Promise.all(memberIds.map((mId) => adminDb.collection('users').doc(mId).get()));
  const batch = adminDb.batch();
  let updatesCount = 0;
  for (const mSnap of memberSnaps) {
    if (!mSnap.exists) continue;
    const mData = mSnap.data()!;
    const activeOrg = isValidFirestoreId(mData.organizationId) ? mData.organizationId : `org_${mSnap.id}`;
    if (activeOrg === orgId) {
      batch.set(mSnap.ref, { planId, updatedAt: now }, { merge: true });
      updatesCount++;
    }
  }
  if (updatesCount > 0) {
    await batch.commit();
  }
}

async function deleteOrganizationCascade(orgId: string): Promise<void> {
  const orgRef = adminDb.collection('organizations').doc(orgId);
  const [outputsSnap, invitesSnap, historySnap] = await Promise.all([
    orgRef.collection('outputs').get().catch(() => null),
    orgRef.collection('invites').get().catch(() => null),
    orgRef.collection('history').get().catch(() => null),
  ]);

  if (outputsSnap && !outputsSnap.empty) {
    for (let i = 0; i < outputsSnap.docs.length; i += 400) {
      const batch = adminDb.batch();
      outputsSnap.docs.slice(i, i + 400).forEach((d) => batch.delete(d.ref));
      await batch.commit();
    }
  }
  if (invitesSnap && !invitesSnap.empty) {
    for (let i = 0; i < invitesSnap.docs.length; i += 200) {
      const batch = adminDb.batch();
      invitesSnap.docs.slice(i, i + 200).forEach((d) => {
        batch.delete(d.ref);
        batch.delete(adminDb.collection('teamInvites').doc(d.id));
      });
      await batch.commit();
    }
  }
  if (historySnap && !historySnap.empty) {
    for (let i = 0; i < historySnap.docs.length; i += 400) {
      const batch = adminDb.batch();
      historySnap.docs.slice(i, i + 400).forEach((d) => batch.delete(d.ref));
      await batch.commit();
    }
  }
  await orgRef.delete().catch(() => {});
}

async function getTeamSummariesAndInvitesForUser(
  uid: string,
  email: string | undefined,
  emailVerified: boolean,
  userData: any
): Promise<{
  teams: any[];
  pendingInvites: any[];
  validOrgIds: string[];
}> {
  const personalOrgId = `org_${uid}`;
  const candidateIds = computeUserOrganizationIds(uid, userData?.organizationIds, userData?.organizationId);
  const orgSnaps = await Promise.all(
    candidateIds.map((id) => adminDb.collection('organizations').doc(id).get().catch(() => null))
  );

  const validOrgIds: string[] = [];
  const teams: any[] = [];
  const nowMs = Date.now();

  await Promise.all(
    orgSnaps.map(async (orgSnap, idx) => {
      const id = candidateIds[idx];
      if (!orgSnap || !orgSnap.exists) return;
      const normalized = normalizeOrganizationRecord(id, orgSnap.data());
      const isMember = normalized.ownerId === uid || normalized.memberIds.includes(uid);
      if (!isMember) return;

      validOrgIds.push(id);
      let pendingCount = 0;
      try {
        const invSnap = await adminDb.collection('organizations').doc(id).collection('invites').get();
        for (const d of invSnap.docs) {
          const inv = d.data();
          if (inv.status === 'pending') {
            if (inv.expiresAt && new Date(inv.expiresAt).getTime() <= nowMs) {
              d.ref.update({ status: 'expired' }).catch(() => {});
              adminDb.collection('teamInvites').doc(d.id).update({ status: 'expired' }).catch(() => {});
            } else {
              pendingCount++;
            }
          }
        }
      } catch {
        // Ignore invite subcollection read errors
      }

      teams.push({
        id: normalized.id,
        name: normalized.name,
        ownerId: normalized.ownerId,
        planId: normalized.planId,
        seatLimit: normalized.seatLimit,
        memberCount: normalized.memberIds.length,
        seatsUsed: normalized.memberIds.length + pendingCount,
        orgRole: normalized.memberRoles?.[uid] || (normalized.ownerId === uid ? 'owner' : 'member'),
        isPersonal: id === personalOrgId,
        generationsUsedThisMonth: normalized.generationsUsedThisMonth,
        bonusGenerations: normalized.bonusGenerations || 0,
      });
    })
  );

  // Order personal workspace first, then alphabetically by name
  teams.sort((a, b) => {
    if (a.isPersonal && !b.isPersonal) return -1;
    if (!a.isPersonal && b.isPersonal) return 1;
    return (a.name || '').localeCompare(b.name || '');
  });

  const sortedValidIds = teams.map((t) => t.id);

  // Fetch pending unexpired team invites for user's verified email
  const pendingInvites: any[] = [];
  const cleanEmail = (email || '').trim().toLowerCase();
  if (emailVerified && cleanEmail) {
    try {
      const teamSnap = await adminDb.collection('teamInvites').where('email', '==', cleanEmail).get();
      for (const d of teamSnap.docs) {
        const inv = d.data();
        if (inv.status !== 'pending') continue;
        if (inv.expiresAt && new Date(inv.expiresAt).getTime() <= nowMs) {
          d.ref.update({ status: 'expired' }).catch(() => {});
          if (isValidFirestoreId(inv.orgId)) {
            adminDb
              .collection('organizations')
              .doc(inv.orgId)
              .collection('invites')
              .doc(d.id)
              .update({ status: 'expired' })
              .catch(() => {});
          }
          continue;
        }
        pendingInvites.push({ id: d.id, ...inv, status: 'pending' });
      }
      pendingInvites.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
    } catch (err: any) {
      console.warn('[User Pending Team Invites Warning]:', err?.message);
    }
  }

  return {
    teams,
    pendingInvites,
    validOrgIds: sortedValidIds.length > 0 ? sortedValidIds : [personalOrgId],
  };
}

async function getOrgSeatStats(orgId: string, orgData: any): Promise<{
  memberIds: string[];
  pendingCount: number;
  seatsUsed: number;
  seatLimit: number;
  invites: any[];
}> {
  const memberIds = Array.from(
    new Set([...(Array.isArray(orgData.memberIds) ? orgData.memberIds : []), ...(orgData.ownerId ? [orgData.ownerId] : [])])
  );
  const invitesSnap = await adminDb.collection('organizations').doc(orgId).collection('invites').get();
  const nowMs = Date.now();
  const invites: any[] = [];
  let pendingCount = 0;

  for (const docSnap of invitesSnap.docs) {
    const inv = docSnap.data();
    let status = inv.status || 'pending';
    if (status === 'pending' && inv.expiresAt && new Date(inv.expiresAt).getTime() <= nowMs) {
      status = 'expired';
      await docSnap.ref.update({ status: 'expired' }).catch(() => {});
      await adminDb.collection('teamInvites').doc(docSnap.id).update({ status: 'expired' }).catch(() => {});
    }
    if (status === 'pending') pendingCount++;
    invites.push({ id: docSnap.id, ...inv, status });
  }

  invites.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
  const seatLimit = Number(orgData.seatLimit || getDefaultSeatLimit(orgData.planId || 'free'));
  return {
    memberIds,
    pendingCount,
    seatsUsed: memberIds.length + pendingCount,
    seatLimit,
    invites,
  };
}

// Token verification helper
export async function verifyFirebaseTokenFromHeader(
  authHeader?: string | null
): Promise<{ uid: string; email?: string; emailVerified: boolean; name?: string; picture?: string }> {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new HttpError(401, 'Unauthorized: Missing or invalid Authorization header');
  }
  const token = authHeader.split('Bearer ')[1]?.trim();
  if (!token) {
    throw new HttpError(401, 'Unauthorized: Empty bearer token');
  }
  try {
    const decoded = await adminAuth.verifyIdToken(token);
    return {
      uid: decoded.uid,
      email: decoded.email,
      emailVerified: decoded.email_verified === true,
      name: decoded.name,
      picture: decoded.picture,
    };
  } catch {
    throw new HttpError(401, 'Unauthorized: Invalid or expired Firebase ID token');
  }
}

async function requireSuperAdmin(authHeader?: string | null) {
  const verified = await verifyFirebaseTokenFromHeader(authHeader);
  const email = (verified.email || '').trim().toLowerCase();
  if (!verified.emailVerified || !email || !SUPER_ADMIN_EMAILS.includes(email)) {
    throw new HttpError(403, 'Forbidden: Super admin privileges required');
  }
  return verified;
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
  let inviteOnlyMode = false;
  try {
    const settings = await getPlatformSettings();
    inviteOnlyMode = settings.inviteOnlyMode;
  } catch {
    // Keep health check resilient if Firestore is momentarily unreachable
  }

  return {
    status: 200,
    data: {
      status: 'ok',
      geminiAvailable: !!(process.env.GEMINI_API_KEY || apiKey),
      firebaseConfigured: true,
      inviteOnlyMode,
      timestamp: new Date().toISOString(),
    },
  };
}

// 1b. Public platform settings (non-PII flags only)
export async function handleGetPublicSettings(): Promise<{ status: number; data: any }> {
  try {
    const settings = await getPlatformSettings();
    return {
      status: 200,
      data: {
        inviteOnlyMode: settings.inviteOnlyMode,
        paidPlansDisabled: settings.inviteOnlyMode,
        selfSignupDisabled: settings.inviteOnlyMode,
        ...(settings.updatedAt ? { updatedAt: settings.updatedAt } : {}),
      },
    };
  } catch (err: any) {
    console.error('[Get Public Settings Error]:', err.message);
    return { status: 503, data: { error: 'Unable to load platform settings' } };
  }
}

// 1c. Super admin update platform settings
export async function handleUpdatePlatformSettings(
  authHeader: string | null | undefined,
  body: any
): Promise<{ status: number; data: any }> {
  try {
    const verified = await requireSuperAdmin(authHeader);
    if (typeof body?.inviteOnlyMode !== 'boolean') {
      return { status: 400, data: { error: 'inviteOnlyMode must be a boolean' } };
    }

    const inviteOnlyMode = body.inviteOnlyMode === true;
    const now = new Date().toISOString();
    const record: PlatformSettingsRecord = {
      id: 'platform',
      inviteOnlyMode,
      updatedAt: now,
      updatedBy: verified.uid,
      updatedByEmail: verified.email || '',
    };

    await adminDb.collection('settings').doc('platform').set(record, { merge: true });

    await logServerAudit(
      'SETTINGS_UPDATED',
      `Invite-Only Mode ${inviteOnlyMode ? 'ENABLED (self-account creation and paid plans disabled)' : 'DISABLED (self-account creation and paid plans enabled)'}`,
      verified
    );

    return {
      status: 200,
      data: {
        settings: {
          inviteOnlyMode,
          paidPlansDisabled: inviteOnlyMode,
          selfSignupDisabled: inviteOnlyMode,
          updatedAt: now,
        },
      },
    };
  } catch (err: any) {
    return { status: err.status || 500, data: { error: err.message } };
  }
}

// 1d. Public plan limits & pricing configuration
export async function handleGetPublicPlans(): Promise<{ status: number; data: any }> {
  try {
    const config = await getPlanConfigs();
    return { status: 200, data: config };
  } catch (err: any) {
    console.error('[Get Public Plans Error]:', err.message);
    return { status: 503, data: { error: 'Unable to load plan settings' } };
  }
}

// 1e. Super admin update dynamic plan limits & pricing
export async function handleUpdatePlanSettings(
  authHeader: string | null | undefined,
  body: any
): Promise<{ status: number; data: any }> {
  try {
    const verified = await requireSuperAdmin(authHeader);
    const rawPlans = body?.plans;
    if (!rawPlans || (typeof rawPlans !== 'object' && !Array.isArray(rawPlans))) {
      return { status: 400, data: { error: 'Plans payload is required.' } };
    }

    const existingConfig = await getPlanConfigs();
    const updatedPlans: Record<string, { price: number; priceNonprofit: number; generationLimit: number }> = {
      ...existingConfig.plans,
    };

    const entries: Array<{ id: string; price?: unknown; generationLimit?: unknown }> = Array.isArray(rawPlans)
      ? rawPlans
      : Object.entries(rawPlans).map(([id, val]: [string, any]) => ({ id, ...(val || {}) }));

    const changedSummary: string[] = [];
    const allowedPlanIds = new Set(['free', 'pro', 'team', 'complimentary']);

    for (const entry of entries) {
      if (!entry || typeof entry.id !== 'string' || !allowedPlanIds.has(entry.id)) {
        return { status: 400, data: { error: `Invalid plan identifier: ${entry?.id || 'unknown'}` } };
      }

      const rawPrice = entry.price !== undefined ? Number(entry.price) : updatedPlans[entry.id].price;
      const rawLimit =
        entry.generationLimit !== undefined ? Number(entry.generationLimit) : updatedPlans[entry.id].generationLimit;

      if (!Number.isFinite(rawPrice) || rawPrice < 0 || rawPrice > 100000) {
        return {
          status: 400,
          data: { error: `Invalid price for "${entry.id}" plan. Must be between $0 and $100,000.` },
        };
      }
      if (!Number.isFinite(rawLimit) || !Number.isInteger(rawLimit) || rawLimit < 1 || rawLimit > 1000000) {
        return {
          status: 400,
          data: { error: `Invalid monthly generation limit for "${entry.id}" plan. Must be an integer between 1 and 1,000,000.` },
        };
      }

      const cleanPrice = Math.round(rawPrice * 100) / 100;
      const cleanNonprofitPrice = Math.round(cleanPrice * 0.75 * 100) / 100;

      const prev = updatedPlans[entry.id];
      if (prev.price !== cleanPrice || prev.generationLimit !== rawLimit) {
        changedSummary.push(`${entry.id}: $${cleanPrice}/mo, ${rawLimit}/mo limit`);
      }

      updatedPlans[entry.id] = {
        price: cleanPrice,
        priceNonprofit: cleanNonprofitPrice,
        generationLimit: rawLimit,
      };
    }

    const now = new Date().toISOString();
    await adminDb.collection('settings').doc('plans').set(
      {
        id: 'plans',
        plans: updatedPlans,
        updatedAt: now,
        updatedBy: verified.uid,
        updatedByEmail: verified.email || '',
      },
      { merge: true }
    );

    await logServerAudit(
      'PLANS_UPDATED',
      changedSummary.length > 0
        ? `Updated dynamic plan limits & pricing (${changedSummary.join('; ')})`
        : 'Saved dynamic plan limits & pricing configuration',
      verified
    );

    return {
      status: 200,
      data: {
        plans: updatedPlans,
        updatedAt: now,
      },
    };
  } catch (err: any) {
    return { status: err.status || 500, data: { error: err.message } };
  }
}

// 2. Auth sync
export async function handleAuthSync(authHeader?: string | null): Promise<{ status: number; data: any }> {
  try {
    const verified = await verifyFirebaseTokenFromHeader(authHeader);
    const email = (verified.email || '').trim().toLowerCase();
    const isSuperAdmin = verified.emailVerified && !!email && SUPER_ADMIN_EMAILS.includes(email);
    const role = isSuperAdmin ? 'super_admin' : 'member';

    const now = new Date().toISOString();
    const userRef = adminDb.collection('users').doc(verified.uid);

    let snap;
    let platformSettings: PlatformSettingsRecord;
    try {
      [snap, platformSettings] = await Promise.all([userRef.get(), getPlatformSettings()]);
    } catch (e: any) {
      console.error('[Firestore Sync Read Error]:', e.message);
      throw new HttpError(503, 'Service temporarily unavailable while verifying account access.');
    }

    // Look up pending complimentary & team invites matching verified email up front (single-field queries, no composite index needed)
    let pendingInviteDocs: FirebaseFirestore.QueryDocumentSnapshot[] = [];
    let pendingTeamInviteDocs: FirebaseFirestore.QueryDocumentSnapshot[] = [];
    if (verified.emailVerified && email) {
      try {
        const [compSnap, teamSnap] = await Promise.all([
          adminDb.collection('invites').where('email', '==', email).get(),
          adminDb.collection('teamInvites').where('email', '==', email).get(),
        ]);

        for (const docSnap of compSnap.docs) {
          const inv = docSnap.data();
          if (inv.status !== 'pending') continue;
          const expiresAt = inv.expiresAt;
          if (expiresAt && new Date(expiresAt).getTime() <= Date.now()) {
            await docSnap.ref.update({ status: 'expired' }).catch(() => {});
          } else {
            pendingInviteDocs.push(docSnap);
          }
        }

        for (const docSnap of teamSnap.docs) {
          const inv = docSnap.data();
          if (inv.status !== 'pending') continue;
          const expiresAt = inv.expiresAt;
          if (expiresAt && new Date(expiresAt).getTime() <= Date.now()) {
            await docSnap.ref.update({ status: 'expired' }).catch(() => {});
            if (isValidFirestoreId(inv.orgId)) {
              await adminDb
                .collection('organizations')
                .doc(inv.orgId)
                .collection('invites')
                .doc(docSnap.id)
                .update({ status: 'expired' })
                .catch(() => {});
            }
          } else {
            pendingTeamInviteDocs.push(docSnap);
          }
        }
      } catch (invErr: any) {
        if (!snap.exists && platformSettings.inviteOnlyMode && !isSuperAdmin) {
          throw new HttpError(503, 'Unable to verify invitation status. Please try again.');
        }
        console.warn('[Invite Check Warning]:', invErr.message);
      }
    }

    // Block self-account creation when Invite-Only Mode is active (unless super admin or valid complimentary/team invite)
    if (
      !snap.exists &&
      platformSettings.inviteOnlyMode &&
      !isSuperAdmin &&
      pendingInviteDocs.length === 0 &&
      pendingTeamInviteDocs.length === 0
    ) {
      throw new HttpError(
        403,
        'Invite-only mode is active. Self-account creation is disabled—an invitation from a Millennium Agency administrator is required.',
        'INVITE_ONLY_REQUIRED'
      );
    }

    let userData: any = null;
    const personalOrgId = `org_${verified.uid}`;
    if (snap.exists) {
      const existing = snap.data()!;
      const resolvedRole = isSuperAdmin
        ? 'super_admin'
        : existing.role === 'super_admin'
        ? 'member'
        : existing.role || role;
      const resolvedOrgId = isValidFirestoreId(existing.organizationId)
        ? existing.organizationId
        : personalOrgId;
      const resolvedOrgIds = computeUserOrganizationIds(verified.uid, existing.organizationIds, resolvedOrgId);
      const resolvedOrgRole = existing.orgRole === 'member' || existing.orgRole === 'owner' ? existing.orgRole : 'owner';

      userData = {
        ...existing,
        id: verified.uid,
        email: email || (existing.email ? String(existing.email).trim().toLowerCase() : ''),
        name: verified.name || existing.name || email.split('@')[0],
        avatar: verified.picture || existing.avatar,
        role: resolvedRole,
        organizationId: resolvedOrgId,
        organizationIds: resolvedOrgIds,
        orgRole: resolvedOrgRole,
        lastLogin: now,
      };
      try {
        await userRef.set(userData, { merge: true });
      } catch (e: any) {
        console.warn('[Firestore Sync Write Warning]:', e.message);
      }
    } else {
      userData = {
        id: verified.uid,
        email,
        name: verified.name || email.split('@')[0] || 'User',
        avatar:
          verified.picture ||
          `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(verified.name || email)}`,
        role,
        planId: 'free',
        status: 'active',
        organizationId: personalOrgId,
        organizationIds: [personalOrgId],
        orgRole: 'owner',
        generationsUsedThisMonth: 0,
        totalGenerations: 0,
        bonusGenerations: 0,
        billingResetDate: getNextMonthFirstDay(),
        nonprofitDiscountApproved: false,
        signupDate: now,
        lastLogin: now,
      };
      try {
        await userRef.set(userData, { merge: true });
      } catch (e: any) {
        console.error('[Firestore Sync Create Error]:', e.message);
        throw new HttpError(503, 'Failed to initialize account record. Please try again.');
      }
    }

    // Always ensure personal workspace org_<uid> exists and backfill active organization
    await ensurePersonalWorkspace(verified.uid, userData, now);
    let orgData = await ensureOrganizationForUser(userData, verified.uid, now);
    // Ensure user is still a member of orgData; otherwise fall back to personal workspace
    if (orgData.ownerId !== verified.uid && !orgData.memberIds.includes(verified.uid)) {
      orgData = await ensurePersonalWorkspace(verified.uid, { ...userData, organizationId: personalOrgId }, now);
    }

    // Claim first valid pending complimentary invite matching user's exact verified email (updates organization planId)
    if (pendingInviteDocs.length > 0 && userData.status !== 'suspended') {
      try {
        for (const docSnap of pendingInviteDocs) {
          const targetOrgRef = adminDb.collection('organizations').doc(orgData.id);
          const claimed = await adminDb.runTransaction(async (tx) => {
            const [freshInv, freshOrg] = await Promise.all([tx.get(docSnap.ref), tx.get(targetOrgRef)]);
            if (!freshInv.exists || freshInv.data()?.status !== 'pending') {
              return false;
            }
            const currentSeatLimit = Number(freshOrg.data()?.seatLimit || 1);
            tx.set(
              targetOrgRef,
              {
                planId: 'complimentary',
                seatLimit: Math.max(currentSeatLimit, SEAT_LIMITS.complimentary),
                updatedAt: now,
              },
              { merge: true }
            );
            tx.set(userRef, { planId: 'complimentary', updatedAt: now }, { merge: true });
            tx.update(docSnap.ref, {
              status: 'accepted',
              acceptedAt: now,
              acceptedBy: verified.uid,
            });
            return true;
          });

          if (claimed) {
            userData.planId = 'complimentary';
            orgData = {
              ...orgData,
              planId: 'complimentary',
              seatLimit: Math.max(orgData.seatLimit || 1, SEAT_LIMITS.complimentary),
            };
            await syncPlanToOrgMembers(orgData.id, 'complimentary', now);
            await logServerAudit('INVITE_ACCEPTED', `Accepted complimentary access invite for ${email}`, verified, verified.uid);
            await logServerAudit('PLAN_CHANGED', `Organization ${orgData.id} plan changed to complimentary for ${email} via invite`, verified, verified.uid);
            break;
          }
        }
      } catch (invErr: any) {
        console.warn('[Invite Claim Warning]:', invErr.message);
      }
    }

    // Note: Pending team invites are NOT auto-joined on /api/auth/sync; users accept/decline them explicitly from the team switcher.

    // Collect valid teams & pending team invites for this user
    const { teams, pendingInvites, validOrgIds } = await getTeamSummariesAndInvitesForUser(
      verified.uid,
      email,
      verified.emailVerified,
      userData
    );

    // Ensure user reflects authoritative active organizationId, organizationIds, planId, orgRole, and profile
    const authoritativeOrgSnap = await adminDb.collection('organizations').doc(orgData.id).get();
    if (authoritativeOrgSnap.exists) {
      orgData = normalizeOrganizationRecord(orgData.id, authoritativeOrgSnap.data());
    }
    const authoritativeOrgRole = orgData.memberRoles?.[verified.uid] || (orgData.ownerId === verified.uid ? 'owner' : 'member');
    const orgSharedProfile = buildOrgProfileFromOrgDoc(orgData);
    const syncPatch: Record<string, any> = {};

    if (userData.organizationId !== orgData.id) {
      userData.organizationId = orgData.id;
      syncPatch.organizationId = orgData.id;
    }
    if (JSON.stringify(userData.organizationIds || []) !== JSON.stringify(validOrgIds)) {
      userData.organizationIds = validOrgIds;
      syncPatch.organizationIds = validOrgIds;
    }
    if (userData.planId !== orgData.planId) {
      userData.planId = orgData.planId;
      syncPatch.planId = orgData.planId;
    }
    if (userData.orgRole !== authoritativeOrgRole) {
      userData.orgRole = authoritativeOrgRole;
      syncPatch.orgRole = authoritativeOrgRole;
    }
    if (orgSharedProfile) {
      if (JSON.stringify(userData.organizationProfile || {}) !== JSON.stringify(orgSharedProfile)) {
        userData.organizationProfile = orgSharedProfile;
        syncPatch.organizationProfile = orgSharedProfile;
      }
    } else if (userData.organizationProfile !== undefined) {
      delete userData.organizationProfile;
      syncPatch.organizationProfile = FieldValue.delete();
    }

    if (Object.keys(syncPatch).length > 0) {
      syncPatch.updatedAt = now;
      await userRef.set(syncPatch, { merge: true }).catch(() => {});
    }

    if (isSuperAdmin) {
      try {
        await adminDb.collection('admins').doc(verified.uid).set(
          {
            id: verified.uid,
            email,
            role: 'super_admin',
            createdAt: now,
          },
          { merge: true }
        );
      } catch (e: any) {
        console.warn('[Firestore Admin Registry Write Warning]:', e.message);
      }
    } else {
      await adminDb.collection('admins').doc(verified.uid).delete().catch(() => {});
    }

    return {
      status: 200,
      data: {
        user: userData,
        organization: orgData,
        teams,
        pendingTeamInvites: pendingInvites,
        platformSettings: {
          inviteOnlyMode: platformSettings.inviteOnlyMode,
          paidPlansDisabled: platformSettings.inviteOnlyMode,
          selfSignupDisabled: platformSettings.inviteOnlyMode,
          ...(platformSettings.updatedAt ? { updatedAt: platformSettings.updatedAt } : {}),
        },
      },
    };
  } catch (err: any) {
    console.error('[Auth Sync Error]', err.message);
    return {
      status: err.status || 401,
      data: {
        error: err.message || 'Unauthorized: Firebase ID token verification failed',
        ...(err.code ? { code: err.code } : {}),
      },
    };
  }
}

// 3. List invites (super admins only)
export async function handleGetInvites(authHeader?: string | null): Promise<{ status: number; data: any }> {
  try {
    await requireSuperAdmin(authHeader);

    const snap = await adminDb.collection('invites').get();
    const invites: any[] = [];
    const now = Date.now();

    for (const docSnap of snap.docs) {
      const data = docSnap.data();
      let status = data.status || 'pending';
      if (status === 'pending' && data.expiresAt && new Date(data.expiresAt).getTime() <= now) {
        status = 'expired';
        await docSnap.ref.update({ status: 'expired' }).catch(() => {});
      }
      invites.push({
        id: docSnap.id,
        ...data,
        status,
      });
    }

    invites.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
    return { status: 200, data: { invites } };
  } catch (err: any) {
    return { status: err.status || 500, data: { error: err.message } };
  }
}

// 4. Create invite (super admins only)
export async function handleCreateInvite(
  authHeader: string | null | undefined,
  body: any
): Promise<{ status: number; data: any }> {
  try {
    const verified = await requireSuperAdmin(authHeader);

    const { email, note, expiresAt } = body || {};
    const cleanEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
    if (!cleanEmail || cleanEmail.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      return { status: 400, data: { error: 'Valid email address is required' } };
    }

    let parsedExpiresAt: string | null = null;
    if (expiresAt) {
      const d = new Date(expiresAt);
      if (isNaN(d.getTime())) {
        return { status: 400, data: { error: 'Invalid expiration date' } };
      }
      parsedExpiresAt = d.toISOString();
    }

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
      expiresAt: parsedExpiresAt,
      note: note ? String(note).trim().slice(0, 500) : '',
    };

    await inviteRef.set(inviteData);

    await logServerAudit(
      'INVITE_CREATED',
      `Created complimentary access invite for ${cleanEmail}${parsedExpiresAt ? ` (expires ${parsedExpiresAt})` : ''}`,
      verified
    );

    return { status: 200, data: { invite: inviteData } };
  } catch (err: any) {
    return { status: err.status || 500, data: { error: err.message } };
  }
}

// 5. Revoke invite (super admins only)
export async function handleRevokeInvite(
  authHeader: string | null | undefined,
  inviteId?: string
): Promise<{ status: number; data: any }> {
  try {
    const verified = await requireSuperAdmin(authHeader);
    if (!isValidFirestoreId(inviteId)) {
      return { status: 400, data: { error: 'Valid Invite ID is required' } };
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

    // Revoking an invite moves an accepted invitee's organization back to the free plan
    const targetEmail = (invData.email || '').trim().toLowerCase();
    const revertedOrgIds = new Set<string>();
    const revertedUserIds = new Set<string>();

    const revertUserAndOrg = async (uDocId: string, uData: any) => {
      const orgId = isValidFirestoreId(uData?.organizationId) ? uData.organizationId : `org_${uDocId}`;
      if (!revertedOrgIds.has(orgId)) {
        const orgRef = adminDb.collection('organizations').doc(orgId);
        const orgSnap = await orgRef.get();
        if (orgSnap.exists && orgSnap.data()?.planId === 'complimentary') {
          await orgRef.update({
            planId: 'free',
            seatLimit: SEAT_LIMITS.free,
            updatedAt: now,
          });
          await syncPlanToOrgMembers(orgId, 'free', now);
          revertedOrgIds.add(orgId);
          await logServerAudit(
            'PLAN_CHANGED',
            `Organization ${orgId} plan reverted to free due to invite revocation for ${targetEmail}`,
            verified,
            uDocId
          );
        }
      }
      if (!revertedUserIds.has(uDocId) && uData?.planId === 'complimentary') {
        await adminDb.collection('users').doc(uDocId).update({
          planId: 'free',
          updatedAt: now,
        });
        revertedUserIds.add(uDocId);
      }
    };

    if (invData.acceptedBy && isValidFirestoreId(invData.acceptedBy)) {
      const acceptedSnap = await adminDb.collection('users').doc(invData.acceptedBy).get();
      if (acceptedSnap.exists) {
        await revertUserAndOrg(acceptedSnap.id, acceptedSnap.data());
      }
    }

    if (targetEmail) {
      const userQuery = await adminDb
        .collection('users')
        .where('email', '==', targetEmail)
        .get();

      for (const uDoc of userQuery.docs) {
        if (revertedUserIds.has(uDoc.id)) continue;
        await revertUserAndOrg(uDoc.id, uDoc.data());
      }
    }

    await logServerAudit('INVITE_REVOKED', `Revoked complimentary access invite for ${invData.email}`, verified);

    return { status: 200, data: { success: true } };
  } catch (err: any) {
    return { status: err.status || 500, data: { error: err.message } };
  }
}

// 6. Get single invite details (masks email and hides note unless caller matches or is super admin)
export async function handleGetInvite(
  inviteId?: string,
  authHeader?: string | null
): Promise<{ status: number; data: any }> {
  try {
    if (!isValidFirestoreId(inviteId)) {
      return { status: 400, data: { error: 'Valid Invite ID is required' } };
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

    let canViewFullDetails = false;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        const caller = await verifyFirebaseTokenFromHeader(authHeader);
        const callerEmail = (caller.email || '').trim().toLowerCase();
        const isCallerAdmin = caller.emailVerified && !!callerEmail && SUPER_ADMIN_EMAILS.includes(callerEmail);
        const isMatchingInvitee = caller.emailVerified && !!callerEmail && callerEmail === (data.email || '').trim().toLowerCase();
        canViewFullDetails = isCallerAdmin || isMatchingInvitee;
      } catch {
        canViewFullDetails = false;
      }
    }

    return {
      status: 200,
      data: {
        invite: {
          id: snap.id,
          email: canViewFullDetails ? data.email : maskEmailAddress(data.email || ''),
          plan: data.plan,
          status,
          ...(canViewFullDetails && data.note ? { note: data.note } : {}),
          expiresAt: data.expiresAt,
          createdAt: data.createdAt,
        },
      },
    };
  } catch (err: any) {
    return { status: 500, data: { error: err.message } };
  }
}

// 7. Accept invite via link (transactional, prevents replay on accepted/expired/revoked invites)
export async function handleAcceptInvite(
  authHeader: string | null | undefined,
  inviteId?: string
): Promise<{ status: number; data: any }> {
  try {
    if (!isValidFirestoreId(inviteId)) {
      return { status: 400, data: { error: 'Valid Invite ID is required' } };
    }
    const verified = await verifyFirebaseTokenFromHeader(authHeader);
    const userEmail = (verified.email || '').trim().toLowerCase();
    if (!verified.emailVerified || !userEmail) {
      return { status: 403, data: { error: 'A verified email address is required to claim an invitation.' } };
    }

    const inviteRef = adminDb.collection('invites').doc(inviteId);
    const userRef = adminDb.collection('users').doc(verified.uid);
    const now = new Date().toISOString();

    const preUserSnap = await userRef.get();
    const targetOrgId = isValidFirestoreId(preUserSnap.data()?.organizationId)
      ? preUserSnap.data()!.organizationId
      : `org_${verified.uid}`;
    const orgRef = adminDb.collection('organizations').doc(targetOrgId);

    await adminDb.runTransaction(async (tx) => {
      const [snap, userSnap, orgSnap] = await Promise.all([
        tx.get(inviteRef),
        tx.get(userRef),
        tx.get(orgRef),
      ]);

      if (!snap.exists) {
        throw new HttpError(404, 'Invite not found');
      }

      const invData = snap.data()!;
      const invEmail = (invData.email || '').trim().toLowerCase();
      if (invEmail !== userEmail) {
        throw new HttpError(
          403,
          `This invite was sent to another email address. You are signed in as ${userEmail}. Please sign in with the invited email address.`
        );
      }

      if (invData.status === 'revoked') {
        throw new HttpError(400, 'This invitation has been revoked.');
      }

      if (invData.status === 'expired' || (invData.expiresAt && new Date(invData.expiresAt).getTime() <= Date.now())) {
        if (invData.status !== 'expired') {
          tx.update(inviteRef, { status: 'expired' });
        }
        throw new HttpError(400, 'This invitation has expired.');
      }

      if (invData.status !== 'pending') {
        throw new HttpError(400, 'This invitation has already been used or is no longer pending.');
      }

      if (userSnap.exists && userSnap.data()?.status === 'suspended') {
        throw new HttpError(403, 'Your account is currently suspended. Please contact support.');
      }

      const nextSeatLimit = orgSnap.exists
        ? Math.max(Number(orgSnap.data()?.seatLimit || 1), SEAT_LIMITS.complimentary)
        : SEAT_LIMITS.complimentary;

      if (!orgSnap.exists) {
        tx.set(orgRef, {
          id: targetOrgId,
          name:
            userSnap.data()?.organizationProfile?.orgName ||
            `${verified.name || userEmail.split('@')[0] || 'Personal'}'s Workspace`,
          ownerId: verified.uid,
          memberIds: [verified.uid],
          memberRoles: { [verified.uid]: 'owner' },
          planId: 'complimentary',
          seatLimit: nextSeatLimit,
          generationsUsedThisMonth: Number(userSnap.data()?.generationsUsedThisMonth || 0),
          bonusGenerations: Number(userSnap.data()?.bonusGenerations || 0),
          billingResetDate: userSnap.data()?.billingResetDate || getNextMonthFirstDay(),
          createdAt: now,
          updatedAt: now,
        });
      } else {
        tx.set(
          orgRef,
          {
            planId: 'complimentary',
            seatLimit: nextSeatLimit,
            updatedAt: now,
          },
          { merge: true }
        );
      }

      if (!userSnap.exists) {
        tx.set(userRef, {
          id: verified.uid,
          email: userEmail,
          name: verified.name || userEmail.split('@')[0] || 'User',
          avatar:
            verified.picture ||
            `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(verified.name || userEmail)}`,
          role: 'member',
          planId: 'complimentary',
          status: 'active',
          organizationId: targetOrgId,
          organizationIds: [`org_${verified.uid}`],
          orgRole: 'owner',
          generationsUsedThisMonth: 0,
          totalGenerations: 0,
          bonusGenerations: 0,
          billingResetDate: getNextMonthFirstDay(),
          nonprofitDiscountApproved: false,
          signupDate: now,
          lastLogin: now,
          updatedAt: now,
        });
      } else {
        const existingOrgIds = computeUserOrganizationIds(
          verified.uid,
          userSnap.data()?.organizationIds,
          targetOrgId
        );
        tx.set(
          userRef,
          {
            planId: 'complimentary',
            organizationId: targetOrgId,
            organizationIds: existingOrgIds,
            orgRole: userSnap.data()?.orgRole || 'owner',
            updatedAt: now,
          },
          { merge: true }
        );
      }

      tx.update(inviteRef, {
        status: 'accepted',
        acceptedAt: now,
        acceptedBy: verified.uid,
      });
    });

    await syncPlanToOrgMembers(targetOrgId, 'complimentary', now);
    await logServerAudit('INVITE_ACCEPTED', `User ${userEmail} accepted complimentary access invite ${inviteId}`, verified, verified.uid);
    await logServerAudit('PLAN_CHANGED', `Organization ${targetOrgId} plan changed to complimentary for ${userEmail} via invite ${inviteId}`, verified, verified.uid);

    const [finalUserSnap, finalOrgSnap] = await Promise.all([userRef.get(), orgRef.get()]);
    const finalOrg = finalOrgSnap.exists ? normalizeOrganizationRecord(targetOrgId, finalOrgSnap.data()) : null;
    return { status: 200, data: { success: true, user: finalUserSnap.data(), organization: finalOrg } };
  } catch (err: any) {
    return { status: err.status || 500, data: { error: err.message } };
  }
}

// 8. Super admin update user / organization plan
export async function handleUpdateUserPlan(
  authHeader: string | null | undefined,
  userId?: string,
  planId?: string
): Promise<{ status: number; data: any }> {
  try {
    const verified = await requireSuperAdmin(authHeader);
    if (!isValidFirestoreId(userId)) {
      return { status: 400, data: { error: 'Valid User ID is required' } };
    }

    if (!planId || !['free', 'pro', 'team', 'complimentary'].includes(planId)) {
      return { status: 400, data: { error: 'Invalid planId' } };
    }

    const platformSettings = await getPlatformSettings();
    if (platformSettings.inviteOnlyMode && (planId === 'pro' || planId === 'team')) {
      return {
        status: 403,
        data: { error: 'Paid plans (Pro and Team) are disabled while Invite-Only Mode is active.' },
      };
    }

    const userRef = adminDb.collection('users').doc(userId);
    const snap = await userRef.get();
    if (!snap.exists) {
      return { status: 404, data: { error: 'User not found' } };
    }

    const uData = snap.data()!;
    const prevPlan = uData.planId || 'free';
    const targetEmail = uData.email || userId;
    const now = new Date().toISOString();
    const orgId = isValidFirestoreId(uData.organizationId) ? uData.organizationId : `org_${userId}`;

    const orgRef = adminDb.collection('organizations').doc(orgId);
    const orgSnap = await orgRef.get();
    const newSeatLimit = getDefaultSeatLimit(planId);

    if (orgSnap.exists) {
      await orgRef.update({
        planId,
        seatLimit: newSeatLimit,
        updatedAt: now,
      });
    } else {
      await ensureOrganizationForUser({ ...uData, planId, organizationId: orgId }, userId, now);
    }

    await userRef.update({
      planId,
      organizationId: orgId,
      updatedAt: now,
    });
    await syncPlanToOrgMembers(orgId, planId, now);

    await logServerAudit(
      'PLAN_CHANGED',
      `Super admin changed plan for ${targetEmail} (org ${orgId}) from ${prevPlan} to ${planId}`,
      verified,
      userId
    );

    return { status: 200, data: { success: true } };
  } catch (err: any) {
    return { status: err.status || 500, data: { error: err.message } };
  }
}

// 9. Super admin update user role
export async function handleUpdateUserRole(
  authHeader: string | null | undefined,
  userId?: string,
  role?: string
): Promise<{ status: number; data: any }> {
  try {
    const verified = await requireSuperAdmin(authHeader);
    if (!isValidFirestoreId(userId)) {
      return { status: 400, data: { error: 'Valid User ID is required' } };
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
    return { status: err.status || 500, data: { error: err.message } };
  }
}

// 9b. Super admin privileged user management actions
export async function handleAdminUserAction(
  authHeader: string | null | undefined,
  userId?: string,
  body?: { action?: string; amount?: number }
): Promise<{ status: number; data: any }> {
  try {
    const verified = await requireSuperAdmin(authHeader);
    if (!isValidFirestoreId(userId)) {
      return { status: 400, data: { error: 'Valid User ID is required' } };
    }

    const action = body?.action;
    if (!action || !['grant_bonus', 'reset_usage', 'toggle_discount', 'toggle_status', 'delete_user'].includes(action)) {
      return { status: 400, data: { error: 'Invalid admin action' } };
    }

    const userRef = adminDb.collection('users').doc(userId);
    const now = new Date().toISOString();

    if (action === 'grant_bonus') {
      const amount = Number(body?.amount);
      if (!Number.isInteger(amount) || amount < 1 || amount > 10000) {
        return { status: 400, data: { error: 'Bonus amount must be an integer between 1 and 10000' } };
      }
      const preSnap = await userRef.get();
      if (!preSnap.exists) return { status: 404, data: { error: 'User not found' } };
      const orgId = isValidFirestoreId(preSnap.data()?.organizationId)
        ? preSnap.data()!.organizationId
        : `org_${userId}`;
      const orgRef = adminDb.collection('organizations').doc(orgId);

      const result = await adminDb.runTransaction(async (tx) => {
        const [snap, orgSnap] = await Promise.all([tx.get(userRef), tx.get(orgRef)]);
        if (!snap.exists) throw new HttpError(404, 'User not found');
        const currentOrgBonus = orgSnap.exists
          ? Number(orgSnap.data()?.bonusGenerations || 0)
          : Number(snap.data()?.bonusGenerations || 0);
        const updatedBonus = currentOrgBonus + amount;
        if (orgSnap.exists) {
          tx.update(orgRef, { bonusGenerations: updatedBonus, updatedAt: now });
        }
        tx.update(userRef, { bonusGenerations: updatedBonus, updatedAt: now });
        return { ...snap.data(), bonusGenerations: updatedBonus };
      });
      await logServerAudit('BONUS_GENERATIONS_GRANTED', `Granted +${amount} bonus generations to org ${orgId}`, verified, userId);
      return { status: 200, data: { success: true, user: result } };
    }

    if (action === 'reset_usage') {
      const resetDate = getNextMonthFirstDay();
      const preSnap = await userRef.get();
      if (!preSnap.exists) return { status: 404, data: { error: 'User not found' } };
      const orgId = isValidFirestoreId(preSnap.data()?.organizationId)
        ? preSnap.data()!.organizationId
        : `org_${userId}`;
      const orgRef = adminDb.collection('organizations').doc(orgId);

      const result = await adminDb.runTransaction(async (tx) => {
        const [snap, orgSnap] = await Promise.all([tx.get(userRef), tx.get(orgRef)]);
        if (!snap.exists) throw new HttpError(404, 'User not found');
        if (orgSnap.exists) {
          tx.update(orgRef, { generationsUsedThisMonth: 0, billingResetDate: resetDate, updatedAt: now });
        }
        tx.update(userRef, { generationsUsedThisMonth: 0, billingResetDate: resetDate, updatedAt: now });
        return { ...snap.data(), generationsUsedThisMonth: 0, billingResetDate: resetDate };
      });
      await logServerAudit('USAGE_RESET', `Monthly generation usage reset to 0 for org ${orgId}`, verified, userId);
      return { status: 200, data: { success: true, user: result } };
    }

    if (action === 'toggle_discount') {
      const result = await adminDb.runTransaction(async (tx) => {
        const snap = await tx.get(userRef);
        if (!snap.exists) throw new HttpError(404, 'User not found');
        const nextVal = !snap.data()?.nonprofitDiscountApproved;
        tx.update(userRef, { nonprofitDiscountApproved: nextVal, updatedAt: now });
        return { ...snap.data(), nonprofitDiscountApproved: nextVal };
      });
      await logServerAudit(
        'DISCOUNT_TOGGLED',
        `Admin toggled nonprofit 25% discount to ${result.nonprofitDiscountApproved}`,
        verified,
        userId
      );
      return { status: 200, data: { success: true, user: result } };
    }

    if (action === 'toggle_status') {
      if (userId === verified.uid) {
        return { status: 400, data: { error: 'Cannot suspend your own super admin account' } };
      }
      const result = await adminDb.runTransaction(async (tx) => {
        const snap = await tx.get(userRef);
        if (!snap.exists) throw new HttpError(404, 'User not found');
        const nextStatus = snap.data()?.status === 'suspended' ? 'active' : 'suspended';
        tx.update(userRef, { status: nextStatus, updatedAt: now });
        return { ...snap.data(), status: nextStatus };
      });
      await logServerAudit('USER_STATUS_CHANGE', `Admin changed user status to ${result.status}`, verified, userId);
      return { status: 200, data: { success: true, user: result } };
    }

    if (action === 'delete_user') {
      if (userId === verified.uid) {
        return { status: 400, data: { error: 'Cannot delete your own super admin account' } };
      }
      const snap = await userRef.get();
      if (!snap.exists) {
        return { status: 404, data: { error: 'User not found' } };
      }
      const uData = snap.data()!;
      const allUserOrgIds = computeUserOrganizationIds(userId, uData.organizationIds, uData.organizationId);
      const orgSnaps = await Promise.all(
        allUserOrgIds.map((oId) => adminDb.collection('organizations').doc(oId).get().catch(() => null))
      );

      for (const orgSnap of orgSnaps) {
        if (!orgSnap || !orgSnap.exists) continue;
        const orgData = orgSnap.data()!;
        const members = Array.from(new Set(Array.isArray(orgData.memberIds) ? orgData.memberIds : []));
        if (orgData.ownerId === userId && members.filter((id) => id !== userId).length > 0) {
          return {
            status: 400,
            data: {
              error: `Cannot delete user while they still own multi-member team "${orgData.name || orgSnap.id}". Remove members or transfer ownership first.`,
            },
          };
        }
      }

      for (const orgSnap of orgSnaps) {
        if (!orgSnap || !orgSnap.exists) continue;
        const orgData = orgSnap.data()!;
        if (orgData.ownerId === userId) {
          await deleteOrganizationCascade(orgSnap.id);
        } else {
          await orgSnap.ref
            .update({
              memberIds: FieldValue.arrayRemove(userId),
              [`memberRoles.${userId}`]: FieldValue.delete(),
              updatedAt: now,
            })
            .catch(() => {});
        }
      }

      await userRef.delete();
      await adminDb.collection('admins').doc(userId).delete().catch(() => {});
      await logServerAudit('USER_DELETED', `Super admin deleted user ${uData.email || userId}`, verified, userId);
      return { status: 200, data: { success: true } };
    }

    return { status: 400, data: { error: 'Unsupported action' } };
  } catch (err: any) {
    return { status: err.status || 500, data: { error: err.message } };
  }
}

// 9c. Self-service account deletion
export async function handleDeleteOwnAccount(authHeader?: string | null): Promise<{ status: number; data: any }> {
  try {
    const verified = await verifyFirebaseTokenFromHeader(authHeader);
    const userRef = adminDb.collection('users').doc(verified.uid);
    const userSnap = await userRef.get();
    const userData = userSnap.exists ? userSnap.data()! : {};
    const allUserOrgIds = computeUserOrganizationIds(verified.uid, userData.organizationIds, userData.organizationId);
    const now = new Date().toISOString();

    const orgSnaps = await Promise.all(
      allUserOrgIds.map((oId) => adminDb.collection('organizations').doc(oId).get().catch(() => null))
    );

    for (const orgSnap of orgSnaps) {
      if (!orgSnap || !orgSnap.exists) continue;
      const orgData = orgSnap.data()!;
      const otherMembers = (Array.isArray(orgData.memberIds) ? orgData.memberIds : []).filter(
        (id: string) => id !== verified.uid
      );
      if (orgData.ownerId === verified.uid && otherMembers.length > 0) {
        return {
          status: 400,
          data: {
            error: `You are the owner of multi-member team "${orgData.name || orgSnap.id}". Transfer ownership to another member before deleting your account.`,
          },
        };
      }
    }

    for (const orgSnap of orgSnaps) {
      if (!orgSnap || !orgSnap.exists) continue;
      const orgData = orgSnap.data()!;
      if (orgData.ownerId === verified.uid) {
        await deleteOrganizationCascade(orgSnap.id);
      } else {
        await orgSnap.ref
          .update({
            memberIds: FieldValue.arrayRemove(verified.uid),
            [`memberRoles.${verified.uid}`]: FieldValue.delete(),
            updatedAt: now,
          })
          .catch(() => {});
      }
    }

    await userRef.delete().catch(() => {});
    await adminDb.collection('admins').doc(verified.uid).delete().catch(() => {});

    await logServerAudit('ACCOUNT_DELETED', `User ${verified.email || verified.uid} deleted their account`, verified, verified.uid);
    return { status: 200, data: { success: true } };
  } catch (err: any) {
    return { status: err.status || 500, data: { error: err.message } };
  }
}

// =========================================================================
// TEAM MANAGEMENT HANDLERS (ADMIN SDK ONLY)
// =========================================================================

// T0. List all teams user belongs to + pending invites
export async function handleGetUserTeams(authHeader?: string | null): Promise<{ status: number; data: any }> {
  try {
    const verified = await verifyFirebaseTokenFromHeader(authHeader);
    const now = new Date().toISOString();
    const userRef = adminDb.collection('users').doc(verified.uid);
    const userSnap = await userRef.get();
    if (!userSnap.exists) {
      return { status: 404, data: { error: 'Account not found. Please sign in again.' } };
    }
    const userData = userSnap.data()!;
    await ensurePersonalWorkspace(verified.uid, userData, now);
    const { teams, pendingInvites, validOrgIds } = await getTeamSummariesAndInvitesForUser(
      verified.uid,
      verified.email,
      verified.emailVerified,
      userData
    );

    if (JSON.stringify(userData.organizationIds || []) !== JSON.stringify(validOrgIds)) {
      userRef.set({ organizationIds: validOrgIds, updatedAt: now }, { merge: true }).catch(() => {});
    }

    return {
      status: 200,
      data: {
        teams,
        pendingInvites,
        activeOrganizationId: isValidFirestoreId(userData.organizationId)
          ? userData.organizationId
          : `org_${verified.uid}`,
        organizationIds: validOrgIds,
      },
    };
  } catch (err: any) {
    return { status: err.status || 500, data: { error: err.message } };
  }
}

// T0b. Switch active team workspace
export async function handleSwitchTeam(
  authHeader: string | null | undefined,
  body: any
): Promise<{ status: number; data: any }> {
  try {
    const verified = await verifyFirebaseTokenFromHeader(authHeader);
    const targetOrgId = body?.organizationId;
    if (!isValidFirestoreId(targetOrgId)) {
      return { status: 400, data: { error: 'Valid organizationId is required.' } };
    }

    const now = new Date().toISOString();
    const userRef = adminDb.collection('users').doc(verified.uid);
    const orgRef = adminDb.collection('organizations').doc(targetOrgId);
    const [userSnap, orgSnap] = await Promise.all([userRef.get(), orgRef.get()]);

    if (!userSnap.exists) {
      return { status: 404, data: { error: 'Account not found.' } };
    }
    if (!orgSnap.exists) {
      return { status: 404, data: { error: 'Team not found.' } };
    }

    const orgData = normalizeOrganizationRecord(targetOrgId, orgSnap.data());
    const isMember = orgData.ownerId === verified.uid || orgData.memberIds.includes(verified.uid);
    if (!isMember) {
      return { status: 403, data: { error: 'Forbidden: You are not a member of this team.' } };
    }

    const userData = userSnap.data()!;
    const prevOrgId = userData.organizationId || `org_${verified.uid}`;
    const nextOrgRole: 'owner' | 'member' =
      orgData.memberRoles?.[verified.uid] || (orgData.ownerId === verified.uid ? 'owner' : 'member');
    const updatedOrgIds = computeUserOrganizationIds(verified.uid, userData.organizationIds, targetOrgId);
    const sharedProfile = buildOrgProfileFromOrgDoc(orgData);

    const writePatch: Record<string, any> = {
      organizationId: targetOrgId,
      organizationIds: updatedOrgIds,
      orgRole: nextOrgRole,
      planId: orgData.planId || 'free',
      updatedAt: now,
    };
    if (sharedProfile) {
      writePatch.organizationProfile = sharedProfile;
    } else {
      writePatch.organizationProfile = FieldValue.delete();
    }

    await userRef.set(writePatch, { merge: true });

    const [updatedUserSnap, teamsInfo] = await Promise.all([
      userRef.get(),
      getTeamSummariesAndInvitesForUser(verified.uid, verified.email, verified.emailVerified, {
        ...userData,
        organizationId: targetOrgId,
        organizationIds: updatedOrgIds,
      }),
    ]);

    if (prevOrgId !== targetOrgId) {
      await logServerAudit(
        'TEAM_SWITCHED',
        `Switched active workspace from ${prevOrgId} to ${orgData.name} (${targetOrgId})`,
        verified,
        verified.uid
      );
    }

    return {
      status: 200,
      data: {
        user: updatedUserSnap.data(),
        organization: orgData,
        teams: teamsInfo.teams,
        pendingTeamInvites: teamsInfo.pendingInvites,
      },
    };
  } catch (err: any) {
    return { status: err.status || 500, data: { error: err.message } };
  }
}

// T0c. Create a new team (free plan; caller becomes owner; max 10 teams)
export async function handleCreateTeam(
  authHeader: string | null | undefined,
  body: any
): Promise<{ status: number; data: any }> {
  try {
    const verified = await verifyFirebaseTokenFromHeader(authHeader);
    const cleanName = typeof body?.name === 'string' ? body.name.trim().slice(0, 120) : '';
    if (!cleanName) {
      return { status: 400, data: { error: 'Team name is required.' } };
    }

    const now = new Date().toISOString();
    const userRef = adminDb.collection('users').doc(verified.uid);
    const userSnap = await userRef.get();
    if (!userSnap.exists) {
      return { status: 404, data: { error: 'Account not found.' } };
    }

    const userData = userSnap.data()!;
    await ensurePersonalWorkspace(verified.uid, userData, now);
    const { validOrgIds } = await getTeamSummariesAndInvitesForUser(
      verified.uid,
      verified.email,
      verified.emailVerified,
      userData
    );

    if (validOrgIds.length >= MAX_TEAMS_PER_USER) {
      return {
        status: 400,
        data: { error: `Team limit reached. You can belong to at most ${MAX_TEAMS_PER_USER} teams (including your personal workspace).` },
      };
    }

    const teamId = `team_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const newOrg = {
      id: teamId,
      name: cleanName,
      ownerId: verified.uid,
      memberIds: [verified.uid],
      memberRoles: { [verified.uid]: 'owner' as const },
      planId: 'free',
      seatLimit: SEAT_LIMITS.free,
      generationsUsedThisMonth: 0,
      bonusGenerations: 0,
      billingResetDate: getNextMonthFirstDay(),
      createdAt: now,
      updatedAt: now,
    };

    const nextOrgIds = computeUserOrganizationIds(verified.uid, validOrgIds, teamId);
    const switchToNew = body?.switchActive !== false;

    const batch = adminDb.batch();
    batch.set(adminDb.collection('organizations').doc(teamId), newOrg);
    const userPatch: Record<string, any> = {
      organizationIds: nextOrgIds,
      updatedAt: now,
    };
    if (switchToNew) {
      userPatch.organizationId = teamId;
      userPatch.orgRole = 'owner';
      userPatch.planId = 'free';
      userPatch.organizationProfile = FieldValue.delete();
    }
    batch.set(userRef, userPatch, { merge: true });
    await batch.commit();

    await logServerAudit(
      'TEAM_CREATED',
      `Created new team "${cleanName}" (${teamId})`,
      verified,
      verified.uid
    );

    const [updatedUserSnap, teamsInfo] = await Promise.all([
      userRef.get(),
      getTeamSummariesAndInvitesForUser(verified.uid, verified.email, verified.emailVerified, {
        ...userData,
        organizationIds: nextOrgIds,
        ...(switchToNew ? { organizationId: teamId } : {}),
      }),
    ]);

    return {
      status: 200,
      data: {
        user: updatedUserSnap.data(),
        organization: normalizeOrganizationRecord(teamId, newOrg),
        teams: teamsInfo.teams,
        pendingTeamInvites: teamsInfo.pendingInvites,
      },
    };
  } catch (err: any) {
    return { status: err.status || 500, data: { error: err.message } };
  }
}

// T0d. Rename a team (owner only; not personal workspaces)
export async function handleRenameTeam(
  authHeader: string | null | undefined,
  body: any
): Promise<{ status: number; data: any }> {
  try {
    const verified = await verifyFirebaseTokenFromHeader(authHeader);
    const cleanName = typeof body?.name === 'string' ? body.name.trim().slice(0, 120) : '';
    if (!cleanName) {
      return { status: 400, data: { error: 'New team name is required.' } };
    }

    const userSnap = await adminDb.collection('users').doc(verified.uid).get();
    if (!userSnap.exists) {
      return { status: 404, data: { error: 'Account not found.' } };
    }
    const orgId = isValidFirestoreId(body?.organizationId)
      ? body.organizationId
      : isValidFirestoreId(userSnap.data()?.organizationId)
      ? userSnap.data()!.organizationId
      : `org_${verified.uid}`;

    if (orgId === `org_${verified.uid}`) {
      return { status: 400, data: { error: 'Your personal workspace cannot be renamed here.' } };
    }

    const orgRef = adminDb.collection('organizations').doc(orgId);
    const orgSnap = await orgRef.get();
    if (!orgSnap.exists) {
      return { status: 404, data: { error: 'Team not found.' } };
    }
    const rawOrg = orgSnap.data()!;
    if (rawOrg.ownerId !== verified.uid) {
      return { status: 403, data: { error: 'Only the team owner can rename this team.' } };
    }

    const prevName = rawOrg.name || orgId;
    const now = new Date().toISOString();
    await orgRef.update({ name: cleanName, updatedAt: now });

    // Sync active orgProfile.orgName for members currently viewing this team
    const memberIds: string[] = Array.from(
      new Set([...(Array.isArray(rawOrg.memberIds) ? rawOrg.memberIds : []), verified.uid])
    ).filter((id) => isValidFirestoreId(id));
    const memberSnaps = await Promise.all(memberIds.map((mId) => adminDb.collection('users').doc(mId).get()));
    const batch = adminDb.batch();
    let syncCount = 0;
    for (const mSnap of memberSnaps) {
      if (!mSnap.exists) continue;
      const mData = mSnap.data()!;
      if (mData.organizationId === orgId && mData.organizationProfile) {
        batch.set(
          mSnap.ref,
          { organizationProfile: { ...mData.organizationProfile, orgName: cleanName }, updatedAt: now },
          { merge: true }
        );
        syncCount++;
      }
    }
    if (syncCount > 0) await batch.commit();

    await logServerAudit(
      'TEAM_RENAMED',
      `Renamed team ${orgId} from "${prevName}" to "${cleanName}"`,
      verified,
      verified.uid
    );

    const updatedOrg = normalizeOrganizationRecord(orgId, { ...rawOrg, name: cleanName, updatedAt: now });
    return { status: 200, data: { organization: updatedOrg } };
  } catch (err: any) {
    return { status: err.status || 500, data: { error: err.message } };
  }
}

// T0e. Delete a team (owner only; not personal workspaces)
export async function handleDeleteTeam(
  authHeader: string | null | undefined,
  body: any
): Promise<{ status: number; data: any }> {
  try {
    const verified = await verifyFirebaseTokenFromHeader(authHeader);
    const now = new Date().toISOString();
    const userRef = adminDb.collection('users').doc(verified.uid);
    const userSnap = await userRef.get();
    if (!userSnap.exists) {
      return { status: 404, data: { error: 'Account not found.' } };
    }

    const orgId = isValidFirestoreId(body?.organizationId)
      ? body.organizationId
      : isValidFirestoreId(userSnap.data()?.organizationId)
      ? userSnap.data()!.organizationId
      : `org_${verified.uid}`;

    if (orgId === `org_${verified.uid}`) {
      return { status: 400, data: { error: 'Your personal workspace cannot be deleted.' } };
    }

    const orgRef = adminDb.collection('organizations').doc(orgId);
    const orgSnap = await orgRef.get();
    if (!orgSnap.exists) {
      return { status: 404, data: { error: 'Team not found.' } };
    }
    const rawOrg = orgSnap.data()!;
    if (rawOrg.ownerId !== verified.uid) {
      return { status: 403, data: { error: 'Only the team owner can delete this team.' } };
    }

    const memberIds: string[] = Array.from(
      new Set([...(Array.isArray(rawOrg.memberIds) ? rawOrg.memberIds : []), verified.uid])
    ).filter((id) => isValidFirestoreId(id));

    // Remove orgId from every member's organizationIds and switch anyone active on it back to their personal workspace
    for (const mId of memberIds) {
      const mRef = adminDb.collection('users').doc(mId);
      const mSnap = await mRef.get().catch(() => null);
      if (!mSnap || !mSnap.exists) continue;
      const mData = mSnap.data()!;
      const personalId = `org_${mId}`;
      const filteredOrgIds = computeUserOrganizationIds(mId, mData.organizationIds).filter((id) => id !== orgId);
      const patch: Record<string, any> = {
        organizationIds: filteredOrgIds,
        updatedAt: now,
      };
      if (mData.organizationId === orgId) {
        const personalOrg = await ensurePersonalWorkspace(mId, { ...mData, organizationId: personalId }, now);
        const personalProfile = buildOrgProfileFromOrgDoc(personalOrg);
        patch.organizationId = personalId;
        patch.orgRole = 'owner';
        patch.planId = personalOrg.planId || 'free';
        patch.organizationProfile = personalProfile || FieldValue.delete();
      }
      await mRef.set(patch, { merge: true }).catch(() => {});
    }

    await deleteOrganizationCascade(orgId);

    await logServerAudit(
      'TEAM_DELETED',
      `Deleted team "${rawOrg.name || orgId}" (${orgId})`,
      verified,
      verified.uid
    );

    const [updatedUserSnap, personalOrgSnap] = await Promise.all([
      userRef.get(),
      adminDb.collection('organizations').doc(
        isValidFirestoreId((await userRef.get()).data()?.organizationId)
          ? (await userRef.get()).data()!.organizationId
          : `org_${verified.uid}`
      ).get(),
    ]);
    const finalUser = updatedUserSnap.data();
    const activeOrgId = isValidFirestoreId(finalUser?.organizationId) ? finalUser!.organizationId : `org_${verified.uid}`;
    const activeOrg = personalOrgSnap.exists
      ? normalizeOrganizationRecord(activeOrgId, personalOrgSnap.data())
      : await ensurePersonalWorkspace(verified.uid, finalUser, now);
    const teamsInfo = await getTeamSummariesAndInvitesForUser(
      verified.uid,
      verified.email,
      verified.emailVerified,
      finalUser
    );

    return {
      status: 200,
      data: {
        success: true,
        user: finalUser,
        organization: activeOrg,
        teams: teamsInfo.teams,
        pendingTeamInvites: teamsInfo.pendingInvites,
      },
    };
  } catch (err: any) {
    return { status: err.status || 500, data: { error: err.message } };
  }
}

// T1. Get organization team state (supports optional ?organizationId=)
export async function handleGetTeam(
  authHeader?: string | null,
  requestedOrgId?: string | null
): Promise<{ status: number; data: any }> {
  try {
    const verified = await verifyFirebaseTokenFromHeader(authHeader);
    const now = new Date().toISOString();
    const userRef = adminDb.collection('users').doc(verified.uid);
    const userSnap = await userRef.get();
    if (!userSnap.exists) {
      return { status: 404, data: { error: 'Account not found. Please sign in again.' } };
    }
    const userData = userSnap.data()!;
    let org: any;
    if (requestedOrgId) {
      if (!isValidFirestoreId(requestedOrgId)) {
        return { status: 400, data: { error: 'Valid organizationId is required.' } };
      }
      const reqSnap = await adminDb.collection('organizations').doc(requestedOrgId).get();
      if (!reqSnap.exists) {
        return { status: 404, data: { error: 'Team not found.' } };
      }
      org = normalizeOrganizationRecord(requestedOrgId, reqSnap.data());
      if (org.ownerId !== verified.uid && !org.memberIds.includes(verified.uid)) {
        return { status: 403, data: { error: 'Forbidden: You are not a member of this team.' } };
      }
    } else {
      org = await ensureOrganizationForUser(userData, verified.uid, now);
    }

    const seatStats = await getOrgSeatStats(org.id, org);

    const members: any[] = [];
    for (const memberId of seatStats.memberIds) {
      if (!isValidFirestoreId(memberId)) continue;
      const mSnap = await adminDb.collection('users').doc(memberId).get();
      if (!mSnap.exists) continue;
      const mData = mSnap.data()!;
      members.push({
        id: mSnap.id,
        name: mData.name || mData.email || 'Member',
        email: mData.email || '',
        avatar: mData.avatar || '',
        orgRole: org.memberRoles?.[mSnap.id] || (org.ownerId === mSnap.id ? 'owner' : 'member'),
        generationsUsedThisMonth: Number(mData.generationsUsedThisMonth || 0),
        totalGenerations: Number(mData.totalGenerations || mData.generationsUsedThisMonth || 0),
        signupDate: mData.signupDate || '',
        lastLogin: mData.lastLogin || '',
      });
    }

    members.sort((a, b) => {
      if (a.orgRole === 'owner' && b.orgRole !== 'owner') return -1;
      if (a.orgRole !== 'owner' && b.orgRole === 'owner') return 1;
      return (a.name || '').localeCompare(b.name || '');
    });

    return {
      status: 200,
      data: {
        organization: org,
        members,
        invites: seatStats.invites,
      },
    };
  } catch (err: any) {
    return { status: err.status || 500, data: { error: err.message } };
  }
}

// T2. Invite a team member by email (organization owner only)
export async function handleCreateTeamInvite(
  authHeader: string | null | undefined,
  body: any
): Promise<{ status: number; data: any }> {
  try {
    const verified = await verifyFirebaseTokenFromHeader(authHeader);
    const cleanEmail = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
    if (!cleanEmail || cleanEmail.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      return { status: 400, data: { error: 'Valid email address is required' } };
    }

    if (verified.email && verified.email.trim().toLowerCase() === cleanEmail) {
      return { status: 400, data: { error: 'You cannot invite your own email address.' } };
    }

    const now = new Date().toISOString();
    const userSnap = await adminDb.collection('users').doc(verified.uid).get();
    if (!userSnap.exists) {
      return { status: 404, data: { error: 'User account not found.' } };
    }

    const userData = userSnap.data()!;
    const targetOrgId = isValidFirestoreId(body?.organizationId)
      ? body.organizationId
      : isValidFirestoreId(userData.organizationId)
      ? userData.organizationId
      : `org_${verified.uid}`;
    const org = await ensureOrganizationForUser({ ...userData, organizationId: targetOrgId }, verified.uid, now);
    if (org.ownerId !== verified.uid) {
      return { status: 403, data: { error: 'Only the organization owner can invite team members.' } };
    }

    const seatStats = await getOrgSeatStats(org.id, org);

    // Check if email already belongs to an active member of this organization
    for (const mId of seatStats.memberIds) {
      const mSnap = await adminDb.collection('users').doc(mId).get();
      if (mSnap.exists && (mSnap.data()?.email || '').trim().toLowerCase() === cleanEmail) {
        return { status: 400, data: { error: `${cleanEmail} is already a member of this organization.` } };
      }
    }

    // Check for duplicate active pending invite
    const existingPending = seatStats.invites.find(
      (i) => i.status === 'pending' && (i.email || '').trim().toLowerCase() === cleanEmail
    );
    if (existingPending) {
      return { status: 400, data: { error: `A pending invitation already exists for ${cleanEmail}.` } };
    }

    // Enforce seat limit
    if (seatStats.seatsUsed >= seatStats.seatLimit) {
      return {
        status: 403,
        data: {
          error: `Seat limit reached (${seatStats.seatsUsed}/${seatStats.seatLimit} seats in use). Upgrade your plan or contact a super admin to increase seats.`,
        },
      };
    }

    const inviteRef = adminDb.collection('organizations').doc(org.id).collection('invites').doc();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const inviteData = {
      id: inviteRef.id,
      orgId: org.id,
      orgName: org.name,
      email: cleanEmail,
      role: 'member' as const,
      invitedBy: verified.uid,
      invitedByEmail: verified.email || userData.email || '',
      status: 'pending' as const,
      createdAt: now,
      expiresAt,
    };

    const batch = adminDb.batch();
    batch.set(inviteRef, inviteData);
    batch.set(adminDb.collection('teamInvites').doc(inviteRef.id), inviteData);
    await batch.commit();

    await logServerAudit(
      'TEAM_INVITE_CREATED',
      `Invited ${cleanEmail} to join ${org.name} (${org.id})`,
      verified,
      verified.uid
    );

    return { status: 200, data: { invite: inviteData } };
  } catch (err: any) {
    return { status: err.status || 500, data: { error: err.message } };
  }
}

// T2b. Accept a pending team invite (adds team to organizationIds without leaving other teams or moving library items)
export async function handleAcceptTeamInvite(
  authHeader: string | null | undefined,
  inviteId?: string
): Promise<{ status: number; data: any }> {
  try {
    const verified = await verifyFirebaseTokenFromHeader(authHeader);
    if (!isValidFirestoreId(inviteId)) {
      return { status: 400, data: { error: 'Valid Invite ID is required.' } };
    }
    const userEmail = (verified.email || '').trim().toLowerCase();
    if (!verified.emailVerified || !userEmail) {
      return { status: 403, data: { error: 'A verified email address is required to accept a team invitation.' } };
    }

    const teamInvRef = adminDb.collection('teamInvites').doc(inviteId);
    const preInvSnap = await teamInvRef.get();
    if (!preInvSnap.exists) {
      return { status: 404, data: { error: 'Team invitation not found.' } };
    }
    const preInv = preInvSnap.data()!;
    const targetOrgId = preInv.orgId;
    if (!isValidFirestoreId(targetOrgId)) {
      return { status: 400, data: { error: 'Invitation references an invalid team.' } };
    }

    const now = new Date().toISOString();
    const userRef = adminDb.collection('users').doc(verified.uid);
    const targetOrgRef = adminDb.collection('organizations').doc(targetOrgId);
    const orgInvRef = targetOrgRef.collection('invites').doc(inviteId);

    const txResult = await adminDb.runTransaction(async (tx) => {
      const [freshTeamInv, freshOrgInv, freshTargetOrg, freshUser] = await Promise.all([
        tx.get(teamInvRef),
        tx.get(orgInvRef),
        tx.get(targetOrgRef),
        tx.get(userRef),
      ]);

      if (!freshTeamInv.exists) {
        throw new HttpError(404, 'Team invitation not found.');
      }
      const invData = freshTeamInv.data()!;
      if ((invData.email || '').trim().toLowerCase() !== userEmail) {
        throw new HttpError(403, 'This team invitation was sent to a different email address.');
      }
      if (invData.status === 'revoked') {
        throw new HttpError(400, 'This team invitation has been revoked.');
      }
      if (invData.status === 'declined') {
        throw new HttpError(400, 'This team invitation was declined.');
      }
      if (invData.status === 'expired' || (invData.expiresAt && new Date(invData.expiresAt).getTime() <= Date.now())) {
        if (invData.status !== 'expired') {
          tx.update(teamInvRef, { status: 'expired' });
          if (freshOrgInv.exists) tx.update(orgInvRef, { status: 'expired' });
        }
        throw new HttpError(400, 'This team invitation has expired.');
      }
      if (invData.status !== 'pending') {
        throw new HttpError(400, 'This team invitation is no longer pending.');
      }
      if (!freshTargetOrg.exists) {
        throw new HttpError(404, 'Target team no longer exists.');
      }
      if (!freshUser.exists) {
        throw new HttpError(404, 'Account not found. Please refresh and sign in again.');
      }

      const uData = freshUser.data()!;
      const tOrg = freshTargetOrg.data()!;
      const existingOrgIds = computeUserOrganizationIds(verified.uid, uData.organizationIds, uData.organizationId);
      if (!existingOrgIds.includes(targetOrgId) && existingOrgIds.length >= MAX_TEAMS_PER_USER) {
        throw new HttpError(
          400,
          `Team limit reached. You can belong to at most ${MAX_TEAMS_PER_USER} teams (including your personal workspace).`
        );
      }

      const existingMembers: string[] = Array.from(
        new Set([...(Array.isArray(tOrg.memberIds) ? tOrg.memberIds : []), ...(tOrg.ownerId ? [tOrg.ownerId] : [])])
      );
      const seatLimit = Number(tOrg.seatLimit || getDefaultSeatLimit(tOrg.planId));
      if (!existingMembers.includes(verified.uid) && existingMembers.length >= seatLimit) {
        throw new HttpError(
          403,
          `Seat limit reached (${existingMembers.length}/${seatLimit} seats in use). Ask the team owner to free a seat or upgrade.`
        );
      }

      const updatedMembers = Array.from(new Set([...existingMembers, verified.uid]));
      const nextRole: 'owner' | 'member' = tOrg.ownerId === verified.uid ? 'owner' : 'member';
      const updatedMemberRoles: Record<string, 'owner' | 'member'> = {};
      for (const mId of updatedMembers) {
        updatedMemberRoles[mId] = mId === tOrg.ownerId ? 'owner' : 'member';
      }
      const nextOrgIds = computeUserOrganizationIds(verified.uid, [...existingOrgIds, targetOrgId]);

      tx.set(
        targetOrgRef,
        {
          memberIds: updatedMembers,
          memberRoles: updatedMemberRoles,
          updatedAt: now,
        },
        { merge: true }
      );
      tx.set(
        userRef,
        {
          organizationIds: nextOrgIds,
          ...(uData.organizationId === targetOrgId ? { orgRole: nextRole } : {}),
          updatedAt: now,
        },
        { merge: true }
      );
      tx.set(teamInvRef, { status: 'accepted', acceptedAt: now, acceptedBy: verified.uid }, { merge: true });
      if (freshOrgInv.exists) {
        tx.set(orgInvRef, { status: 'accepted', acceptedAt: now, acceptedBy: verified.uid }, { merge: true });
      }

      return {
        orgName: tOrg.name || targetOrgId,
        organization: normalizeOrganizationRecord(targetOrgId, {
          ...tOrg,
          memberIds: updatedMembers,
          memberRoles: updatedMemberRoles,
        }),
      };
    });

    await logServerAudit(
      'TEAM_INVITE_ACCEPTED',
      `Accepted invitation ${inviteId} to join team ${txResult.orgName} (${targetOrgId})`,
      verified,
      verified.uid
    );
    await logServerAudit(
      'TEAM_MEMBER_ADDED',
      `Added ${userEmail} as member to organization ${txResult.orgName} (${targetOrgId}) via team invite ${inviteId}`,
      verified,
      verified.uid
    );

    const updatedUserSnap = await userRef.get();
    const teamsInfo = await getTeamSummariesAndInvitesForUser(
      verified.uid,
      verified.email,
      verified.emailVerified,
      updatedUserSnap.data()
    );

    return {
      status: 200,
      data: {
        success: true,
        user: updatedUserSnap.data(),
        organization: txResult.organization,
        teams: teamsInfo.teams,
        pendingTeamInvites: teamsInfo.pendingInvites,
      },
    };
  } catch (err: any) {
    return { status: err.status || 500, data: { error: err.message } };
  }
}

// T2c. Decline a pending team invite
export async function handleDeclineTeamInvite(
  authHeader: string | null | undefined,
  inviteId?: string
): Promise<{ status: number; data: any }> {
  try {
    const verified = await verifyFirebaseTokenFromHeader(authHeader);
    if (!isValidFirestoreId(inviteId)) {
      return { status: 400, data: { error: 'Valid Invite ID is required.' } };
    }
    const userEmail = (verified.email || '').trim().toLowerCase();
    if (!verified.emailVerified || !userEmail) {
      return { status: 403, data: { error: 'A verified email address is required to decline an invitation.' } };
    }

    const teamInvRef = adminDb.collection('teamInvites').doc(inviteId);
    const snap = await teamInvRef.get();
    if (!snap.exists) {
      return { status: 404, data: { error: 'Team invitation not found.' } };
    }
    const invData = snap.data()!;
    if ((invData.email || '').trim().toLowerCase() !== userEmail) {
      return { status: 403, data: { error: 'This team invitation was sent to a different email address.' } };
    }
    if (invData.status !== 'pending') {
      return { status: 400, data: { error: 'This invitation is no longer pending.' } };
    }

    const now = new Date().toISOString();
    const batch = adminDb.batch();
    batch.set(teamInvRef, { status: 'declined', declinedAt: now, declinedBy: verified.uid }, { merge: true });
    if (isValidFirestoreId(invData.orgId)) {
      batch.set(
        adminDb.collection('organizations').doc(invData.orgId).collection('invites').doc(inviteId),
        { status: 'declined', declinedAt: now, declinedBy: verified.uid },
        { merge: true }
      );
    }
    await batch.commit();

    await logServerAudit(
      'TEAM_INVITE_DECLINED',
      `Declined team invitation ${inviteId} for ${invData.orgName || invData.orgId} (${invData.orgId})`,
      verified,
      verified.uid
    );

    const userSnap = await adminDb.collection('users').doc(verified.uid).get();
    const teamsInfo = await getTeamSummariesAndInvitesForUser(
      verified.uid,
      verified.email,
      verified.emailVerified,
      userSnap.exists ? userSnap.data() : {}
    );

    return {
      status: 200,
      data: {
        success: true,
        teams: teamsInfo.teams,
        pendingTeamInvites: teamsInfo.pendingInvites,
      },
    };
  } catch (err: any) {
    return { status: err.status || 500, data: { error: err.message } };
  }
}

// T3. Revoke a pending team invite (organization owner only)
export async function handleRevokeTeamInvite(
  authHeader: string | null | undefined,
  inviteId?: string,
  requestedOrgId?: string | null
): Promise<{ status: number; data: any }> {
  try {
    const verified = await verifyFirebaseTokenFromHeader(authHeader);
    if (!isValidFirestoreId(inviteId)) {
      return { status: 400, data: { error: 'Valid Invite ID is required' } };
    }

    const userSnap = await adminDb.collection('users').doc(verified.uid).get();
    if (!userSnap.exists) {
      return { status: 404, data: { error: 'Account not found.' } };
    }

    let orgId = isValidFirestoreId(requestedOrgId)
      ? requestedOrgId
      : isValidFirestoreId(userSnap.data()?.organizationId)
      ? userSnap.data()!.organizationId
      : `org_${verified.uid}`;

    const teamInvSnap = await adminDb.collection('teamInvites').doc(inviteId).get();
    if (teamInvSnap.exists && isValidFirestoreId(teamInvSnap.data()?.orgId) && !requestedOrgId) {
      orgId = teamInvSnap.data()!.orgId;
    }

    const orgRef = adminDb.collection('organizations').doc(orgId);
    const orgSnap = await orgRef.get();
    if (!orgSnap.exists) {
      return { status: 404, data: { error: 'Organization not found.' } };
    }
    if (orgSnap.data()?.ownerId !== verified.uid) {
      return { status: 403, data: { error: 'Only the organization owner can revoke team invitations.' } };
    }

    const inviteRef = orgRef.collection('invites').doc(inviteId);
    const inviteSnap = await inviteRef.get();
    if (!inviteSnap.exists) {
      return { status: 404, data: { error: 'Team invitation not found.' } };
    }

    const invData = inviteSnap.data()!;
    const now = new Date().toISOString();
    const batch = adminDb.batch();
    batch.update(inviteRef, { status: 'revoked', revokedAt: now, revokedBy: verified.uid });
    batch.set(
      adminDb.collection('teamInvites').doc(inviteId),
      { status: 'revoked', revokedAt: now, revokedBy: verified.uid },
      { merge: true }
    );
    await batch.commit();

    await logServerAudit(
      'TEAM_INVITE_REVOKED',
      `Revoked team invitation for ${invData.email} in organization ${orgId}`,
      verified,
      verified.uid
    );

    return { status: 200, data: { success: true } };
  } catch (err: any) {
    return { status: err.status || 500, data: { error: err.message } };
  }
}

// T4. Remove a member from the organization (organization owner only)
export async function handleRemoveTeamMember(
  authHeader: string | null | undefined,
  memberId?: string,
  requestedOrgId?: string | null
): Promise<{ status: number; data: any }> {
  try {
    const verified = await verifyFirebaseTokenFromHeader(authHeader);
    if (!isValidFirestoreId(memberId)) {
      return { status: 400, data: { error: 'Valid Member ID is required' } };
    }
    if (memberId === verified.uid) {
      return { status: 400, data: { error: 'Owners cannot remove themselves. Transfer ownership first.' } };
    }

    const now = new Date().toISOString();
    const ownerSnap = await adminDb.collection('users').doc(verified.uid).get();
    if (!ownerSnap.exists) {
      return { status: 404, data: { error: 'Account not found.' } };
    }
    const orgId = isValidFirestoreId(requestedOrgId)
      ? requestedOrgId
      : isValidFirestoreId(ownerSnap.data()?.organizationId)
      ? ownerSnap.data()!.organizationId
      : `org_${verified.uid}`;

    const orgRef = adminDb.collection('organizations').doc(orgId);
    const orgSnap = await orgRef.get();
    if (!orgSnap.exists) {
      return { status: 404, data: { error: 'Organization not found.' } };
    }
    const orgData = orgSnap.data()!;
    if (orgData.ownerId !== verified.uid) {
      return { status: 403, data: { error: 'Only the organization owner can remove members.' } };
    }

    const memberIds: string[] = Array.isArray(orgData.memberIds) ? orgData.memberIds : [];
    if (!memberIds.includes(memberId)) {
      return { status: 404, data: { error: 'User is not a member of this organization.' } };
    }

    const memberRef = adminDb.collection('users').doc(memberId);
    const memberSnap = await memberRef.get();
    const memberData = memberSnap.exists ? memberSnap.data()! : { id: memberId };

    await orgRef.update({
      memberIds: FieldValue.arrayRemove(memberId),
      [`memberRoles.${memberId}`]: FieldValue.delete(),
      updatedAt: now,
    });

    if (memberSnap.exists) {
      const personalId = `org_${memberId}`;
      const nextOrgIds = computeUserOrganizationIds(memberId, memberData.organizationIds).filter((id) => id !== orgId);
      const patch: Record<string, any> = {
        organizationIds: nextOrgIds,
        updatedAt: now,
      };
      if (memberData.organizationId === orgId) {
        const personalOrg = await ensurePersonalWorkspace(memberId, { ...memberData, organizationId: personalId }, now);
        const personalProfile = buildOrgProfileFromOrgDoc(personalOrg);
        patch.organizationId = personalId;
        patch.orgRole = 'owner';
        patch.planId = personalOrg.planId || 'free';
        patch.organizationProfile = personalProfile || FieldValue.delete();
      }
      await memberRef.set(patch, { merge: true });
    }

    await logServerAudit(
      'TEAM_MEMBER_REMOVED',
      `Removed ${memberData.email || memberId} from organization ${orgData.name || orgId} (${orgId})`,
      verified,
      memberId
    );

    return { status: 200, data: { success: true } };
  } catch (err: any) {
    return { status: err.status || 500, data: { error: err.message } };
  }
}

// T5. Transfer organization ownership to another active member (owner only)
export async function handleTransferOwnership(
  authHeader: string | null | undefined,
  body: any
): Promise<{ status: number; data: any }> {
  try {
    const verified = await verifyFirebaseTokenFromHeader(authHeader);
    const newOwnerId = body?.newOwnerId;
    if (!isValidFirestoreId(newOwnerId)) {
      return { status: 400, data: { error: 'Valid target member ID is required' } };
    }
    if (newOwnerId === verified.uid) {
      return { status: 400, data: { error: 'You are already the owner of this organization.' } };
    }

    const now = new Date().toISOString();
    const currentUserRef = adminDb.collection('users').doc(verified.uid);
    const currentUserSnap = await currentUserRef.get();
    if (!currentUserSnap.exists) {
      return { status: 404, data: { error: 'Account not found.' } };
    }
    const orgId = isValidFirestoreId(body?.organizationId)
      ? body.organizationId
      : isValidFirestoreId(currentUserSnap.data()?.organizationId)
      ? currentUserSnap.data()!.organizationId
      : `org_${verified.uid}`;

    const orgRef = adminDb.collection('organizations').doc(orgId);
    const newOwnerRef = adminDb.collection('users').doc(newOwnerId);

    const newOwnerEmail = await adminDb.runTransaction(async (tx) => {
      const [orgSnap, newOwnerSnap, curUserTxSnap] = await Promise.all([
        tx.get(orgRef),
        tx.get(newOwnerRef),
        tx.get(currentUserRef),
      ]);
      if (!orgSnap.exists) throw new HttpError(404, 'Organization not found.');
      const orgData = orgSnap.data()!;
      if (orgData.ownerId !== verified.uid) {
        throw new HttpError(403, 'Only the organization owner can transfer ownership.');
      }
      const memberIds: string[] = Array.from(
        new Set([...(Array.isArray(orgData.memberIds) ? orgData.memberIds : []), verified.uid])
      );
      if (!memberIds.includes(newOwnerId) || !newOwnerSnap.exists) {
        throw new HttpError(400, 'Selected user must be an active member of the organization.');
      }

      const nextMemberRoles: Record<string, 'owner' | 'member'> = {};
      for (const mId of memberIds) {
        nextMemberRoles[mId] = mId === newOwnerId ? 'owner' : 'member';
      }

      tx.update(orgRef, { ownerId: newOwnerId, memberRoles: nextMemberRoles, updatedAt: now });
      if (curUserTxSnap.exists && curUserTxSnap.data()?.organizationId === orgId) {
        tx.update(currentUserRef, { orgRole: 'member', updatedAt: now });
      }
      if (newOwnerSnap.data()?.organizationId === orgId) {
        tx.update(newOwnerRef, { orgRole: 'owner', updatedAt: now });
      }
      return newOwnerSnap.data()?.email || newOwnerId;
    });

    await logServerAudit(
      'OWNERSHIP_TRANSFERRED',
      `Transferred ownership of organization ${orgId} from ${verified.email || verified.uid} to ${newOwnerEmail}`,
      verified,
      newOwnerId
    );

    return { status: 200, data: { success: true } };
  } catch (err: any) {
    return { status: err.status || 500, data: { error: err.message } };
  }
}

// T6. Leave team organization (non-owner members only; switches to personal workspace if leaving active org)
export async function handleLeaveTeam(
  authHeader?: string | null,
  body?: { organizationId?: string }
): Promise<{ status: number; data: any }> {
  try {
    const verified = await verifyFirebaseTokenFromHeader(authHeader);
    const now = new Date().toISOString();
    const userRef = adminDb.collection('users').doc(verified.uid);
    const userSnap = await userRef.get();
    if (!userSnap.exists) {
      return { status: 404, data: { error: 'Account not found.' } };
    }
    const userData = userSnap.data()!;
    const personalId = `org_${verified.uid}`;
    const orgId = isValidFirestoreId(body?.organizationId)
      ? body!.organizationId!
      : isValidFirestoreId(userData.organizationId)
      ? userData.organizationId
      : personalId;

    if (orgId === personalId) {
      return { status: 400, data: { error: 'Your personal workspace cannot be left.' } };
    }

    const orgRef = adminDb.collection('organizations').doc(orgId);
    const orgSnap = await orgRef.get();
    if (!orgSnap.exists) {
      return { status: 404, data: { error: 'Organization not found.' } };
    }
    const orgData = orgSnap.data()!;
    if (orgData.ownerId === verified.uid) {
      return {
        status: 400,
        data: { error: 'Team owners cannot leave directly. Transfer ownership or delete the team instead.' },
      };
    }

    const memberIds: string[] = Array.isArray(orgData.memberIds) ? orgData.memberIds : [];
    if (!memberIds.includes(verified.uid)) {
      return { status: 403, data: { error: 'You are not a member of this team.' } };
    }

    await orgRef.update({
      memberIds: FieldValue.arrayRemove(verified.uid),
      [`memberRoles.${verified.uid}`]: FieldValue.delete(),
      updatedAt: now,
    });

    const nextOrgIds = computeUserOrganizationIds(verified.uid, userData.organizationIds).filter((id) => id !== orgId);
    const wasActive = userData.organizationId === orgId;
    const personalOrg = await ensurePersonalWorkspace(verified.uid, { ...userData, organizationId: personalId }, now);

    const userUpdate: Record<string, any> = {
      organizationIds: nextOrgIds,
      updatedAt: now,
    };

    let activeOrg = personalOrg;
    if (wasActive) {
      const personalProfile = buildOrgProfileFromOrgDoc(personalOrg);
      userUpdate.organizationId = personalId;
      userUpdate.orgRole = 'owner';
      userUpdate.planId = personalOrg.planId || 'free';
      userUpdate.organizationProfile = personalProfile || FieldValue.delete();
    } else if (isValidFirestoreId(userData.organizationId)) {
      const activeSnap = await adminDb.collection('organizations').doc(userData.organizationId).get();
      if (activeSnap.exists) {
        activeOrg = normalizeOrganizationRecord(userData.organizationId, activeSnap.data());
      }
    }

    await userRef.set(userUpdate, { merge: true });

    await logServerAudit(
      'TEAM_MEMBER_LEFT',
      `${userData.email || verified.uid} left organization ${orgData.name || orgId} (${orgId})`,
      verified,
      verified.uid
    );

    const [updatedUserSnap, teamsInfo] = await Promise.all([
      userRef.get(),
      getTeamSummariesAndInvitesForUser(verified.uid, verified.email, verified.emailVerified, {
        ...userData,
        ...userUpdate,
      }),
    ]);

    return {
      status: 200,
      data: {
        success: true,
        user: updatedUserSnap.data(),
        organization: activeOrg,
        teams: teamsInfo.teams,
        pendingTeamInvites: teamsInfo.pendingInvites,
      },
    };
  } catch (err: any) {
    return { status: err.status || 500, data: { error: err.message } };
  }
}

// =========================================================================
// SUPER ADMIN ORGANIZATION MANAGEMENT HANDLERS
// =========================================================================

// A1. List all organizations with members & seat usage
export async function handleAdminGetOrganizations(authHeader?: string | null): Promise<{ status: number; data: any }> {
  try {
    await requireSuperAdmin(authHeader);

    const [orgsSnap, usersSnap, pendingInvitesSnap] = await Promise.all([
      adminDb.collection('organizations').get(),
      adminDb.collection('users').get(),
      adminDb.collection('teamInvites').where('status', '==', 'pending').get(),
    ]);

    const userMap = new Map<string, any>();
    usersSnap.forEach((docSnap) => {
      userMap.set(docSnap.id, docSnap.data());
    });

    const pendingCountsByOrg = new Map<string, number>();
    const nowMs = Date.now();
    for (const invDoc of pendingInvitesSnap.docs) {
      const inv = invDoc.data();
      if (inv.expiresAt && new Date(inv.expiresAt).getTime() <= nowMs) {
        continue;
      }
      if (inv.orgId) {
        pendingCountsByOrg.set(inv.orgId, (pendingCountsByOrg.get(inv.orgId) || 0) + 1);
      }
    }

    const organizations: any[] = [];
    orgsSnap.forEach((orgDoc) => {
      const normalized = normalizeOrganizationRecord(orgDoc.id, orgDoc.data());
      const members = normalized.memberIds
        .map((mId: string) => {
          const mData = userMap.get(mId);
          if (!mData) return null;
          return {
            id: mId,
            name: mData.name || mData.email || mId,
            email: mData.email || '',
            avatar: mData.avatar || '',
            orgRole: normalized.memberRoles?.[mId] || (normalized.ownerId === mId ? 'owner' : 'member'),
            generationsUsedThisMonth: Number(mData.generationsUsedThisMonth || 0),
            totalGenerations: Number(mData.totalGenerations || mData.generationsUsedThisMonth || 0),
            signupDate: mData.signupDate || '',
            lastLogin: mData.lastLogin || '',
          };
        })
        .filter(Boolean);

      members.sort((a: any, b: any) => {
        if (a.orgRole === 'owner' && b.orgRole !== 'owner') return -1;
        if (a.orgRole !== 'owner' && b.orgRole === 'owner') return 1;
        return (a.name || '').localeCompare(b.name || '');
      });

      const pendingInvitesCount = pendingCountsByOrg.get(orgDoc.id) || 0;
      organizations.push({
        ...normalized,
        members,
        pendingInvitesCount,
        seatsUsed: members.length + pendingInvitesCount,
      });
    });

    organizations.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
    return { status: 200, data: { organizations } };
  } catch (err: any) {
    return { status: err.status || 500, data: { error: err.message } };
  }
}

// A2. Super admin override organization seat limit
export async function handleAdminUpdateOrgSeatLimit(
  authHeader: string | null | undefined,
  orgId?: string,
  body?: { seatLimit?: number }
): Promise<{ status: number; data: any }> {
  try {
    const verified = await requireSuperAdmin(authHeader);
    if (!isValidFirestoreId(orgId)) {
      return { status: 400, data: { error: 'Valid Organization ID is required' } };
    }

    const seatLimit = Number(body?.seatLimit);
    if (!Number.isInteger(seatLimit) || seatLimit < 1 || seatLimit > 500) {
      return { status: 400, data: { error: 'Seat limit must be an integer between 1 and 500.' } };
    }

    const orgRef = adminDb.collection('organizations').doc(orgId);
    const now = new Date().toISOString();

    const txResult = await adminDb.runTransaction(async (tx) => {
      const orgSnap = await tx.get(orgRef);
      if (!orgSnap.exists) {
        throw new HttpError(404, 'Organization not found.');
      }
      const orgData = orgSnap.data()!;
      const memberIds = Array.from(
        new Set([...(Array.isArray(orgData.memberIds) ? orgData.memberIds : []), ...(orgData.ownerId ? [orgData.ownerId] : [])])
      );
      if (seatLimit < memberIds.length) {
        throw new HttpError(
          400,
          `Seat limit (${seatLimit}) cannot be lower than current active members (${memberIds.length}). Remove members first.`
        );
      }
      const prevLimit = Number(orgData.seatLimit || getDefaultSeatLimit(orgData.planId));
      tx.update(orgRef, { seatLimit, updatedAt: now });
      return {
        prevLimit,
        org: normalizeOrganizationRecord(orgId, { ...orgData, seatLimit, updatedAt: now }),
      };
    });

    await logServerAudit(
      'SEAT_LIMIT_CHANGED',
      `Super admin changed seat limit for ${txResult.org.name} (${orgId}) from ${txResult.prevLimit} to ${seatLimit}`,
      verified,
      txResult.org.ownerId
    );

    return { status: 200, data: { success: true, organization: txResult.org } };
  } catch (err: any) {
    return { status: err.status || 500, data: { error: err.message } };
  }
}

// A3. Super admin remove member from any organization
export async function handleAdminRemoveOrgMember(
  authHeader: string | null | undefined,
  orgId?: string,
  memberId?: string
): Promise<{ status: number; data: any }> {
  try {
    const verified = await requireSuperAdmin(authHeader);
    if (!isValidFirestoreId(orgId) || !isValidFirestoreId(memberId)) {
      return { status: 400, data: { error: 'Valid Organization ID and Member ID are required.' } };
    }

    const now = new Date().toISOString();
    const orgRef = adminDb.collection('organizations').doc(orgId);
    const orgSnap = await orgRef.get();
    if (!orgSnap.exists) {
      return { status: 404, data: { error: 'Organization not found.' } };
    }
    const orgData = orgSnap.data()!;
    if (orgData.ownerId === memberId) {
      return {
        status: 400,
        data: { error: 'Cannot remove the organization owner directly. Transfer ownership first or delete the user.' },
      };
    }

    const memberIds: string[] = Array.isArray(orgData.memberIds) ? orgData.memberIds : [];
    if (!memberIds.includes(memberId)) {
      return { status: 404, data: { error: 'User is not a member of this organization.' } };
    }

    const memberRef = adminDb.collection('users').doc(memberId);
    const memberSnap = await memberRef.get();
    const memberData = memberSnap.exists ? memberSnap.data()! : { id: memberId };

    await orgRef.update({
      memberIds: FieldValue.arrayRemove(memberId),
      [`memberRoles.${memberId}`]: FieldValue.delete(),
      updatedAt: now,
    });

    if (memberSnap.exists) {
      const personalId = `org_${memberId}`;
      const nextOrgIds = computeUserOrganizationIds(memberId, memberData.organizationIds).filter((id) => id !== orgId);
      const patch: Record<string, any> = {
        organizationIds: nextOrgIds,
        updatedAt: now,
      };
      if (memberData.organizationId === orgId) {
        const personalOrg = await ensurePersonalWorkspace(memberId, { ...memberData, organizationId: personalId }, now);
        const personalProfile = buildOrgProfileFromOrgDoc(personalOrg);
        patch.organizationId = personalId;
        patch.orgRole = 'owner';
        patch.planId = personalOrg.planId || 'free';
        patch.organizationProfile = personalProfile || FieldValue.delete();
      }
      await memberRef.set(patch, { merge: true });
    }

    await logServerAudit(
      'TEAM_MEMBER_REMOVED',
      `Super admin removed ${memberData.email || memberId} from organization ${orgData.name || orgId} (${orgId})`,
      verified,
      memberId
    );

    return { status: 200, data: { success: true } };
  } catch (err: any) {
    return { status: err.status || 500, data: { error: err.message } };
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
  let verifiedUser: { uid: string; email?: string; name?: string } | null = null;

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
  const { toolId, toolName, organizationProfile, userInputs } = body || {};

  if (!toolId || typeof toolId !== 'string' || !VALID_TOOL_IDS.has(toolId)) {
    return {
      errorStatus: 400,
      errorData: { error: 'Invalid or unsupported marketing tool identifier.' },
    };
  }

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

  // 3. Check and increment pooled organization usage + per-member usage in a Firestore transaction
  const userRef = adminDb.collection('users').doc(userId);
  let orgGenerationsUsedThisMonth = 0;
  let memberGenerationsUsedThisMonth = 0;
  let resolvedOrgId = `org_${userId}`;
  let resolvedUserName = verifiedUser.name || verifiedUser.email?.split('@')[0] || 'Member';

  try {
    await adminDb.runTransaction(async (transaction) => {
      const userSnap = await transaction.get(userRef);
      if (!userSnap.exists) {
        throw new HttpError(403, 'Account not found. Please sign in through the application.');
      }
      const userData: any = userSnap.data()!;

      if (userData.status === 'suspended') {
        const suspendedErr = new Error('Your account is currently suspended. Please contact support.');
        (suspendedErr as any).status = 403;
        throw suspendedErr;
      }

      const orgId = isValidFirestoreId(userData.organizationId) ? userData.organizationId : `org_${userId}`;
      const orgRef = adminDb.collection('organizations').doc(orgId);
      const plansRef = adminDb.collection('settings').doc('plans');
      const [orgSnap, plansSnap] = await Promise.all([transaction.get(orgRef), transaction.get(plansRef)]);

      if (!orgSnap.exists && orgId !== `org_${userId}`) {
        throw new HttpError(503, 'Organization record not found. Please refresh and try again.');
      }

      const orgData: any = orgSnap.exists ? orgSnap.data()! : null;
      const planId = orgData?.planId || userData.planId || 'free';
      const storedPlanLimit = plansSnap.exists ? Number(plansSnap.data()?.plans?.[planId]?.generationLimit) : NaN;
      const baseLimit =
        Number.isInteger(storedPlanLimit) && storedPlanLimit >= 1
          ? storedPlanLimit
          : getDefaultGenerationLimit(planId);
      const bonus = Number(orgData?.bonusGenerations ?? userData.bonusGenerations ?? 0);
      const planLimit = baseLimit + bonus;

      const todayStr = new Date().toISOString().split('T')[0];
      const nextResetDefault = getNextMonthFirstDay();

      let orgUsed = orgData ? Number(orgData.generationsUsedThisMonth || 0) : Number(userData.generationsUsedThisMonth || 0);
      let orgResetDate = orgData?.billingResetDate || userData.billingResetDate || nextResetDefault;
      const orgCycleReset = Boolean(orgResetDate && todayStr >= orgResetDate);
      if (orgCycleReset) {
        orgUsed = 0;
        orgResetDate = nextResetDefault;
      }

      if (orgUsed >= planLimit) {
        const quotaErr = new Error(
          `Monthly organization generation quota reached (${orgUsed}/${planLimit} used). Upgrade to continue generating.`
        );
        (quotaErr as any).status = 403;
        throw quotaErr;
      }

      let memberUsed = Number(userData.generationsUsedThisMonth || 0);
      const memberResetDate = userData.billingResetDate || orgResetDate;
      if (orgCycleReset || (memberResetDate && todayStr >= memberResetDate)) {
        memberUsed = 0;
      }

      const newOrgUsage = orgUsed + 1;
      const newMemberUsage = memberUsed + 1;
      const previousTotal =
        typeof userData.totalGenerations === 'number'
          ? userData.totalGenerations
          : memberUsed;
      const newTotal = previousTotal + 1;
      const nowIso = new Date().toISOString();

      if (orgSnap.exists) {
        transaction.update(orgRef, {
          generationsUsedThisMonth: newOrgUsage,
          billingResetDate: orgResetDate,
          updatedAt: nowIso,
        });
      } else {
        transaction.set(orgRef, {
          id: orgId,
          name: userData.organizationProfile?.orgName || `${userData.name || 'Personal'}'s Workspace`,
          ownerId: userId,
          memberIds: [userId],
          planId,
          seatLimit: getDefaultSeatLimit(planId),
          generationsUsedThisMonth: newOrgUsage,
          bonusGenerations: bonus,
          billingResetDate: orgResetDate,
          createdAt: userData.signupDate || nowIso,
          updatedAt: nowIso,
        });
      }

      transaction.set(
        userRef,
        {
          organizationId: orgId,
          orgRole: userData.orgRole || (orgData?.ownerId && orgData.ownerId !== userId ? 'member' : 'owner'),
          generationsUsedThisMonth: newMemberUsage,
          totalGenerations: newTotal,
          billingResetDate: orgResetDate,
          updatedAt: nowIso,
        },
        { merge: true }
      );

      resolvedOrgId = orgId;
      resolvedUserName = truncateString(
        userData.name || verifiedUser?.name || userData.email?.split('@')[0] || verifiedUser?.email?.split('@')[0] || 'Member',
        150
      );
      orgGenerationsUsedThisMonth = newOrgUsage;
      memberGenerationsUsedThisMonth = newMemberUsage;
    });
  } catch (txErr: any) {
    if (txErr.status === 403 || txErr.message?.includes('generation quota reached')) {
      console.warn(`[Access/Quota Blocked] User ${userId}: ${txErr.message}`);
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

  const safeToolName = truncateString(toolName || toolId, 120);
  console.log(`[Gemini Request] Started generation for "${safeToolName}" (${toolId}) by user ${userId} at ${new Date().toISOString()}`);

  const orgName = truncateString(organizationProfile?.orgName || 'Our Organization', 200);
  const orgType = truncateString(organizationProfile?.type || 'Startup', 50);
  const whatTheyDo = truncateString(organizationProfile?.whatTheyDo || '', 2000);
  const audience = truncateString(organizationProfile?.targetAudience || '', 1000);
  const goals = Array.isArray(organizationProfile?.goals)
    ? organizationProfile.goals.slice(0, 20).map((g: unknown) => truncateString(g, 300))
    : truncateString(organizationProfile?.goals || '', 1000);
  const brandTone = Array.isArray(organizationProfile?.brandTone)
    ? organizationProfile.brandTone.slice(0, 10).map((t: unknown) => truncateString(t, 60)).join(', ') || 'Professional, Inspiring'
    : 'Professional, Inspiring';
  const budget = truncateString(organizationProfile?.budget || 'Under $500/month', 200);
  const sanitizedUserInputs =
    userInputs && typeof userInputs === 'object'
      ? Object.entries(userInputs)
          .slice(0, 20)
          .reduce<Record<string, string>>((acc, [k, v]) => {
            acc[truncateString(k, 100)] = truncateString(v, 4000);
            return acc;
          }, {})
      : {};

  const systemInstruction = `You are the Senior Marketing Strategist and Creative Director at Millennium Agency (mill.agency), an elite branding and growth agency.
You are generating real, production-ready, custom marketing assets for "${orgName}", a ${orgType}.

AGENCY QUALITY STANDARDS:
1. CUSTOM & SPECIFIC: Write REAL, compelling, finished copy tailored to this specific organization. Do NOT use generic placeholder templates (such as "[Pillar 1 Title]" or "[Insert problem here]")—write the actual thoughtful copy based on what this organization does!
2. GROUNDED & AUTHENTIC: Never invent fake awards, fake statistical studies, or fake client testimonials. Where a specific internal date, metric, or donor name will be required, use clear brackets such as [Insert Launch Date] or [$X Target].
3. BRAND VOICE: Match the requested brand tone: ${brandTone}. Be clear, punchy, persuasive, and encouraging.
4. STRUCTURE: Use clean Markdown with headers (##, ###), bullet points, and blockquotes so the deliverable is immediately usable. Start directly with the deliverable's title as a # heading. No introduction or closing remarks to the user (for example, never start with 'Here are...'). Use --- only between major sections.`;

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
DELIVERABLE REQUEST: "${safeToolName}" for ${orgName} (${orgType}).

ORGANIZATION DETAILS:
- Organization Name: ${orgName}
- Organization Type: ${orgType}
- Core Mission / What we do: ${whatTheyDo}
- Target Audience / Ideal Customer: ${audience}
- Top 6-Month Goals: ${Array.isArray(goals) ? goals.join('; ') : goals}
- Desired Brand Voice: ${brandTone}
- Monthly Marketing Budget: ${budget}

TOOL-SPECIFIC PARAMETERS PROVIDED BY USER:
${Object.entries(sanitizedUserInputs)
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

            const streamPromise = executeStream();
            streamPromise.catch(() => {});
            fullText = await Promise.race([streamPromise, timeoutPromise]);
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

        if (callSucceeded && fullText && fullText.trim().length > 0) {
          const historyCreatedAt = new Date().toISOString();
          const historyId = `hist_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
          try {
            const historyCol = adminDb.collection('organizations').doc(resolvedOrgId).collection('history');
            await historyCol.doc(historyId).set({
              id: historyId,
              orgId: resolvedOrgId,
              userId,
              userName: resolvedUserName,
              toolId,
              toolName: safeToolName,
              inputs: sanitizedUserInputs,
              output: fullText,
              model: MODEL_NAME,
              durationMs: totalRequestTime,
              createdAt: historyCreatedAt,
            });

            // Enforce 12-month history retention: delete older records when new ones are written
            const cutoffDate = new Date();
            cutoffDate.setFullYear(cutoffDate.getFullYear() - 1);
            const cutoffIso = cutoffDate.toISOString();
            const expiredSnap = await historyCol.where('createdAt', '<', cutoffIso).limit(200).get();
            if (!expiredSnap.empty) {
              const deleteBatch = adminDb.batch();
              expiredSnap.docs.forEach((d) => deleteBatch.delete(d.ref));
              await deleteBatch.commit();
            }
          } catch (historyErr: any) {
            console.warn(`[Generation History Warning] Failed to save or prune history for org ${resolvedOrgId}:`, historyErr?.message);
          }

          sendEvent({
            done: true,
            modelUsed: MODEL_NAME,
            text: fullText,
            historyId,
            orgGenerationsUsedThisMonth,
            memberGenerationsUsedThisMonth,
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

  app.use(express.json({ limit: '1mb' }));

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

  // Public platform settings endpoint
  app.get('/api/settings', async (_req, res) => {
    const result = await handleGetPublicSettings();
    res.status(result.status).json(result.data);
  });

  // Super Admin update platform settings
  app.post('/api/admin/settings', async (req, res) => {
    const result = await handleUpdatePlatformSettings(req.headers.authorization, req.body);
    res.status(result.status).json(result.data);
  });

  // Public plan limits & pricing endpoint
  app.get('/api/plans', async (_req, res) => {
    const result = await handleGetPublicPlans();
    res.status(result.status).json(result.data);
  });

  // Super Admin update dynamic plan limits & pricing
  app.post('/api/admin/plans', async (req, res) => {
    const result = await handleUpdatePlanSettings(req.headers.authorization, req.body);
    res.status(result.status).json(result.data);
  });

  // Authentication Synchronization Endpoint
  app.post('/api/auth/sync', async (req, res) => {
    const result = await handleAuthSync(req.headers.authorization);
    res.status(result.status).json(result.data);
  });

  // Self-service Account Deletion
  app.post('/api/account/delete', async (req, res) => {
    const result = await handleDeleteOwnAccount(req.headers.authorization);
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
    const result = await handleGetInvite(req.params.id, req.headers.authorization);
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

  // Super Admin User Management Action
  app.post('/api/admin/users/:userId/action', async (req, res) => {
    const result = await handleAdminUserAction(req.headers.authorization, req.params.userId, req.body);
    res.status(result.status).json(result.data);
  });

  // Multi-Team Management Endpoints (Admin SDK)
  app.get('/api/teams', async (req, res) => {
    const result = await handleGetUserTeams(req.headers.authorization);
    res.status(result.status).json(result.data);
  });

  app.post('/api/team/switch', async (req, res) => {
    const result = await handleSwitchTeam(req.headers.authorization, req.body);
    res.status(result.status).json(result.data);
  });

  app.post('/api/team/create', async (req, res) => {
    const result = await handleCreateTeam(req.headers.authorization, req.body);
    res.status(result.status).json(result.data);
  });

  app.post('/api/team/rename', async (req, res) => {
    const result = await handleRenameTeam(req.headers.authorization, req.body);
    res.status(result.status).json(result.data);
  });

  app.post('/api/team/delete', async (req, res) => {
    const result = await handleDeleteTeam(req.headers.authorization, req.body);
    res.status(result.status).json(result.data);
  });

  app.get('/api/team', async (req, res) => {
    const orgIdParam = typeof req.query.organizationId === 'string' ? req.query.organizationId : undefined;
    const result = await handleGetTeam(req.headers.authorization, orgIdParam);
    res.status(result.status).json(result.data);
  });

  app.post('/api/team/invites', async (req, res) => {
    const result = await handleCreateTeamInvite(req.headers.authorization, req.body);
    res.status(result.status).json(result.data);
  });

  app.post('/api/team/invites/:inviteId/accept', async (req, res) => {
    const result = await handleAcceptTeamInvite(req.headers.authorization, req.params.inviteId);
    res.status(result.status).json(result.data);
  });

  app.post('/api/team/invites/:inviteId/decline', async (req, res) => {
    const result = await handleDeclineTeamInvite(req.headers.authorization, req.params.inviteId);
    res.status(result.status).json(result.data);
  });

  app.post('/api/team/invites/:inviteId/revoke', async (req, res) => {
    const orgIdParam = typeof req.body?.organizationId === 'string' ? req.body.organizationId : undefined;
    const result = await handleRevokeTeamInvite(req.headers.authorization, req.params.inviteId, orgIdParam);
    res.status(result.status).json(result.data);
  });

  app.post('/api/team/members/:memberId/remove', async (req, res) => {
    const orgIdParam = typeof req.body?.organizationId === 'string' ? req.body.organizationId : undefined;
    const result = await handleRemoveTeamMember(req.headers.authorization, req.params.memberId, orgIdParam);
    res.status(result.status).json(result.data);
  });

  app.post('/api/team/transfer-ownership', async (req, res) => {
    const result = await handleTransferOwnership(req.headers.authorization, req.body);
    res.status(result.status).json(result.data);
  });

  app.post('/api/team/leave', async (req, res) => {
    const result = await handleLeaveTeam(req.headers.authorization, req.body);
    res.status(result.status).json(result.data);
  });

  // Super Admin Organization Management Endpoints
  app.get('/api/admin/organizations', async (req, res) => {
    const result = await handleAdminGetOrganizations(req.headers.authorization);
    res.status(result.status).json(result.data);
  });

  app.post('/api/admin/organizations/:orgId/seat-limit', async (req, res) => {
    const result = await handleAdminUpdateOrgSeatLimit(req.headers.authorization, req.params.orgId, req.body);
    res.status(result.status).json(result.data);
  });

  app.post('/api/admin/organizations/:orgId/members/:memberId/remove', async (req, res) => {
    const result = await handleAdminRemoveOrgMember(
      req.headers.authorization,
      req.params.orgId,
      req.params.memberId
    );
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

  // Ensure unmatched /api/* requests never fall through to Vite/SPA HTML fallback
  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'API endpoint not found' });
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

  startServer().catch((err) => {
    console.error('[Server Startup Error]:', err);
    process.exit(1);
  });
}
