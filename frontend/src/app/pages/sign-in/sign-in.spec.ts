import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { AuthService, ROLES, ROLE_HOME, SESSION_STORAGE } from '../../core/auth/auth';
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
});
