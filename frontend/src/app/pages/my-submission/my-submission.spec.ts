import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { AuthService, SESSION_STORAGE } from '../../core/auth/auth';
import { participantGuard } from '../../core/auth/role-guard';
import { DEFAULT_EVENT_CONFIG, EVENT_CONFIG } from '../../core/event/event-config';
import {
  DURING_REGISTRATION,
  DURING_SUBMISSION,
} from '../../core/event/event-config.testing';
import { SubmissionService } from '../../core/submission/submission';
import { TeamService } from '../../core/team/team';
import { MySubmission } from './my-submission';

@Component({ template: 'stub' })
class Stub {}

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

  function formLink(): HTMLAnchorElement | null {
    return host().querySelector<HTMLAnchorElement>('app-form-link-card a');
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
        provideHttpClient(),
        provideHttpClientTesting(),
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
    expect(formLink()).toBeNull();
    expect(host().querySelector('a[href="/participant/team"]')).toBeTruthy();
  });

  it('links to the submission form immediately when user has a team', async () => {
    await setUp(DURING_REGISTRATION);

    expect(formLink()?.getAttribute('href')).toBe(
      DEFAULT_EVENT_CONFIG.site.projectSubmissionFormUrl,
    );
    expect(formLink()?.target).toBe('_blank');
    expect(text()).toContain('Not submitted');
  });

  /** The form owns the fields now; leaving a second set here would be two sources of truth. */
  it('carries no submission form of its own', async () => {
    await setUp(DURING_SUBMISSION);

    expect(host().querySelector('form')).toBeNull();
    expect(host().querySelector('input')).toBeNull();
    expect(host().querySelector('select')).toBeNull();
    expect(host().querySelector('app-confirm-dialog')).toBeNull();
  });

  it('shows nothing on file until an entry arrives', async () => {
    await setUp(DURING_SUBMISSION);

    expect(host().querySelector('.submission-showcase')).toBeNull();
  });

  it('reads back the entry once it has been imported', async () => {
    await setUp(DURING_SUBMISSION);
    await submissions.submit({
      projectTitle: 'EduPath',
      description: 'Adaptive learning.',
      githubUrl: 'https://github.com/example/edupath',
      deployedUrl: '',
      trackLabel: DEFAULT_EVENT_CONFIG.site.tracks[1],
    });
    await fixture.whenStable();

    expect(host().querySelector('.submission-showcase')).toBeTruthy();
    expect(text()).toContain('EduPath');
    expect(text()).toContain(DEFAULT_EVENT_CONFIG.site.tracks[1]);
    expect(
      host().querySelector<HTMLAnchorElement>('.deliverable-card__link')?.getAttribute('href'),
    ).toBe('https://github.com/example/edupath');
  });

  it('flips the pill to submitted and hides the submit form once submitted', async () => {
    await setUp(DURING_SUBMISSION);
    await submissions.submit({
      projectTitle: 'EduPath',
      description: '',
      githubUrl: 'https://github.com/example/edupath',
      deployedUrl: '',
      trackLabel: DEFAULT_EVENT_CONFIG.site.tracks[0],
    });
    await fixture.whenStable();

    expect(host().querySelector('.submission__pill--submitted')).toBeTruthy();
    expect(formLink()).toBeNull();
    expect(text()).toContain('Submission Finalized');
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
