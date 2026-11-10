/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Millennium Agency Launchpad Configuration
 * Configured for multi-user production environment with Firebase Authentication & Firestore.
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
}

export const APP_CONFIG: AppConfig = {
  AUTH_MODE: 'google',      // Live Firebase Google Authentication
  BILLING_MODE: 'mock',     // Free plan default (paid plans coming soon)
  DATA_MODE: 'firestore',   // Live Cloud Firestore database

  AGENCY_NAME: 'Millennium Agency',
  AGENCY_CALENDLY_URL: 'https://calendly.com/lindafanaras/linkedin-intro',
};

/**
 * Returns false - demo mode is removed in multi-user production.
 */
export function isDemoModeActive(): boolean {
  return false;
}
