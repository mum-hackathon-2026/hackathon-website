import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { AuthService, SESSION_STORAGE } from './auth';
import { adminGuard, participantGuard } from './role-guard';

@Component({ template: 'stub' })
class Stub {}

describe('roleGuard', () => {
  let router: Router;
  let auth: AuthService;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: SESSION_STORAGE, useValue: null },
        provideRouter([
          { path: '', component: Stub },
          { path: 'sign-in', component: Stub },
          { path: 'team', component: Stub, canActivate: [participantGuard] },
          { path: 'admin', component: Stub, canActivate: [adminGuard] },
        ]),
      ],
    });
    router = TestBed.inject(Router);
    auth = TestBed.inject(AuthService);
  });

  it('sends a signed-out visitor to sign-in, remembering the destination', async () => {
    await router.navigateByUrl('/team');

    expect(router.url).toBe('/sign-in?returnUrl=%2Fteam');
  });

  it('lets a holder of the role through', async () => {
    auth.signIn('participant');

    await router.navigateByUrl('/team');

    expect(router.url).toBe('/team');
  });

  it('sends a signed-in user without the role home', async () => {
    auth.signIn('participant');

    await router.navigateByUrl('/admin');

    expect(router.url).toBe('/');
  });

  it('refuses a judge an admin route', async () => {
    auth.signIn('judge');

    await router.navigateByUrl('/admin');

    // One role per user, so holding judge grants nothing else.
    expect(router.url).toBe('/');
  });
});
