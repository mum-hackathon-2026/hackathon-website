import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, InjectionToken, computed, effect, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

export type Role = 'participant' | 'judge' | 'admin';

export const ROLES: readonly Role[] = ['participant', 'judge', 'admin'];

export const ROLE_LABELS: Record<Role, string> = {
  participant: 'Participant',
  judge: 'Judge',
  admin: 'Administrator',
};

export interface AuthUser {
  /** Mirrors `users.id`, which team_members.user_id and teams.created_by reference. */
  readonly id: number;
  readonly name: string;
  readonly email: string;
  readonly initials: string;
  readonly role: Role;
  readonly token?: string;
}

export const DEMO_USERS: Record<Role, AuthUser> = {
  participant: {
    id: 1,
    name: 'Priya Menon',
    email: 'pmenon@student.monash.edu',
    initials: 'PM',
    role: 'participant',
  },
  judge: {
    id: 2,
    name: 'Dr. Sofia Lindqvist',
    email: 's.lindqvist@monash.edu',
    initials: 'SL',
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
  factory: () => 'http://localhost:8080',
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
      return globalThis.localStorage ?? null;
    } catch {
      return null; // Private browsing, or storage disabled.
    }
  },
});

interface StoredSession {
  readonly account?: Role;
  readonly user?: AuthUser;
}

interface BackendAuthResponse {
  token: string;
  user: {
    id: number;
    email: string;
    fullName: string;
    role: string;
  };
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

function restoreSession(storage: Storage | null): AuthUser | null {
  let raw: string | null = null;
  try {
    raw = storage?.getItem(STORAGE_KEY) ?? null;
  } catch {
    return null;
  }
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<StoredSession>;
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

  constructor() {
    effect(() => this.persist(this.currentUser()));
  }

  hasRole(role: Role): boolean {
    return this.role() === role;
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

      const userRole = isRole(response.user.role) ? response.user.role : 'participant';
      const authUser: AuthUser = {
        id: response.user.id,
        name: response.user.fullName || response.user.email,
        email: response.user.email,
        initials: getInitials(response.user.fullName || response.user.email),
        role: userRole,
        token: response.token,
      };

      this.currentUser.set(authUser);
      return { ok: true, role: userRole };
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
      this.storage.setItem(STORAGE_KEY, JSON.stringify(session));
      if (user.token) {
        this.storage.setItem(JWT_STORAGE_KEY, user.token);
      }
    } catch {
      // Storage full or unavailable
    }
  }
}
