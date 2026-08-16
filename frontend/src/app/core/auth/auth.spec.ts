import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { API_BASE_URL, AuthService, SESSION_STORAGE } from './auth';

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

/*
 * The real sign-in path. `signIn(role)` above is the demo one — no network, no
 * token — and nothing downstream can tell the two sessions apart, so this is the
 * only place the difference is visible.
 *
 * The backend is the access control: a valid Google account whose email is not
 * in `users` gets 403, and there is no self-registration endpoint. That makes
 * the error branches below the user-facing half of the allowlist, which is why
 * each one is pinned to its own message rather than a generic failure.
 */
describe('AuthService.signInWithGoogle', () => {
  const API = 'http://localhost:8080';
  const ENDPOINT = `${API}/api/auth/google`;

  let auth: AuthService;
  let http: HttpTestingController;
  let storage: Storage;

  const RESPONSE = {
    token: 'header.payload.signature',
    user: { id: 42, email: 'pmenon@student.monash.edu', fullName: 'Priya Menon', role: 'judge' },
  };

  function setUp(store: Storage | null = memoryStorage()) {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: SESSION_STORAGE, useValue: store },
        { provide: API_BASE_URL, useValue: API },
      ],
    });

    auth = TestBed.inject(AuthService);
    http = TestBed.inject(HttpTestingController);
    if (store) storage = store;
  }

  /** Runs the call and answers it with a success body. */
  async function signInWith(body: object = RESPONSE) {
    const inFlight = auth.signInWithGoogle('google-id-token');
    http.expectOne(ENDPOINT).flush(body);
    return inFlight;
  }

  /** Runs the call and answers it with an HTTP error. */
  async function failWith(status: number, body: object = {}) {
    const inFlight = auth.signInWithGoogle('google-id-token');
    http.expectOne(ENDPOINT).flush(body, { status, statusText: 'Error' });
    return inFlight;
  }

  afterEach(() => {
    http.verify();
  });

  describe('the request', () => {
    it('posts the ID token to the configured backend', async () => {
      setUp();

      const inFlight = auth.signInWithGoogle('google-id-token');
      const req = http.expectOne(ENDPOINT);

      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ idToken: 'google-id-token' });

      req.flush(RESPONSE);
      await inFlight;
    });

    // The base URL is a token so a deployed build can point elsewhere; a
    // hardcoded localhost would work in dev and fail everywhere else.
    it('honours API_BASE_URL rather than a hardcoded host', async () => {
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [
          provideHttpClient(),
          provideHttpClientTesting(),
          { provide: SESSION_STORAGE, useValue: null },
          { provide: API_BASE_URL, useValue: 'https://api.example.edu' },
        ],
      });
      auth = TestBed.inject(AuthService);
      http = TestBed.inject(HttpTestingController);

      const inFlight = auth.signInWithGoogle('google-id-token');
      http.expectOne('https://api.example.edu/api/auth/google').flush(RESPONSE);

      await inFlight;
    });
  });

  describe('on success', () => {
    it('reports the role the backend assigned', async () => {
      setUp();

      const result = await signInWith();

      expect(result).toEqual({ ok: true, role: 'judge' });
    });

    /*
     * The role comes from `users.role`, and the guards and `ROLE_HOME` both key
     * off it. Trusting the string blindly would let an unrecognised value reach
     * a `Record<Role, …>` lookup and land the user nowhere.
     */
    it('falls back to participant when the backend sends a role it does not know', async () => {
      setUp();

      const result = await signInWith({
        ...RESPONSE,
        user: { ...RESPONSE.user, role: 'superuser' },
      });

      expect(result).toEqual({ ok: true, role: 'participant' });
      expect(auth.role()).toBe('participant');
    });

    it('signs the user in with what the backend returned', async () => {
      setUp();

      await signInWith();

      expect(auth.isSignedIn()).toBe(true);
      expect(auth.user()).toMatchObject({
        id: 42,
        name: 'Priya Menon',
        email: 'pmenon@student.monash.edu',
        role: 'judge',
      });
    });

    it('carries the JWT on the session', async () => {
      setUp();

      await signInWith();

      expect(auth.token()).toBe('header.payload.signature');
    });

    // The demo path has no token at all, which is the one observable difference
    // between a real session and a demo one.
    it('leaves a demo session tokenless', () => {
      setUp();

      auth.signIn('judge');

      expect(auth.isSignedIn()).toBe(true);
      expect(auth.token()).toBeNull();
    });

    describe('the display name', () => {
      it('initials a two-part name from its first and last word', async () => {
        setUp();

        await signInWith();

        expect(auth.user()?.initials).toBe('PM');
      });

      it('takes the first two letters of a single-word name', async () => {
        setUp();

        await signInWith({ ...RESPONSE, user: { ...RESPONSE.user, fullName: 'Prince' } });

        expect(auth.user()?.initials).toBe('PR');
      });

      it('ignores middle names, so the initials stay two letters', async () => {
        setUp();

        await signInWith({
          ...RESPONSE,
          user: { ...RESPONSE.user, fullName: 'Nur Aisyah binti Rahman' },
        });

        expect(auth.user()?.initials).toBe('NR');
      });

      /*
       * `users.full_name` can be empty — a row imported from the registration
       * form before its owner has ever signed in has whatever the form gave.
       * An empty name would otherwise render as a blank avatar and a blank
       * profile line.
       */
      it('falls back to the email when the backend sends no name', async () => {
        setUp();

        await signInWith({ ...RESPONSE, user: { ...RESPONSE.user, fullName: '' } });

        expect(auth.user()?.name).toBe('pmenon@student.monash.edu');
        expect(auth.user()?.initials).toBe('PM');
      });
    });

    describe('persistence', () => {
      it('stores the JWT under its own key, so a reload can find it', async () => {
        setUp();

        await signInWith();
        TestBed.flushEffects();

        expect(storage.getItem('hackathon.jwt-token')).toBe('header.payload.signature');
      });

      it('restores the real session across a reload, token and all', async () => {
        setUp();

        await signInWith();
        TestBed.flushEffects();

        TestBed.resetTestingModule();
        TestBed.configureTestingModule({
          providers: [
            provideHttpClient(),
            provideHttpClientTesting(),
            { provide: SESSION_STORAGE, useValue: storage },
            { provide: API_BASE_URL, useValue: API },
          ],
        });
        const restored = TestBed.inject(AuthService);
        http = TestBed.inject(HttpTestingController);

        expect(restored.isSignedIn()).toBe(true);
        expect(restored.role()).toBe('judge');
        expect(restored.token()).toBe('header.payload.signature');
      });

      it('clears the JWT as well as the session on sign out', async () => {
        setUp();

        await signInWith();
        TestBed.flushEffects();
        auth.signOut();
        TestBed.flushEffects();

        expect(storage.getItem('hackathon.jwt-token')).toBeNull();
        expect(storage.getItem('hackathon.demo-auth')).toBeNull();
      });

      it('signs in even where storage is unavailable', async () => {
        setUp(null);

        const result = await signInWith();

        expect(result).toEqual({ ok: true, role: 'judge' });
        expect(auth.isSignedIn()).toBe(true);
      });
    });
  });

  describe('on failure', () => {
    /*
     * 403 is the allowlist speaking: the Google account is real and verified,
     * but no `users` row carries that email. There is no self-registration, so
     * the message has to say the account is not registered rather than imply
     * the credentials were wrong.
     */
    it('explains a 403 as an unregistered email', async () => {
      setUp();

      const result = await failWith(403);

      expect(result).toEqual({
        ok: false,
        error: 'Access denied: Your email is not registered in the database.',
      });
    });

    it('prefers the backend’s own wording on a 403 when it sends one', async () => {
      setUp();

      const result = await failWith(403, { error: 'Your account has been withdrawn.' });

      expect(result).toEqual({ ok: false, error: 'Your account has been withdrawn.' });
    });

    // 401 is the token itself being rejected — an unverified Google email, or a
    // token that failed audience verification against app.google.client-id.
    it('explains a 401 as a bad token', async () => {
      setUp();

      const result = await failWith(401);

      expect(result).toEqual({ ok: false, error: 'Invalid or expired Google token.' });
    });

    it('prefers the backend’s own wording on a 401 when it sends one', async () => {
      setUp();

      const result = await failWith(401, { error: 'Verify your Google email first.' });

      expect(result).toEqual({ ok: false, error: 'Verify your Google email first.' });
    });

    /*
     * Status 0 is the browser refusing to report anything — the server is down,
     * or CORS rejected the response. During development that is nearly always
     * "Spring Boot isn't running", which is worth saying outright rather than
     * leaving as a generic failure.
     */
    it('names the likely cause when the backend cannot be reached', async () => {
      setUp();

      const inFlight = auth.signInWithGoogle('google-id-token');
      http.expectOne(ENDPOINT).error(new ProgressEvent('error'), { status: 0 });

      expect(await inFlight).toEqual({
        ok: false,
        error:
          'Cannot connect to backend server. Make sure Spring Boot is running on localhost:8080.',
      });
    });

    it('falls back to a generic message on any other status', async () => {
      setUp();

      const result = await failWith(500);

      expect(result).toEqual({
        ok: false,
        error: 'Access denied: Unable to sign in with Google.',
      });
    });

    // The one thing every failure branch must agree on: a rejected sign-in
    // leaves no session behind for a guard to wave through.
    it('leaves the caller signed out, whatever went wrong', async () => {
      for (const status of [401, 403, 500]) {
        setUp();

        await failWith(status);

        expect(auth.isSignedIn()).toBe(false);
        expect(auth.user()).toBeNull();
        expect(auth.token()).toBeNull();
      }
    });

    it('does not disturb a session already in place', async () => {
      setUp();
      await signInWith();

      const result = await failWith(403);

      expect(result.ok).toBe(false);
      expect(auth.isSignedIn()).toBe(true);
      expect(auth.role()).toBe('judge');
    });
  });
});
