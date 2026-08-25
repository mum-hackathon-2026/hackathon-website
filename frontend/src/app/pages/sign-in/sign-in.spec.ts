import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import {
  API_BASE_URL,
  AuthService,
  GOOGLE_CLIENT_ID,
  ROLES,
  ROLE_HOME,
  SESSION_STORAGE,
} from '../../core/auth/auth';
import { SignIn } from './sign-in';

@Component({ template: 'stub' })
class Stub {}

describe('SignIn', () => {
  beforeEach(async () => {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [SignIn],
      providers: [
        { provide: SESSION_STORAGE, useValue: null },
        provideRouter([
          { path: '', component: Stub },
          { path: 'sign-in', component: SignIn },
          { path: 'team', component: Stub },
          ...ROLES.map((role) => ({ path: ROLE_HOME[role].slice(1), component: Stub })),
        ]),
      ],
    }).compileComponents();
  });

  afterEach(() => {
    delete window.google;
    delete window.__googleGisInitialized;
  });

  it('hands Google Identity Services the injected client id', async () => {
    const initialize = vi.fn();
    window.google = { accounts: { id: { initialize, renderButton: vi.fn() } } };

    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [SignIn],
      providers: [
        { provide: SESSION_STORAGE, useValue: null },
        { provide: GOOGLE_CLIENT_ID, useValue: 'test-client.apps.googleusercontent.com' },
        provideRouter([{ path: 'sign-in', component: SignIn }]),
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(SignIn);
    await fixture.whenStable();

    expect(initialize).toHaveBeenCalledWith(
      expect.objectContaining({ client_id: 'test-client.apps.googleusercontent.com' }),
    );
  });

  describe('loading Google Identity Services', () => {
    function script(): HTMLScriptElement | null {
      return document.getElementById('google-gis-script') as HTMLScriptElement | null;
    }

    afterEach(() => {
      script()?.remove();
    });

    it('injects the GIS script when it is not on the page', async () => {
      const fixture = TestBed.createComponent(SignIn);
      await fixture.whenStable();

      expect(script()).toBeTruthy();
      expect(script()!.src).toBe('https://accounts.google.com/gsi/client');
      expect(script()!.async).toBe(true);
    });

    it('does not add a second copy when one is already there', async () => {
      await (await TestBed.createComponent(SignIn)).whenStable();
      await (await TestBed.createComponent(SignIn)).whenStable();

      expect(document.querySelectorAll('#google-gis-script').length).toBe(1);
    });

    it('renders the button immediately when GIS is already available', async () => {
      const renderButton = vi.fn();
      window.google = { accounts: { id: { initialize: vi.fn(), renderButton } } };

      const fixture = TestBed.createComponent(SignIn);
      await fixture.whenStable();

      expect(renderButton).toHaveBeenCalledTimes(1);
      expect(script()).toBeNull();
    });

    it('survives GIS refusing to initialise', async () => {
      window.google = {
        accounts: {
          id: {
            initialize: () => {
              throw new Error('Invalid client id');
            },
            renderButton: vi.fn(),
          },
        },
      };

      const fixture = TestBed.createComponent(SignIn);
      await fixture.whenStable();
      expect(fixture.componentInstance).toBeTruthy();
    });
  });
});

describe('SignIn — signing in with a Google credential', () => {
  const ENDPOINT = 'http://localhost:8080/api/auth/google';

  let fixture: ComponentFixture<SignIn>;
  let router: Router;
  let auth: AuthService;
  let http: HttpTestingController;

  const RESPONSE = {
    token: 'header.payload.signature',
    user: { id: 2, email: 's.lindqvist@monash.edu', fullName: 'Sofia Lindqvist', role: 'judge' },
  };

  function host(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function alert(): HTMLElement | null {
    return host().querySelector('.sign-in__error-alert');
  }

  async function setUp(url = '/sign-in') {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [SignIn],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: SESSION_STORAGE, useValue: null },
        { provide: API_BASE_URL, useValue: 'http://localhost:8080' },
        provideRouter([
          { path: 'sign-in', component: SignIn },
          { path: 'team', component: Stub },
          ...ROLES.map((role) => ({ path: ROLE_HOME[role].slice(1), component: Stub })),
        ]),
      ],
    }).compileComponents();

    router = TestBed.inject(Router);
    auth = TestBed.inject(AuthService);
    http = TestBed.inject(HttpTestingController);

    await router.navigateByUrl(url);
    fixture = TestBed.createComponent(SignIn);
    await fixture.whenStable();
  }

  afterEach(() => {
    http.verify();
    document.getElementById('google-gis-script')?.remove();
    delete window.google;
    delete window.__googleGisInitialized;
  });

  it('sends the token and lands on the role’s own pages', async () => {
    await setUp();

    const promise = (fixture.componentInstance as any).handleGoogleCredential('google-id-token');
    await fixture.whenStable();

    http.expectOne(ENDPOINT).flush(RESPONSE);
    await promise;
    await fixture.whenStable();

    expect(auth.isSignedIn()).toBe(true);
    expect(auth.role()).toBe('judge');
    expect(router.url).toBe(ROLE_HOME.judge);
  });

  it('returns to where a guard interrupted, rather than the role’s home', async () => {
    await setUp('/sign-in?returnUrl=%2Fteam');

    const promise = (fixture.componentInstance as any).handleGoogleCredential('google-id-token');
    await fixture.whenStable();

    http.expectOne(ENDPOINT).flush(RESPONSE);
    await promise;
    await fixture.whenStable();

    expect(router.url).toBe('/team');
  });

  it('shows the reason when the email is not registered', async () => {
    await setUp();

    const promise = (fixture.componentInstance as any).handleGoogleCredential('google-id-token');
    await fixture.whenStable();

    http.expectOne(ENDPOINT).flush({}, { status: 403, statusText: 'Forbidden' });
    await promise;
    await fixture.whenStable();

    expect(alert()!.textContent).toContain('not registered in the database');
    expect(auth.isSignedIn()).toBe(false);
    expect(router.url).toBe('/sign-in');
  });

  it('announces the failure rather than only colouring it', async () => {
    await setUp();

    const promise = (fixture.componentInstance as any).handleGoogleCredential('google-id-token');
    await fixture.whenStable();

    http.expectOne(ENDPOINT).flush({}, { status: 401, statusText: 'Unauthorized' });
    await promise;
    await fixture.whenStable();

    expect(alert()!.getAttribute('role')).toBe('alert');
  });

  it('shows no error before anything has been tried', async () => {
    await setUp();

    expect(alert()).toBeNull();
  });
});
