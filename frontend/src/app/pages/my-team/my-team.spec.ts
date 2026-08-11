import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Component } from '@angular/core';
import { Router, provideRouter } from '@angular/router';
import { AuthService, SESSION_STORAGE } from '../../core/auth/auth';
import { DEFAULT_EVENT_CONFIG, EVENT_CONFIG, EventConfig } from '../../core/event/event-config';
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
  async function setUp(now = '2026-09-23T12:00:00+08:00') {
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

  it('offers create and join when you have no team', async () => {
    await setUp();

    expect(host().querySelector('#new-team')).toBeTruthy();
    expect(host().querySelector('#join-code')).toBeTruthy();
    expect(host().querySelector('.my-team__members')).toBeNull();
  });

  it('shows the team, join code and members once you have one', async () => {
    await setUp();
    teams.createTeam('Late Night Commits');
    await fixture.whenStable();

    expect(host().querySelector('.my-team__name')?.textContent?.trim()).toBe('Late Night Commits');
    expect(host().querySelector('.my-team__code')?.textContent?.trim()).toBe(
      teams.myTeam()!.joinCode,
    );
    expect(host().querySelectorAll('.my-team__member').length).toBe(1);
    expect(text()).toContain(`1 of ${DEFAULT_EVENT_CONFIG.settings.maxTeamSize}`);
  });

  it('surfaces the service error rather than failing silently', async () => {
    await setUp();
    const input = host().querySelector<HTMLInputElement>('#new-team')!;
    input.value = 'Quantum Leap'; // Seeded, so the name is taken.
    input.dispatchEvent(new Event('input'));
    await fixture.whenStable();

    host().querySelector<HTMLFormElement>('form')!.dispatchEvent(new Event('submit'));
    await fixture.whenStable();

    expect(host().querySelector('.my-team__error')?.textContent).toContain('taken');
  });

  it('hides leader-only actions from an ordinary member', async () => {
    await setUp();
    teams.joinTeam('QLEAP7'); // Joining does not make you the leader.
    await fixture.whenStable();

    expect(teams.isLeader()).toBe(false);
    expect(host().querySelector('.my-team__member-actions')).toBeNull();
    expect(text()).not.toContain('Rename');
    expect(text()).not.toContain('Regenerate');
  });

  it('shows leader-only actions to the leader', async () => {
    await setUp();
    teams.createTeam('Command Centre');
    await fixture.whenStable();

    expect(text()).toContain('Rename');
    expect(text()).toContain('Regenerate');
  });

  it('confirms before leaving rather than acting immediately', async () => {
    await setUp();
    teams.createTeam('Second Thoughts');
    await fixture.whenStable();

    const leave = Array.from(host().querySelectorAll<HTMLButtonElement>('button')).find(
      (b) => b.textContent?.trim() === 'Leave team',
    )!;
    leave.click();
    await fixture.whenStable();

    // Dialog is up and nothing has happened yet.
    expect(host().querySelector('app-confirm-dialog')).toBeTruthy();
    expect(teams.myTeam()).not.toBeNull();

    host().querySelector<HTMLButtonElement>('.button--primary')!.click();
    await fixture.whenStable();

    expect(teams.myTeam()).toBeNull();
  });

  it('does nothing when the confirmation is dismissed', async () => {
    await setUp();
    teams.createTeam('Still Here');
    await fixture.whenStable();

    Array.from(host().querySelectorAll<HTMLButtonElement>('button'))
      .find((b) => b.textContent?.trim() === 'Leave team')!
      .click();
    await fixture.whenStable();

    host().querySelector<HTMLDialogElement>('dialog')!.dispatchEvent(new Event('close'));
    await fixture.whenStable();

    expect(teams.myTeam()).not.toBeNull();
    expect(host().querySelector('app-confirm-dialog')).toBeNull();
  });

  it('locks once registration has closed', async () => {
    // Registration closes 25 Sep; this is after it.
    await setUp('2026-10-01T12:00:00+08:00');

    expect(host().querySelector('app-state-locked')).toBeTruthy();
    expect(host().querySelector('#new-team')).toBeNull();
    expect(text()).toContain('Registration has closed');
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
