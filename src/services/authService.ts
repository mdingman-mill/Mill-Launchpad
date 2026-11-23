import { signInWithPopup, signOut as firebaseSignOut, onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { auth, googleProvider } from '../firebase';
import { User, Organization, TeamSummary, TeamInvite } from '../types';
import { dataService } from './dataService';

type AuthListener = (user: User | null) => void;

class AuthService {
  private listeners: Set<AuthListener> = new Set();
  private currentUser: User | null = null;
  private isAuthReady = false;

  constructor() {
    this.initAuth();
  }

  private initAuth(): void {
    if (typeof window === 'undefined') return;

    onAuthStateChanged(auth, async (fbUser: FirebaseUser | null) => {
      if (fbUser) {
        try {
          const user = await this.syncWithBackend(fbUser);
          this.currentUser = user;
          dataService.setCachedUser(user);
          dataService.refreshLocalCache().catch(() => {});
        } catch (error) {
          console.error('[Auth Service] Backend sync failed on state change:', error);
          this.currentUser = null;
          dataService.clearCache();
        }
      } else {
        this.currentUser = null;
        dataService.clearCache();
      }

      this.isAuthReady = true;
      this.notify();
    });
  }

  /**
   * Syncs authenticated Firebase user with backend /api/auth/sync endpoint to verify token and obtain assigned role
   */
  public async syncWithBackend(fbUser: FirebaseUser): Promise<User> {
    const token = await fbUser.getIdToken();

    const executeSync = async (): Promise<Response> =>
      fetch('/api/auth/sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      });

    let res = await executeSync();
    let contentType = res.headers.get('content-type') || '';

    // Retry once briefly if an HTML fallback/restart page was returned transiently
    if (!contentType.includes('application/json')) {
      await new Promise((resolve) => setTimeout(resolve, 600));
      res = await executeSync();
      contentType = res.headers.get('content-type') || '';
    }

    const rawText = await res.text();
    let parsed: any = null;
    if (contentType.includes('application/json') || rawText.trim().startsWith('{')) {
      try {
        parsed = JSON.parse(rawText);
      } catch {
        parsed = null;
      }
    }

    if (!res.ok) {
      if (res.status === 401 || res.status === 403) {
        await firebaseSignOut(auth).catch(() => {});
      }
      throw new Error(parsed?.error || 'Failed to authenticate with server');
    }

    if (!parsed || !parsed.user) {
      throw new Error('Authentication API returned an invalid response. Please refresh and try again.');
    }

    if (parsed.platformSettings) {
      dataService.setCachedPlatformSettings(parsed.platformSettings);
    }
    if (parsed.organization) {
      dataService.setCachedOrganization(parsed.organization as Organization);
    }
    if (Array.isArray(parsed.teams)) {
      dataService.setCachedTeams(parsed.teams as TeamSummary[]);
    }
    if (Array.isArray(parsed.pendingTeamInvites)) {
      dataService.setCachedPendingTeamInvites(parsed.pendingTeamInvites as TeamInvite[]);
    }
    return parsed.user as User;
  }

  public getCurrentOrganization(): Organization | null {
    return dataService.getCachedOrganization();
  }

  public getCurrentUser(): User | null {
    return this.currentUser;
  }

  public getIsReady(): boolean {
    return this.isAuthReady;
  }

  public async getIdToken(): Promise<string | null> {
    if (!auth.currentUser) return null;
    return auth.currentUser.getIdToken();
  }

  public onAuthChange(callback: AuthListener): () => void {
    this.listeners.add(callback);
    if (this.isAuthReady) {
      callback(this.currentUser);
    }

    return () => {
      this.listeners.delete(callback);
    };
  }

  private notify(): void {
    this.listeners.forEach((listener) => {
      try {
        listener(this.currentUser);
      } catch (e) {
        console.error('Error in auth listener:', e);
      }
    });
  }

  /**
   * Sign In with Firebase Google Authentication
   */
  public async signIn(): Promise<User> {
    const userCredential = await signInWithPopup(auth, googleProvider);
    const user = await this.syncWithBackend(userCredential.user);
    this.currentUser = user;
    dataService.setCachedUser(user);
    dataService.refreshLocalCache().catch(() => {});
    this.notify();
    return user;
  }

  /**
   * Sign Out
   */
  public async signOut(): Promise<void> {
    await firebaseSignOut(auth);
    this.currentUser = null;
    dataService.clearCache();
    this.notify();
  }

  public getImpersonatingAdmin(): User | null {
    return null;
  }

  public stopImpersonating(): void {
    // No-op in production multi-user mode
  }
}

export const authService = new AuthService();
