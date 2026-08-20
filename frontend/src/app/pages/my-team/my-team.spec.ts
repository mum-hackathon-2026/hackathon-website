import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Component } from '@angular/core';
import { Router, provideRouter } from '@angular/router';
import { AuthService, SESSION_STORAGE } from '../../core/auth/auth';
import { DEFAULT_EVENT_CONFIG, EVENT_CONFIG, EventConfig } from '../../core/event/event-config';
import { DURING_REGISTRATION, DURING_SUBMISSION } from '../../core/event/event-config.testing';
import { TeamService } from '../../core/team/team';
import { participantGuard } from '../../core/auth/role-guard';
import { MyTeam } from './my-team';

@Component({ template: 'stub' })
class Stub {}

function configWith(overrides: Partial<EventConfig['settings']> = {}): EventConfig {
  return {
    ...DEFAULT_EVENT_CONFIG,
    settings: { ...DEFAULT_EVENT_CONFIG.settings, ...overrides },
  };
}

describe('MyTeam', () => {
  let fixture: ComponentFixture<MyTeam>;
  let teams: TeamService;
  let auth: AuthService;

  function host(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function text(): string {
    return host().textContent?.replace(/\s+/g, ' ') ?? '';
  }

  /**
   * `now` has to be set before the TestBed is built: PhaseService samples the
   * clock in its constructor, so moving the system time afterwards would not
   * reach it until its next tick.
   */
  async function setUp(now = DURING_REGISTRATION) {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date(now));

    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [MyTeam],
      providers: [
        { provide: SESSION_STORAGE, useValue: null },
        { provide: EVENT_CONFIG, useValue: configWith() },
        provideRouter([]),
      ],
    }).compileComponents();

    auth = TestBed.inject(AuthService);
    teams = TestBed.inject(TeamService);
    auth.signIn('participant');

    fixture = TestBed.createComponent(MyTeam);
    await fixture.whenStable();
  }

  afterEach(() => {
    vi.useRealTimers();
  });

  it('sends you to the registration form when you have no team', async () => {
    await setUp();

    const link = host().querySelector<HTMLAnchorElement>('app-form-link-card a')!;
    expect(link.getAttribute('href')).toBe(DEFAULT_EVENT_CONFIG.site.teamRegistrationFormUrl);
    expect(link.target).toBe('_blank');
    expect(host().querySelector('.my-team__members')).toBeNull();
  });

  it('shows the team and its members once you have one', async () => {
    await setUp();
    await teams.createTeam('Late Night Commits');
    await fixture.whenStable();

    expect(host().querySelector('.my-team__name')?.textContent?.trim()).toBe('Late Night Commits');
    expect(host().querySelectorAll('.my-team__member').length).toBe(1);
    expect(text()).toContain(`1 of ${DEFAULT_EVENT_CONFIG.settings.maxTeamSize}`);
    // Registered already — no reason to offer the form again.
    expect(host().querySelector('app-form-link-card')).toBeNull();
  });

  it('marks which member is you and which is the leader', async () => {
    await setUp();
    await teams.createTeam('Command Centre');
    await fixture.whenStable();

    expect(host().querySelector('.my-team__you')).toBeTruthy();
    expect(host().querySelector('.my-team__leader')).toBeTruthy();
  });

  /**
   * The form owns the team, so the page must not imply otherwise. These are the
   * controls that used to be here and would be lies if they came back.
   */
  it('offers no way to change the team from the page', async () => {
    await setUp();
    await teams.createTeam('Read Only');
    await fixture.whenStable();

    for (const gone of ['Rename', 'Regenerate', 'Leave team', 'Make leader', 'Remove']) {
      expect(text()).not.toContain(gone);
    }
    expect(host().querySelector('app-confirm-dialog')).toBeNull();
    expect(host().querySelector('input')).toBeNull();
  });

  it('shows no join code, because teams are registered whole', async () => {
    await setUp();
    await teams.createTeam('No Codes Here');
    await fixture.whenStable();

    expect(host().querySelector('.my-team__code')).toBeNull();
    expect(text()).not.toContain(teams.myTeam()!.joinCode);
  });

  it('locks once registration has closed', async () => {
    // Registration closes 25 Sep; this is after it.
    await setUp(DURING_SUBMISSION);

    expect(host().querySelector('app-state-locked')).toBeTruthy();
    expect(host().querySelector('app-form-link-card')).toBeNull();
    expect(text()).toContain('Registration is closed');
  });

  it('summarises the team inside the locked state', async () => {
    await setUp();
    await teams.createTeam('Locked Out');
    await fixture.whenStable();

    // Move past the close date; the shared clock ticks once a second.
    vi.setSystemTime(new Date(DURING_SUBMISSION));
    await vi.advanceTimersByTimeAsync(1100);
    await fixture.whenStable();

    expect(host().querySelector('.my-team__locked-summary')?.textContent).toContain('Locked Out');
    expect(host().querySelector('.my-team__locked-summary')?.textContent).toContain('1 member');
  });
});

describe('MyTeam route', () => {
  @Component({ template: 'my team' })
  class MyTeamStub {}

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
          {
            path: 'participant/team',
            component: MyTeamStub,
            canActivate: [participantGuard],
          },
        ]),
      ],
    });
    router = TestBed.inject(Router);
    auth = TestBed.inject(AuthService);
  });

  it('bounces a signed-out visitor to sign-in, remembering the destination', async () => {
    await router.navigateByUrl('/participant/team');

    expect(router.url).toBe('/sign-in?returnUrl=%2Fparticipant%2Fteam');
  });

  it('sends a judge home', async () => {
    auth.signIn('judge');

    await router.navigateByUrl('/participant/team');

    expect(router.url).toBe('/');
  });

  it('lets a participant through', async () => {
    auth.signIn('participant');

    await router.navigateByUrl('/participant/team');

    expect(router.url).toBe('/participant/team');
  });
});
