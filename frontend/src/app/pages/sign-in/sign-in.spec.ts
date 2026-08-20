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

/** The buttons follow ROLES, so index 0 is the participant account. */
const PARTICIPANT = ROLES[0];

describe('SignIn', () => {
  let auth: AuthService;
  let router: Router;

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
          // Every role's landing page, so the ROLE_HOME fallback can resolve.
          ...ROLES.map((role) => ({ path: ROLE_HOME[role].slice(1), component: Stub })),
        ]),
      ],
    }).compileComponents();

    auth = TestBed.inject(AuthService);
    router = TestBed.inject(Router);
  });

  // Google Identity Services is absent under jsdom, so any stub one test installs
  // would otherwise leak into the next.
  afterEach(() => {
    delete window.google;
    delete window.__googleGisInitialized;
  });

  it('offers one button per demo account', async () => {
    const fixture = TestBed.createComponent(SignIn);
    await fixture.whenStable();

    const buttons = (fixture.nativeElement as HTMLElement).querySelectorAll('.sign-in__account');
    expect(buttons.length).toBe(3);
  });

  it("signs in as the chosen account and lands on that role's pages", async () => {
    await router.navigateByUrl('/sign-in');
    const fixture = TestBed.createComponent(SignIn);
    await fixture.whenStable();

    (fixture.nativeElement as HTMLElement)
      .querySelectorAll<HTMLButtonElement>('.sign-in__account')[0]
      .click();
    await fixture.whenStable();

    expect(auth.isSignedIn()).toBe(true);
    // Not the homepage: a signed-in participant wants their team, not marketing.
    expect(router.url).toBe(ROLE_HOME[PARTICIPANT]);
  });

  // The client id is a deployment value, and the backend holds its own copy in
  // app.google.client-id. If the two ever disagree, Google mints a token for one
  // audience and the backend rejects it as minted for another — a 401 with
  // nothing visibly wrong at either end. This asserts the component reads the
  // token rather than a literal, so there is one place to change per environment.
  it('hands Google Identity Services the injected client id', async () => {
    const initialize = vi.fn();
    window.google = { accounts: { id: { initialize, renderButton: vi.fn() } } };

    // A fresh module: the shared beforeEach has already injected from this one,
    // and TestBed refuses to override a provider after instantiation.
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

  it('returns to where a guard interrupted', async () => {
    await router.navigateByUrl('/sign-in?returnUrl=%2Fteam');
    const fixture = TestBed.createComponent(SignIn);
    await fixture.whenStable();

    (fixture.nativeElement as HTMLElement)
      .querySelectorAll<HTMLButtonElement>('.sign-in__account')[0]
      .click();
    await fixture.whenStable();

    expect(router.url).toBe('/team');
  });

  /*
   * The Google Identity Services script is loaded imperatively because GIS
   * renders its own button into a container we hand it. Under jsdom the script
   * never executes, so what is testable is the loading itself: that it happens,
   * that it is not done twice, and that an already-present script is waited on
   * rather than duplicated.
   */
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

    // Two sign-in mounts in one session — a guard bouncing someone back, say —
    // must not stack a second copy of the script on the page.
    it('does not add a second copy when one is already there', async () => {
      await (await TestBed.createComponent(SignIn)).whenStable();
      await (await TestBed.createComponent(SignIn)).whenStable();

      expect(document.querySelectorAll('#google-gis-script').length).toBe(1);
    });

    // GIS already loaded means the button can be rendered straight away, with
    // no script to wait on.
    it('renders the button immediately when GIS is already available', async () => {
      const renderButton = vi.fn();
      window.google = { accounts: { id: { initialize: vi.fn(), renderButton } } };

      const fixture = TestBed.createComponent(SignIn);
      await fixture.whenStable();

      expect(renderButton).toHaveBeenCalledTimes(1);
      expect(script()).toBeNull();
    });

    /*
     * The placeholder client id makes `initialize` throw. That must not take the
     * page down with it — the demo buttons below are the whole reason someone
     * can still work offline.
     */
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

      expect(
        (fixture.nativeElement as HTMLElement).querySelectorAll('.sign-in__account').length,
      ).toBe(3);
    });
  });
});

/*
 * The real sign-in, driven through the manual-token form — the one path in the
 * UI that reaches `signInWithGoogle` without Google Identity Services, which
 * jsdom cannot run. The credential handler behind it is the same one the GIS
 * callback invokes, so covering it here covers both.
 */
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

  function submitButton(): HTMLButtonElement {
    return host().querySelector<HTMLButtonElement>('.sign-in__submit-token-btn')!;
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

  /** Opens the paste-a-token form and enters a credential. */
  async function enterToken(token: string) {
    host().querySelector<HTMLButtonElement>('.sign-in__toggle-btn')!.click();
    await fixture.whenStable();

    const box = host().querySelector<HTMLTextAreaElement>('.sign-in__manual-textarea')!;
    box.value = token;
    box.dispatchEvent(new Event('input'));
    await fixture.whenStable();
  }

  afterEach(() => {
    http.verify();
    document.getElementById('google-gis-script')?.remove();
    delete window.google;
    delete window.__googleGisInitialized;
  });

  it('keeps the token form hidden until asked for', async () => {
    await setUp();

    expect(host().querySelector('.sign-in__manual-textarea')).toBeNull();

    host().querySelector<HTMLButtonElement>('.sign-in__toggle-btn')!.click();
    await fixture.whenStable();

    expect(host().querySelector('.sign-in__manual-textarea')).toBeTruthy();
  });

  it('will not submit an empty token', async () => {
    await setUp();
    await enterToken('   ');

    expect(submitButton().disabled).toBe(true);
  });

  it('sends the token and lands on the role’s own pages', async () => {
    await setUp();
    await enterToken('google-id-token');

    submitButton().click();
    http.expectOne(ENDPOINT).flush(RESPONSE);
    await fixture.whenStable();

    expect(auth.isSignedIn()).toBe(true);
    expect(auth.role()).toBe('judge');
    expect(router.url).toBe(ROLE_HOME.judge);
  });

  it('returns to where a guard interrupted, rather than the role’s home', async () => {
    await setUp('/sign-in?returnUrl=%2Fteam');
    await enterToken('google-id-token');

    submitButton().click();
    http.expectOne(ENDPOINT).flush(RESPONSE);
    await fixture.whenStable();

    expect(router.url).toBe('/team');
  });

  it('says so while the server is deciding', async () => {
    await setUp();
    await enterToken('google-id-token');

    submitButton().click();
    await fixture.whenStable();

    expect(host().querySelector('.sign-in__loading')).toBeTruthy();
    expect(submitButton().disabled).toBe(true);

    http.expectOne(ENDPOINT).flush(RESPONSE);
    await fixture.whenStable();
  });

  /*
   * 403 is the allowlist refusing an account that Google itself accepted. The
   * message has to reach the page — a silent failure here reads as a broken
   * button, and the person has no way to know they need to be registered.
   */
  it('shows the reason when the email is not registered', async () => {
    await setUp();
    await enterToken('google-id-token');

    submitButton().click();
    http.expectOne(ENDPOINT).flush({}, { status: 403, statusText: 'Forbidden' });
    await fixture.whenStable();

    expect(alert()!.textContent).toContain('not registered in the database');
    expect(auth.isSignedIn()).toBe(false);
    expect(router.url).toBe('/sign-in');
  });

  it('announces the failure rather than only colouring it', async () => {
    await setUp();
    await enterToken('google-id-token');

    submitButton().click();
    http.expectOne(ENDPOINT).flush({}, { status: 401, statusText: 'Unauthorized' });
    await fixture.whenStable();

    expect(alert()!.getAttribute('role')).toBe('alert');
  });

  it('stops saying it is authenticating once the attempt fails', async () => {
    await setUp();
    await enterToken('google-id-token');

    submitButton().click();
    http.expectOne(ENDPOINT).flush({}, { status: 500, statusText: 'Server Error' });
    await fixture.whenStable();

    expect(host().querySelector('.sign-in__loading')).toBeNull();
    expect(submitButton().disabled).toBe(false);
  });

  // A stale error beside a fresh attempt reads as the new attempt failing.
  it('clears a previous error when a demo account is used instead', async () => {
    await setUp();
    await enterToken('google-id-token');

    submitButton().click();
    http.expectOne(ENDPOINT).flush({}, { status: 403, statusText: 'Forbidden' });
    await fixture.whenStable();
    expect(alert()).toBeTruthy();

    host().querySelectorAll<HTMLButtonElement>('.sign-in__account')[0].click();
    await fixture.whenStable();

    expect(alert()).toBeNull();
  });

  it('shows no error before anything has been tried', async () => {
    await setUp();

    expect(alert()).toBeNull();
  });
});
