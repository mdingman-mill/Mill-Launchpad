import { signInWithPopup, signOut as firebaseSignOut, onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { auth, googleProvider } from '../firebase';
import { User } from '../types';

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
        } catch (error) {
          console.error('[Auth Service] Backend sync failed on state change:', error);
          this.currentUser = null;
        }
      } else {
        this.currentUser = null;
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
    const res = await fetch('/api/auth/sync', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || 'Failed to authenticate with server');
    }

    const data = await res.json();
    return data.user as User;
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
    this.notify();
    return user;
  }

  /**
   * Sign Out
   */
  public async signOut(): Promise<void> {
    await firebaseSignOut(auth);
    this.currentUser = null;
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
