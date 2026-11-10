import { APP_CONFIG } from '../config';
import { User, OrganizationType } from '../types';
import { dataService, SEED_USERS } from './dataService';

type AuthListener = (user: User | null) => void;

class AuthService {
  private listeners: Set<AuthListener> = new Set();
  private currentUser: User | null = null;
  private impersonatingFromUser: User | null = null;

  constructor() {
    this.restoreSession();
  }

  private restoreSession(): void {
    if (typeof window === 'undefined') return;

    const impersonatorId = localStorage.getItem('mla_impersonated_by_v1');
    const storedUserId = localStorage.getItem('mla_current_user_id_v1');

    if (storedUserId) {
      const user = dataService.getUserById(storedUserId);
      if (user) {
        this.currentUser = user;
      }
    }

    if (impersonatorId) {
      const impersonator = dataService.getUserById(impersonatorId);
      if (impersonator) {
        this.impersonatingFromUser = impersonator;
      }
    }

    // Default to Linda Fanaras (Super Admin) for immediate rich demo preview if not logged in
    if (!this.currentUser) {
      const defaultUser = dataService.getUserById('user_admin_linda') || SEED_USERS[0];
      if (defaultUser) {
        this.currentUser = defaultUser;
        localStorage.setItem('mla_current_user_id_v1', defaultUser.id);
      }
    }
  }

  public getCurrentUser(): User | null {
    // If we have a user in memory, refresh with latest data from dataService (in case usage or plan changed)
    if (this.currentUser) {
      const fresh = dataService.getUserById(this.currentUser.id);
      if (fresh) {
        this.currentUser = fresh;
      }
    }
    return this.currentUser;
  }

  public getImpersonatingAdmin(): User | null {
    return this.impersonatingFromUser;
  }

  public onAuthChange(callback: AuthListener): () => void {
    this.listeners.add(callback);
    callback(this.getCurrentUser());

    /* =========================================================================
     * TODO [FIREBASE AUTH INTEGRATION]:
     * When APP_CONFIG.AUTH_MODE === 'google', subscribe to Firebase onAuthStateChanged:
     *
     * import { getAuth, onAuthStateChanged } from 'firebase/auth';
     * const auth = getAuth();
     * const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
     *   if (firebaseUser) {
     *     const user = await dataService.getUserByEmail(firebaseUser.email!);
     *     callback(user);
     *   } else {
     *     callback(null);
     *   }
     * });
     * return unsubscribe;
     * ========================================================================= */

    return () => {
      this.listeners.delete(callback);
    };
  }

  private notify(): void {
    const user = this.getCurrentUser();
    this.listeners.forEach((listener) => {
      try {
        listener(user);
      } catch (e) {
        console.error('Error in auth listener:', e);
      }
    });
  }

  /**
   * Simulated Google Sign-In or Production Google Auth
   */
  public async signIn(
    provider: 'google' | 'mock' = 'mock',
    credentials?: {
      targetUserId?: string;
      customUser?: { name: string; email: string; orgType?: OrganizationType; orgName?: string };
    }
  ): Promise<User> {
    if (APP_CONFIG.AUTH_MODE === 'google') {
      /* =========================================================================
       * TODO [FIREBASE GOOGLE POPUP AUTH]:
       * import { getAuth, signInWithPopup, GoogleAuthProvider } from 'firebase/auth';
       * const auth = getAuth();
       * const provider = new GoogleAuthProvider();
       * const result = await signInWithPopup(auth, provider);
       * const email = result.user.email;
       * let user = dataService.getUserByEmail(email);
       * if (!user) {
       *   user = dataService.createUser({
       *     name: result.user.displayName || 'New User',
       *     email: result.user.email!,
       *     avatar: result.user.photoURL || '',
       *   });
       * }
       * return user;
       * ========================================================================= */
      throw new Error('Google Auth mode requires live Firebase credentials.');
    }

    // Mock Mode Implementation:
    let resolvedUser: User | null = null;

    if (credentials?.targetUserId) {
      resolvedUser = dataService.getUserById(credentials.targetUserId);
    } else if (credentials?.customUser) {
      const existing = dataService.getUserByEmail(credentials.customUser.email);
      if (existing) {
        resolvedUser = existing;
      } else {
        // Create new user (will trigger onboarding flow if organizationProfile is absent)
        resolvedUser = dataService.createUser({
          name: credentials.customUser.name,
          email: credentials.customUser.email,
          role: 'member',
          planId: 'free',
        });
      }
    } else {
      // Default to sample admin
      resolvedUser = dataService.getUserById('user_admin_linda') || SEED_USERS[0];
    }

    if (!resolvedUser) {
      throw new Error('Failed to resolve user account.');
    }

    // Update last login
    dataService.updateUser(resolvedUser.id, { lastLogin: new Date().toISOString() });
    resolvedUser = dataService.getUserById(resolvedUser.id)!;

    this.currentUser = resolvedUser;
    localStorage.setItem('mla_current_user_id_v1', resolvedUser.id);
    this.notify();
    return resolvedUser;
  }

  public async signOut(): Promise<void> {
    if (this.impersonatingFromUser) {
      this.stopImpersonating();
      return;
    }

    /* =========================================================================
     * TODO [FIREBASE AUTH SIGNOUT]:
     * const auth = getAuth();
     * await firebaseSignOut(auth);
     * ========================================================================= */

    this.currentUser = null;
    localStorage.removeItem('mla_current_user_id_v1');
    localStorage.removeItem('mla_impersonated_by_v1');
    this.notify();
  }

  /**
   * Admin Impersonation: "View as user"
   */
  public impersonateUser(targetUser: User): void {
    if (!this.currentUser) return;
    this.impersonatingFromUser = this.currentUser;
    localStorage.setItem('mla_impersonated_by_v1', this.currentUser.id);

    this.currentUser = targetUser;
    localStorage.setItem('mla_current_user_id_v1', targetUser.id);

    dataService.logAction(
      'ADMIN_IMPERSONATION_START',
      `Admin ${this.impersonatingFromUser.name} started impersonating ${targetUser.name} (${targetUser.email})`,
      targetUser.id
    );

    this.notify();
  }

  public stopImpersonating(): void {
    if (!this.impersonatingFromUser) return;

    const returnAdmin = this.impersonatingFromUser;
    const previouslyViewed = this.currentUser;

    this.currentUser = returnAdmin;
    this.impersonatingFromUser = null;
    localStorage.setItem('mla_current_user_id_v1', returnAdmin.id);
    localStorage.removeItem('mla_impersonated_by_v1');

    dataService.logAction(
      'ADMIN_IMPERSONATION_END',
      `Admin ${returnAdmin.name} exited impersonation view of ${previouslyViewed?.name}`,
      previouslyViewed?.id
    );

    this.notify();
  }

  public getSampleAccounts(): User[] {
    const admin = dataService.getUserById('user_admin_linda') || SEED_USERS[0];
    const nonprofit = dataService.getUserById('user_sarah_jenkins') || SEED_USERS[1];
    const startup = dataService.getUserById('user_marcus_chen') || SEED_USERS[2];
    return [admin, nonprofit, startup];
  }
}

export const authService = new AuthService();
