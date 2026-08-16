import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { AuthService, DEMO_USERS, ROLE_LABELS, Role, SESSION_STORAGE } from '../../core/auth/auth';
import { ProfileMenu } from './profile-menu';

@Component({ template: 'stub' })
class Stub {}

describe('ProfileMenu', () => {
  let fixture: ComponentFixture<ProfileMenu>;
  let auth: AuthService;
  let router: Router;

  function host(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function text(selector: string): string | null {
    return host().querySelector(selector)?.textContent?.trim() ?? null;
  }

  function signOutButton(): HTMLButtonElement {
    return host().querySelector<HTMLButtonElement>('.profile-menu__sign-out')!;
  }

  async function setUp(role: Role = 'participant') {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [ProfileMenu],
      providers: [
        { provide: SESSION_STORAGE, useValue: null },
        provideRouter([
          { path: '', component: Stub },
          { path: 'judge/portal', component: Stub },
        ]),
      ],
    }).compileComponents();

    auth = TestBed.inject(AuthService);
    router = TestBed.inject(Router);
    auth.signIn(role);

    fixture = TestBed.createComponent(ProfileMenu);
    fixture.componentRef.setInput('user', DEMO_USERS[role]);
    await fixture.whenStable();
  }

  it('shows who is signed in', async () => {
    await setUp('participant');

    expect(text('.profile-menu__name')).toBe(DEMO_USERS.participant.name);
    expect(text('.profile-menu__email')).toBe(DEMO_USERS.participant.email);
  });

  // The nav bar's role chip is hidden on narrow screens, so this copy is the
  // only place the role appears inside the mobile drawer.
  it('names the role in words, not as the database literal', async () => {
    await setUp('admin');

    expect(text('.profile-menu__role')).toBe(ROLE_LABELS.admin);
    expect(text('.profile-menu__role')).not.toBe('admin');
  });

  it('tags the menu with the role so each gets its own accent', async () => {
    await setUp('judge');

    expect(host().querySelector('.profile-menu')!.classList.contains('role--judge')).toBe(true);
  });

  it('renders the initials as decoration beside the spelled-out name', async () => {
    await setUp('participant');

    const avatar = host().querySelector('.profile-menu__avatar')!;
    expect(avatar.textContent?.trim()).toBe(DEMO_USERS.participant.initials);
    expect(avatar.getAttribute('aria-hidden')).toBe('true');
  });

  it('clears the session when sign out is pressed', async () => {
    await setUp('participant');
    expect(auth.isSignedIn()).toBe(true);

    signOutButton().click();
    await fixture.whenStable();

    expect(auth.isSignedIn()).toBe(false);
    expect(auth.user()).toBeNull();
  });

  /*
   * Signing out from a role-gated page has to leave it: the guards read the
   * auth signal, so staying put would sit on a route the user can no longer
   * pass. Home is the one destination every role may reach.
   */
  it('returns to the home page on sign out', async () => {
    await setUp('judge');
    await router.navigateByUrl('/judge/portal');

    signOutButton().click();
    await fixture.whenStable();

    expect(router.url).toBe('/');
  });

  // The nav owns the popover and the drawer; the menu tells it to close rather
  // than closing anything itself.
  it('asks its host to dismiss it on sign out', async () => {
    await setUp('participant');
    let dismissed = 0;
    fixture.componentInstance.dismiss.subscribe(() => dismissed++);

    signOutButton().click();
    await fixture.whenStable();

    expect(dismissed).toBe(1);
  });
});
