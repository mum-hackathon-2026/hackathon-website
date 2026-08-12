import { Injectable, InjectionToken, computed, effect, inject, signal } from '@angular/core';

/**
 * DEMO AUTHENTICATION — NOT REAL.
 *
 * There is no auth backend yet: no login endpoint, no session, no token. This
 * service hands out one of three hardcoded users so the role-gated pages can be
 * built and reviewed before Google OAuth lands. Everything here is replaced at
 * that point; nothing in it should be treated as a security boundary.
 *
 * A user holds exactly one role, matching `users.role` in V1 — a single text
 * column with `check (role in ('participant', 'judge', 'admin'))` and no join
 * table. The strings below are that CHECK vocabulary verbatim.
 */

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

/**
 * Where each role lands after signing in. Repointed as each role's landing page
 * lands; admin still goes home because `/admin/dashboard` does not exist yet.
 *
 * Nothing reads this yet — `SignIn` uses the guard's `returnUrl` and falls back
 * to `/`. Wiring it in changes the landing page for all three roles at once, so
 * it waits until the last of them has somewhere of its own to go.
 */
export const ROLE_HOME: Record<Role, string> = {
  participant: '/participant/team',
  judge: '/judge/portal',
  admin: '/',
};

const STORAGE_KEY = 'hackathon.demo-auth';

/**
 * Where the demo session is kept. Injected rather than reached for directly so
 * tests can supply an in-memory stand-in — jsdom serves pages from an opaque
 * origin, where `localStorage` is not available at all.
 */
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
  /** Key into DEMO_USERS, not a full user — the constants are the source of truth. */
  readonly account: Role;
}

function isRole(value: unknown): value is Role {
  return typeof value === 'string' && (ROLES as readonly string[]).includes(value);
}

/**
 * Rebuilds the session from storage so a page refresh doesn't sign you out
 * mid-task. Anything unrecognised is discarded rather than trusted.
 */
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
    return isRole(parsed.account) ? DEMO_USERS[parsed.account] : null;
  } catch {
    return null;
  }
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly storage = inject(SESSION_STORAGE);
  private readonly currentUser = signal<AuthUser | null>(restoreSession(this.storage));

  readonly user = this.currentUser.asReadonly();
  readonly isSignedIn = computed(() => this.currentUser() !== null);
  readonly role = computed<Role | null>(() => this.currentUser()?.role ?? null);

  constructor() {
    effect(() => this.persist(this.currentUser()));
  }

  hasRole(role: Role): boolean {
    return this.role() === role;
  }

  signIn(account: Role): void {
    this.currentUser.set(DEMO_USERS[account]);
  }

  signOut(): void {
    this.currentUser.set(null);
  }

  private persist(user: AuthUser | null): void {
    if (!this.storage) return;
    try {
      if (!user) {
        this.storage.removeItem(STORAGE_KEY);
        return;
      }
      const session: StoredSession = { account: user.role };
      this.storage.setItem(STORAGE_KEY, JSON.stringify(session));
    } catch {
      // Storage full or unavailable — the session just won't survive a refresh.
    }
  }
}
