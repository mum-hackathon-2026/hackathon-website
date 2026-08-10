import { TestBed } from '@angular/core/testing';
import { AuthService, SESSION_STORAGE } from './auth';

/** Minimal in-memory Storage — jsdom's opaque origin has no localStorage. */
function memoryStorage(seed: Record<string, string> = {}): Storage {
  const map = new Map<string, string>(Object.entries(seed));
  return {
    get length() {
      return map.size;
    },
    key: (i: number) => [...map.keys()][i] ?? null,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
  } as Storage;
}

describe('AuthService', () => {
  function serviceWith(storage: Storage | null): AuthService {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [{ provide: SESSION_STORAGE, useValue: storage }],
    });
    return TestBed.inject(AuthService);
  }

  it('starts signed out', () => {
    const auth = serviceWith(memoryStorage());
    expect(auth.user()).toBeNull();
    expect(auth.isSignedIn()).toBe(false);
    expect(auth.role()).toBeNull();
  });

  it('signs a demo account in and back out', () => {
    const auth = serviceWith(memoryStorage());

    auth.signIn('participant');
    expect(auth.isSignedIn()).toBe(true);
    expect(auth.role()).toBe('participant');

    auth.signOut();
    expect(auth.isSignedIn()).toBe(false);
    expect(auth.role()).toBeNull();
  });

  it('holds exactly one role, matching users.role', () => {
    const auth = serviceWith(memoryStorage());
    auth.signIn('admin');

    expect(auth.hasRole('admin')).toBe(true);
    expect(auth.hasRole('judge')).toBe(false);
    expect(auth.hasRole('participant')).toBe(false);
  });

  it('restores the session across a reload', () => {
    const storage = memoryStorage();
    serviceWith(storage).signIn('judge');
    TestBed.flushEffects();

    // Same storage, fresh injector — stands in for a page refresh.
    const restored = serviceWith(storage);

    expect(restored.isSignedIn()).toBe(true);
    expect(restored.role()).toBe('judge');
  });

  it('clears storage on sign out', () => {
    const storage = memoryStorage();
    const auth = serviceWith(storage);
    auth.signIn('judge');
    TestBed.flushEffects();

    auth.signOut();
    TestBed.flushEffects();

    expect(serviceWith(storage).isSignedIn()).toBe(false);
  });

  it('discards a stored session naming an unknown role', () => {
    const storage = memoryStorage({
      'hackathon.demo-auth': JSON.stringify({ account: 'superuser' }),
    });

    expect(serviceWith(storage).user()).toBeNull();
  });

  it('ignores unparseable stored sessions', () => {
    const storage = memoryStorage({ 'hackathon.demo-auth': 'not json' });
    expect(serviceWith(storage).user()).toBeNull();
  });

  it('works with no storage at all', () => {
    const auth = serviceWith(null);

    auth.signIn('participant');

    expect(auth.isSignedIn()).toBe(true);
  });
});
