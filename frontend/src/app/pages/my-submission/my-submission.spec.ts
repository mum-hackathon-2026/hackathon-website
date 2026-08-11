import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { AuthService, SESSION_STORAGE } from '../../core/auth/auth';
import { participantGuard } from '../../core/auth/role-guard';
import { DEFAULT_EVENT_CONFIG, EVENT_CONFIG } from '../../core/event/event-config';
import { SubmissionService } from '../../core/submission/submission';
import { TeamService } from '../../core/team/team';
import { MySubmission } from './my-submission';

@Component({ template: 'stub' })
class Stub {}

/** Instants chosen from the default config's dates. */
const DURING_REGISTRATION = '2026-09-23T12:00:00+08:00';
const DURING_SUBMISSION = '2026-10-01T12:00:00+08:00';
const AFTER_DEADLINE = '2026-10-12T12:00:00+08:00';

describe('MySubmission', () => {
  let fixture: ComponentFixture<MySubmission>;
  let teams: TeamService;
  let submissions: SubmissionService;
  let auth: AuthService;

  function host(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function text(): string {
    return host().textContent?.replace(/\s+/g, ' ') ?? '';
  }

  /** `now` must be set before the TestBed builds — PhaseService samples it in its constructor. */
  async function setUp(now: string, { withTeam = true } = {}) {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date(now));

    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [MySubmission],
      providers: [
        { provide: SESSION_STORAGE, useValue: null },
        { provide: EVENT_CONFIG, useValue: DEFAULT_EVENT_CONFIG },
        provideRouter([]),
      ],
    }).compileComponents();

    auth = TestBed.inject(AuthService);
    teams = TestBed.inject(TeamService);
    submissions = TestBed.inject(SubmissionService);
    auth.signIn('participant');
    if (withTeam) await teams.createTeam('Quantum Collective');

    fixture = TestBed.createComponent(MySubmission);
    await fixture.whenStable();
  }

  afterEach(() => {
    vi.useRealTimers();
  });

  it('asks for a team before anything else', async () => {
    await setUp(DURING_SUBMISSION, { withTeam: false });

    expect(text()).toContain('You need a team first');
    expect(host().querySelector('#title')).toBeNull();
    expect(host().querySelector('a[href="/participant/team"]')).toBeTruthy();
  });

  it('says submissions are not open yet during registration', async () => {
    await setUp(DURING_REGISTRATION);

    expect(host().querySelector('app-state-locked')).toBeTruthy();
    expect(text()).toContain("Submissions aren't open yet");
    expect(host().querySelector('#title')).toBeNull();
  });

  it('shows the form once the window opens', async () => {
    await setUp(DURING_SUBMISSION);

    expect(host().querySelector('#title')).toBeTruthy();
    expect(host().querySelector('#track')).toBeTruthy();
    expect(text()).toContain('Draft');
  });

  it('offers every configured track', async () => {
    await setUp(DURING_SUBMISSION);

    const options = Array.from(host().querySelectorAll<HTMLOptionElement>('#track option'))
      .map((o) => o.value)
      .filter(Boolean);
    expect(options).toEqual([...DEFAULT_EVENT_CONFIG.site.tracks]);
  });

  it('goes read-only once the deadline passes', async () => {
    await setUp(AFTER_DEADLINE);

    expect(host().querySelector('app-state-locked')).toBeTruthy();
    expect(text()).toContain('Submissions are closed');
    expect(host().querySelector('#title')).toBeNull();
  });

  it('surfaces a validation error rather than failing silently', async () => {
    await setUp(DURING_SUBMISSION);

    const github = host().querySelector<HTMLInputElement>('#github')!;
    github.value = 'github.com/no-scheme';
    github.dispatchEvent(new Event('input'));
    await fixture.whenStable();

    host().querySelector<HTMLButtonElement>('.submission__actions .button')!.click();
    await fixture.whenStable();

    expect(host().querySelector('.submission__error')?.textContent).toContain('http://');
  });

  it('confirms before submitting rather than submitting immediately', async () => {
    await setUp(DURING_SUBMISSION);

    for (const [id, value] of [
      ['#title', 'EduPath'],
      ['#github', 'https://github.com/example/edupath'],
    ] as const) {
      const field = host().querySelector<HTMLInputElement>(id)!;
      field.value = value;
      field.dispatchEvent(new Event('input'));
    }
    const track = host().querySelector<HTMLSelectElement>('#track')!;
    track.value = DEFAULT_EVENT_CONFIG.site.tracks[0];
    track.dispatchEvent(new Event('change'));
    await fixture.whenStable();

    host().querySelector<HTMLFormElement>('form')!.dispatchEvent(new Event('submit'));
    await fixture.whenStable();

    // Dialog is up, nothing submitted yet.
    expect(host().querySelector('app-confirm-dialog')).toBeTruthy();
    expect(submissions.isSubmitted()).toBe(false);

    host().querySelector<HTMLButtonElement>('dialog .button--primary')!.click();
    await fixture.whenStable();

    expect(submissions.isSubmitted()).toBe(true);
    expect(submissions.submission()!.submittedAt).toBeInstanceOf(Date);
  });

  it('loads an existing submission into the form', async () => {
    await setUp(DURING_SUBMISSION);
    await submissions.saveDraft({
      projectTitle: 'Existing work',
      description: 'From a teammate.',
      githubUrl: 'https://github.com/example/existing',
      deployedUrl: '',
      trackLabel: DEFAULT_EVENT_CONFIG.site.tracks[1],
    });
    await fixture.whenStable();

    expect(host().querySelector<HTMLInputElement>('#title')!.value).toBe('Existing work');
    expect(host().querySelector<HTMLSelectElement>('#track')!.value).toBe(
      DEFAULT_EVENT_CONFIG.site.tracks[1],
    );
  });

  it('relabels the submit button once submitted', async () => {
    await setUp(DURING_SUBMISSION);
    await submissions.submit({
      projectTitle: 'EduPath',
      description: '',
      githubUrl: 'https://github.com/example/edupath',
      deployedUrl: '',
      trackLabel: DEFAULT_EVENT_CONFIG.site.tracks[0],
    });
    await fixture.whenStable();

    expect(text()).toContain('Update submission');
    expect(text()).toContain('Submitted');
  });
});

describe('MySubmission route', () => {
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
            path: 'participant/submission',
            component: Stub,
            canActivate: [participantGuard],
          },
        ]),
      ],
    });
    router = TestBed.inject(Router);
    auth = TestBed.inject(AuthService);
  });

  it('bounces a signed-out visitor to sign-in, remembering the destination', async () => {
    await router.navigateByUrl('/participant/submission');

    expect(router.url).toBe('/sign-in?returnUrl=%2Fparticipant%2Fsubmission');
  });

  it('sends a judge home', async () => {
    auth.signIn('judge');

    await router.navigateByUrl('/participant/submission');

    expect(router.url).toBe('/');
  });

  it('lets a participant through', async () => {
    auth.signIn('participant');

    await router.navigateByUrl('/participant/submission');

    expect(router.url).toBe('/participant/submission');
  });
});
