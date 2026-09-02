import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, InjectionToken, computed, effect, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { decryptStorageValue, encryptStorageValue } from './storage-crypto';

export type Role = 'participant' | 'judge' | 'admin';

export const ROLES: readonly Role[] = ['participant', 'judge', 'admin'];

export const ROLE_LABELS: Record<Role, string> = {
  participant: 'Participant',
  judge: 'Judge',
  admin: 'Administrator',
};

export interface AuthUser {
  id: number;
  name: string;
  email: string;
  initials: string;
  role: Role;
  token?: string;
}

export const DEMO_USERS: Record<Role, AuthUser> = {
  participant: {
    id: 1,
    name: 'Ahmad bin Razak',
    email: 'ahmad.razak@student.monash.edu',
    initials: 'AR',
    role: 'participant',
  },
  judge: {
    id: 2,
    name: 'Dr. Sarah Chen',
    email: 'sarah.chen@monash.edu',
    initials: 'SC',
    role: 'judge',
  },
  admin: {
    id: 3,
    name: 'Mei-Lin Zhao',
    email: 'mzhao@monash.edu',
    initials: 'MZ',
    role: 'admin',
  },
};

export const ROLE_HOME: Record<Role, string> = {
  participant: '/participant/team',
  judge: '/judge/portal',
  admin: '/admin/dashboard',
};

const STORAGE_KEY = 'hackathon.demo-auth';
const JWT_STORAGE_KEY = 'hackathon.jwt-token';

export const API_BASE_URL = new InjectionToken<string>('API_BASE_URL', {
  providedIn: 'root',
  factory: () => {
    if (typeof window !== 'undefined' && window.location) {
      const hostname = window.location.hostname;
      if (hostname === 'localhost' || hostname === '127.0.0.1') {
        return 'http://localhost:8080';
      }
      return 'https://hackathon-backend-xjhca4nqka-as.a.run.app';
    }
    return 'http://localhost:8080';
  },
});

/**
 * The Google Cloud OAuth2 client id, passed to Google Identity Services on the
 * sign-in page. A client id is public by design — this is a deployment value,
 * not a secret — but it changes per environment, so it lives behind a token
 * rather than in the component.
 *
 * The backend verifies ID tokens against its own `app.google.client-id`
 * (`GoogleAuthProperties`), which is a separate copy of the same value. **The two
 * must match**: a token minted for one client id fails audience verification
 * against the other, and the login answers 401 with nothing obviously wrong on
 * either side.
 */
export const GOOGLE_CLIENT_ID = new InjectionToken<string>('GOOGLE_CLIENT_ID', {
  providedIn: 'root',
  factory: () => '501736662413-eld3psa4vnmuf4ktebbde62s06cflc3r.apps.googleusercontent.com',
});

export const SESSION_STORAGE = new InjectionToken<Storage | null>('SESSION_STORAGE', {
  providedIn: 'root',
  factory: () => {
    try {
      return globalThis.sessionStorage ?? globalThis.localStorage ?? null;
    } catch {
      return null; // Private browsing, or storage disabled.
    }
  },
});

interface StoredSession {
  readonly account?: Role;
  readonly user?: AuthUser;
}

interface BackendUser {
  id: number;
  email: string;
  fullName: string;
  role: string;
}

interface BackendAuthResponse {
  token: string;
  user: BackendUser;
}

function isRole(value: unknown): value is Role {
  return typeof value === 'string' && (ROLES as readonly string[]).includes(value);
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

/**
 * Maps a backend user onto the shape the app renders. Both sign-in and session
 * revalidation go through here so the two cannot derive a name or a set of
 * initials differently from the same row.
 */
function toAuthUser(info: BackendUser, token: string): AuthUser {
  const name = info.fullName || info.email;
  return {
    id: info.id,
    name,
    email: info.email,
    initials: getInitials(name),
    role: isRole(info.role) ? info.role : 'participant',
    token,
  };
}

function restoreSession(storage: Storage | null): AuthUser | null {
  let raw: string | null = null;
  try {
    raw = storage?.getItem(STORAGE_KEY) ?? null;
  } catch {
    return null;
  }
  if (!raw) return null;

  try {
    const decrypted = decryptStorageValue(raw);
    if (!decrypted) return null;
    const parsed = JSON.parse(decrypted) as Partial<StoredSession>;
    if (parsed.user && isRole(parsed.user.role)) {
      return parsed.user;
    }
    return isRole(parsed.account) ? DEMO_USERS[parsed.account] : null;
  } catch {
    return null;
  }
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly storage = inject(SESSION_STORAGE);
  private readonly http = inject(HttpClient);
  private readonly apiBaseUrl = inject(API_BASE_URL);

  private readonly currentUser = signal<AuthUser | null>(restoreSession(this.storage));

  readonly user = this.currentUser.asReadonly();
  readonly isSignedIn = computed(() => this.currentUser() !== null);
  readonly role = computed<Role | null>(() => this.currentUser()?.role ?? null);
  readonly token = computed<string | null>(() => this.currentUser()?.token ?? null);

  /**
   * The startup session check, so a caller can wait for it to settle. Nothing
   * in the app awaits it today — the guards deliberately do not (see
   * {@link revalidateSession}) — but it is what a route resolver would await if
   * the one-render window ever needs closing, and it is how the specs know the
   * check has finished.
   */
  readonly sessionCheck: Promise<void>;

  constructor() {
    effect(() => this.persist(this.currentUser()));
    this.sessionCheck = this.revalidateSession();
  }

  hasRole(role: Role): boolean {
    return this.role() === role;
  }

  /**
   * Checks a session restored from storage against the backend, and signs it
   * out if the token is no longer good.
   *
   * Storage is the only thing a reload consults, so without this a JWT that has
   * expired — or a user whose row has been deleted since — still reads as
   * signed in: the guards ask `isSignedIn()`, not the server. This closes that
   * by asking `GET /api/auth/me`, whose whole purpose is to answer it.
   *
   * Three rules, each of which matters:
   *
   * - **A tokenless session is left alone.** That is the demo `signIn(role)`
   *   path, which never had a token to validate; revalidating it would sign the
   *   role buttons straight back out.
   * - **Only 401 and 403 sign out.** Those are the server rejecting the token
   *   or the user. A network failure or a 5xx says the backend is unreachable
   *   or broken, which is no evidence the session is bad — logging everyone out
   *   because Spring Boot is restarting would be worse than the stale session.
   * - **The token is re-checked before acting.** This runs unawaited from the
   *   constructor, so a sign-in can land while it is in flight; applying a
   *   stale answer would clobber a session that has since become valid.
   *
   * This is deliberately not a gate on navigation. It resolves a tick or two
   * after bootstrap, so a guard can wave a stale session through once before
   * the answer arrives; the page behind it then has no data, because the API
   * refuses the same token. Blocking every route on a round trip to fix a
   * one-render window is the worse trade.
   *
   * Sends its own `Authorization` header — there is still no HTTP interceptor,
   * and this is the only authenticated request the frontend makes.
   */
  async revalidateSession(): Promise<void> {
    const token = this.token();
    if (!token) return;

    try {
      const info = await firstValueFrom(
        this.http.get<BackendUser>(`${this.apiBaseUrl}/api/auth/me`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      );
      if (this.token() !== token) return;
      this.currentUser.set(toAuthUser(info, token));
    } catch (err) {
      if (this.token() !== token) return;
      if (err instanceof HttpErrorResponse && (err.status === 401 || err.status === 403)) {
        this.signOut();
      }
    }
  }

  signIn(account: Role): void {
    this.currentUser.set(DEMO_USERS[account]);
  }

  async signInWithGoogle(
    idToken: string,
  ): Promise<{ ok: true; role: Role } | { ok: false; error: string }> {
    try {
      const response = await firstValueFrom(
        this.http.post<BackendAuthResponse>(`${this.apiBaseUrl}/api/auth/google`, { idToken }),
      );

      const authUser = toAuthUser(response.user, response.token);

      this.currentUser.set(authUser);
      return { ok: true, role: authUser.role };
    } catch (err) {
      let message = 'Access denied: Unable to sign in with Google.';
      if (err instanceof HttpErrorResponse) {
        if (err.status === 403) {
          message =
            err.error?.error || 'Access denied: Your email is not registered in the database.';
        } else if (err.status === 401) {
          message = err.error?.error || 'Invalid or expired Google token.';
        } else if (err.status === 0) {
          message =
            'Cannot connect to backend server. Make sure Spring Boot is running on localhost:8080.';
        }
      }
      return { ok: false, error: message };
    }
  }

  signOut(): void {
    this.currentUser.set(null);
  }

  private persist(user: AuthUser | null): void {
    if (!this.storage) return;
    try {
      if (!user) {
        this.storage.removeItem(STORAGE_KEY);
        this.storage.removeItem(JWT_STORAGE_KEY);
        return;
      }
      const session: StoredSession = { user };
      this.storage.setItem(STORAGE_KEY, encryptStorageValue(JSON.stringify(session)));
      if (user.token) {
        this.storage.setItem(JWT_STORAGE_KEY, encryptStorageValue(user.token));
      }
    } catch {
      // Storage full or unavailable
    }
  }
}
