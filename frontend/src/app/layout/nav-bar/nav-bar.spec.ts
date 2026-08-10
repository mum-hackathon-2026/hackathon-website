import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { routes as appRoutes } from '../../app.routes';
import { AuthService, SESSION_STORAGE } from '../../core/auth/auth';
import { NavBar } from './nav-bar';

@Component({ template: 'stub' })
class Stub {}

describe('NavBar', () => {
  let fixture: ComponentFixture<NavBar>;
  let auth: AuthService;

  function host(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  beforeEach(async () => {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [NavBar],
      providers: [
        { provide: SESSION_STORAGE, useValue: null },
        provideRouter([
          { path: '', component: Stub },
          { path: 'sign-in', component: Stub },
        ]),
      ],
    }).compileComponents();

    auth = TestBed.inject(AuthService);
    fixture = TestBed.createComponent(NavBar);
    await fixture.whenStable();
  });

  it('offers a sign-in link when signed out', () => {
    expect(host().querySelector('.nav__sign-in')).toBeTruthy();
    expect(host().querySelector('.nav__avatar-button')).toBeNull();
  });

  it('swaps the sign-in link for the account button once signed in', async () => {
    auth.signIn('participant');
    await fixture.whenStable();

    expect(host().querySelector('.nav__sign-in')).toBeNull();
    expect(host().querySelector('.nav__role-chip')?.textContent?.trim()).toBe('Participant');
  });

  it('only links to routes that exist', async () => {
    // A link to an unregistered path throws NG04002 when clicked, so every entry
    // in the nav must correspond to a real route. Checking against the app's own
    // route table means adding a page can never silently break this.
    const registered = new Set(
      appRoutes.map((route) => `/${route.path ?? ''}`.replace(/\/$/, '/')),
    );

    for (const role of [null, 'participant', 'judge', 'admin'] as const) {
      if (role) auth.signIn(role);
      else auth.signOut();
      await fixture.whenStable();

      const paths = Array.from(host().querySelectorAll('.nav__link')).map((a) =>
        a.getAttribute('href'),
      );
      expect(paths.length).toBeGreaterThan(0);
      for (const path of paths) {
        expect(registered, `nav links to ${path} as ${role ?? 'signed out'}`).toContain(path);
      }
    }
  });

  it('toggles the account menu and reflects it in aria-expanded', async () => {
    auth.signIn('admin');
    await fixture.whenStable();

    const trigger = host().querySelector<HTMLButtonElement>('.nav__avatar-button')!;
    expect(trigger.getAttribute('aria-expanded')).toBe('false');

    trigger.click();
    await fixture.whenStable();
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(host().querySelector('.nav__popover')).toBeTruthy();

    trigger.click();
    await fixture.whenStable();
    expect(host().querySelector('.nav__popover')).toBeNull();
  });

  it('closes the account menu on Escape', async () => {
    auth.signIn('admin');
    await fixture.whenStable();
    host().querySelector<HTMLButtonElement>('.nav__avatar-button')!.click();
    await fixture.whenStable();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await fixture.whenStable();

    expect(host().querySelector('.nav__popover')).toBeNull();
  });

  it('closes the account menu when clicking outside it', async () => {
    auth.signIn('admin');
    await fixture.whenStable();
    host().querySelector<HTMLButtonElement>('.nav__avatar-button')!.click();
    await fixture.whenStable();

    document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await fixture.whenStable();

    expect(host().querySelector('.nav__popover')).toBeNull();
  });

  it('shows the single role in the menu, with nothing to switch to', async () => {
    auth.signIn('admin');
    await fixture.whenStable();
    host().querySelector<HTMLButtonElement>('.nav__avatar-button')!.click();
    await fixture.whenStable();

    expect(host().querySelector('.profile-menu__role')?.textContent?.trim()).toBe('Administrator');
    // One role per user — the menu offers no way to become another.
    expect(host().querySelectorAll('.profile-menu button').length).toBe(1);
  });

  it('signs out from the menu', async () => {
    auth.signIn('judge');
    await fixture.whenStable();
    host().querySelector<HTMLButtonElement>('.nav__avatar-button')!.click();
    await fixture.whenStable();

    host().querySelector<HTMLButtonElement>('.profile-menu__sign-out')!.click();
    await fixture.whenStable();

    expect(auth.isSignedIn()).toBe(false);
    expect(host().querySelector('.nav__sign-in')).toBeTruthy();
  });
});
