/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Millennium Agency Launchpad Configuration
 *
 * Switch modes here when transitioning from Proof of Concept to Production.
 * Service layers (authService, billingService, dataService) encapsulate all
 * implementation specifics so components never interact with vendors directly.
 */

export type AuthMode = 'mock' | 'google';
export type BillingMode = 'mock' | 'stripe';
export type DataMode = 'local' | 'firestore';

export interface AppConfig {
  AUTH_MODE: AuthMode;
  BILLING_MODE: BillingMode;
  DATA_MODE: DataMode;
  AGENCY_NAME: string;
  AGENCY_CALENDLY_URL: string;
  STRIPE_PUBLIC_KEY?: string;
  FIREBASE_CONFIG?: {
    apiKey: string;
    authDomain: string;
    projectId: string;
    storageBucket: string;
    messagingSenderId: string;
    appId: string;
  };
}

export const APP_CONFIG: AppConfig = {
  // Default all to mock / local for Proof-of-Concept demo
  AUTH_MODE: 'mock',      // 'mock' | 'google'
  BILLING_MODE: 'mock',   // 'mock' | 'stripe'
  DATA_MODE: 'local',     // 'local' | 'firestore'

  AGENCY_NAME: 'Millennium Agency',
  AGENCY_CALENDLY_URL: 'https://calendly.com/lindafanaras/linkedin-intro',

  /* =========================================================================
   * TODO [PRODUCTION STRIPE INTEGRATION]:
   * Replace with real Stripe Publishable key when BILLING_MODE is switched to 'stripe'
   * Example: pk_live_51... or pk_test_51...
   * ========================================================================= */
  STRIPE_PUBLIC_KEY: process.env.VITE_STRIPE_PUBLIC_KEY || '',

  /* =========================================================================
   * TODO [PRODUCTION FIREBASE INTEGRATION]:
   * Connect Firebase project credentials when AUTH_MODE is 'google' or DATA_MODE is 'firestore'
   * ========================================================================= */
  FIREBASE_CONFIG: {
    apiKey: process.env.VITE_FIREBASE_API_KEY || '',
    authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN || '',
    projectId: process.env.VITE_FIREBASE_PROJECT_ID || '',
    storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET || '',
    messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
    appId: process.env.VITE_FIREBASE_APP_ID || '',
  },
};

/**
 * Returns whether any service is currently running in mock/local mode.
 */
export function isDemoModeActive(): boolean {
  return (
    APP_CONFIG.AUTH_MODE === 'mock' ||
    APP_CONFIG.BILLING_MODE === 'mock' ||
    APP_CONFIG.DATA_MODE === 'local'
  );
}
