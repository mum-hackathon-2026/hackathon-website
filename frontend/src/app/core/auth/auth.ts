import { Injectable, InjectionToken, computed, effect, inject, signal } from '@angular/core';

/**
 * DEMO AUTHENTICATION — NOT REAL.
 *
 * There is no auth backend yet: no login endpoint, no session, no token. This
 * service hands out one of three hardcoded users so the role-gated pages can be
 * built and reviewed before Google OAuth lands. Everything here is replaced at
 * that point; nothing in it should be treated as a security boundary.
 */

export type Role = 'participant' | 'judge' | 'admin';

export const ROLES: readonly Role[] = ['participant', 'judge', 'admin'];

export const ROLE_LABELS: Record<Role, string> = {
  participant: 'Participant',
  judge: 'Judge',
  admin: 'Administrator',
};

export interface AuthUser {
  readonly name: string;
  readonly email: string;
  readonly initials: string;
  /** Every role this person holds. Membership is fixed; activeRole is a view. */
  readonly roles: readonly Role[];
  readonly activeRole: Role;
}

export const DEMO_USERS: Record<Role, AuthUser> = {
  participant: {
    name: 'Priya Menon',
    email: 'pmenon@student.monash.edu',
    initials: 'PM',
    roles: ['participant'],
    activeRole: 'participant',
  },
  judge: {
    name: 'Dr. Sofia Lindqvist',
    email: 's.lindqvist@monash.edu',
    initials: 'SL',
    roles: ['judge'],
    activeRole: 'judge',
  },
  // Deliberately multi-role, so the role switcher has something to switch.
  admin: {
    name: 'Mei-Lin Zhao',
    email: 'mzhao@monash.edu',
    initials: 'MZ',
    roles: ['participant', 'judge', 'admin'],
    activeRole: 'admin',
  },
};

/**
 * Where each role lands when it is switched to. All point at home for now
 * because no role-specific page exists yet; repoint each one as its page lands
 * (`/participant/team`, `/judge/portal`, `/admin/dashboard` in the draft).
 */
export const ROLE_HOME: Record<Role, string> = {
  participant: '/',
  judge: '/',
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
  readonly activeRole: Role;
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
    if (!isRole(parsed.account) || !isRole(parsed.activeRole)) return null;

    const account = DEMO_USERS[parsed.account];
    if (!account.roles.includes(parsed.activeRole)) return null;

    return { ...account, activeRole: parsed.activeRole };
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
  readonly activeRole = computed(() => this.currentUser()?.activeRole ?? null);
  readonly roles = computed<readonly Role[]>(() => this.currentUser()?.roles ?? []);

  constructor() {
    effect(() => this.persist(this.currentUser()));
  }

  /** True when the person holds the role at all, regardless of which they're viewing as. */
  hasRole(role: Role): boolean {
    return this.roles().includes(role);
  }

  signIn(account: Role): void {
    this.currentUser.set(DEMO_USERS[account]);
  }

  signOut(): void {
    this.currentUser.set(null);
  }

  /** Switching is a change of view, never a grant — unheld roles are ignored. */
  switchRole(role: Role): void {
    const current = this.currentUser();
    if (!current || !current.roles.includes(role)) return;
    this.currentUser.set({ ...current, activeRole: role });
  }

  private persist(user: AuthUser | null): void {
    if (!this.storage) return;
    try {
      if (!user) {
        this.storage.removeItem(STORAGE_KEY);
        return;
      }
      // The account is identified by its widest role, matching the DEMO_USERS key.
      const account = user.roles.includes('admin')
        ? 'admin'
        : user.roles.includes('judge')
          ? 'judge'
          : 'participant';
      const session: StoredSession = { account, activeRole: user.activeRole };
      this.storage.setItem(STORAGE_KEY, JSON.stringify(session));
    } catch {
      // Storage full or unavailable — the session just won't survive a refresh.
    }
  }
}
