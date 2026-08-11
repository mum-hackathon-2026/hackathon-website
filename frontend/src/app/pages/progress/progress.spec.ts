import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { AuthService, SESSION_STORAGE } from '../../core/auth/auth';
import { DEFAULT_EVENT_CONFIG, EVENT_CONFIG, EventConfig } from '../../core/event/event-config';
import { SubmissionService } from '../../core/submission/submission';
import { TeamService } from '../../core/team/team';
import { Progress, ProgressTab } from './progress';

interface Options {
  readonly when?: string;
  readonly tab?: ProgressTab;
  readonly settings?: Partial<EventConfig['settings']>;
  /** Sign in and join a seeded team before rendering. */
  readonly withTeam?: boolean;
  /** Submit a complete project. Implies withTeam. */
  readonly submitted?: boolean;
}

async function render({
  when = '2026-09-23T12:00:00+08:00',
  tab = 'team',
  settings = {},
  withTeam = false,
  submitted = false,
}: Options = {}) {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date(when));

  TestBed.resetTestingModule();
  await TestBed.configureTestingModule({
    imports: [Progress],
    providers: [
      provideRouter([]),
      { provide: SESSION_STORAGE, useValue: null },
      { provide: ActivatedRoute, useValue: { data: of({ tab }) } },
      {
        provide: EVENT_CONFIG,
        useValue: {
          ...DEFAULT_EVENT_CONFIG,
          settings: { ...DEFAULT_EVENT_CONFIG.settings, ...settings },
        },
      },
    ],
  }).compileComponents();

  if (withTeam || submitted) {
    TestBed.inject(AuthService).signIn('participant');
    const joined = await TestBed.inject(TeamService).joinTeam('QLEAP7');
    expect(joined.ok, 'test fixture should join the seeded team').toBe(true);

    if (submitted) {
      const result = await TestBed.inject(SubmissionService).submit({
        projectTitle: 'EduPath',
        description: 'A learning tool.',
        githubUrl: 'https://github.com/example/edupath',
        deployedUrl: '',
        trackLabel: DEFAULT_EVENT_CONFIG.site.tracks[0],
      });
      expect(result.ok, 'test fixture should submit').toBe(true);
    }
  }

  const fixture = TestBed.createComponent(Progress);
  await fixture.whenStable();
  return fixture.nativeElement as HTMLElement;
}

function stageStates(host: HTMLElement): (string | null)[] {
  return Array.from(host.querySelectorAll('.stages__step')).map((el) =>
    el.getAttribute('data-state'),
  );
}

function currentStageLabel(host: HTMLElement): string {
  return host.querySelector('.summary__value--accent')?.textContent?.trim() ?? '';
}

function actionText(host: HTMLElement): string {
  return host.querySelector('.action__text')?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
}

describe('Progress', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  describe('without a team', () => {
    it('explains that progress starts with a team', async () => {
      const host = await render();

      expect(host.querySelector('.empty')).toBeTruthy();
      expect(host.querySelector('.stages')).toBeNull();
    });

    it('sends them to the team page rather than showing empty stages', async () => {
      const host = await render();

      const cta = host.querySelector<HTMLAnchorElement>('.empty a');
      expect(cta?.getAttribute('href')).toBe('/participant/team');
    });
  });

  describe('stage sequence', () => {
    it('marks the team formed and waits on registration closing', async () => {
      // Registration is open on this date.
      const host = await render({ withTeam: true, when: '2026-09-23T12:00:00+08:00' });

      expect(stageStates(host)).toEqual([
        'done',
        'current',
        'pending',
        'pending',
        'pending',
        'pending',
      ]);
      expect(currentStageLabel(host)).toBe('Registration');
    });

    it('moves to submission once registration has closed', async () => {
      const host = await render({ withTeam: true, when: '2026-10-01T12:00:00+08:00' });

      expect(stageStates(host)).toEqual([
        'done',
        'done',
        'current',
        'pending',
        'pending',
        'pending',
      ]);
      expect(currentStageLabel(host)).toBe('Project submission');
    });

    it('advances to review once the project is submitted and judging starts', async () => {
      const host = await render({
        submitted: true,
        when: '2026-10-12T12:00:00+08:00',
        settings: { judgingOpen: true },
      });

      expect(stageStates(host)).toEqual(['done', 'done', 'done', 'current', 'pending', 'pending']);
      expect(currentStageLabel(host)).toBe('Under review');
    });

    it('reaches judging complete once scoring is closed but results are not out', async () => {
      const host = await render({
        submitted: true,
        when: '2026-10-12T12:00:00+08:00',
        settings: { judgingOpen: false },
      });

      expect(stageStates(host)).toEqual(['done', 'done', 'done', 'done', 'current', 'pending']);
      expect(currentStageLabel(host)).toBe('Judging complete');
    });

    it('completes every stage once results are published', async () => {
      const host = await render({ submitted: true, when: '2026-11-01T12:00:00+08:00' });

      expect(stageStates(host)).toEqual(['done', 'done', 'done', 'done', 'done', 'current']);
      expect(currentStageLabel(host)).toBe('Results announced');
    });

    it('does not claim a team is under review when it never submitted', async () => {
      // Judging has started, but this team has no submission.
      const host = await render({ withTeam: true, when: '2026-10-12T12:00:00+08:00' });

      expect(stageStates(host)).toEqual([
        'done',
        'done',
        'current',
        'pending',
        'pending',
        'pending',
      ]);
    });
  });

  describe('next action', () => {
    it('is not urgent while registration is still open', async () => {
      const host = await render({ withTeam: true, when: '2026-09-23T12:00:00+08:00' });

      expect(host.querySelector('.action--urgent')).toBeNull();
      expect(actionText(host)).toContain('Registration is still open');
    });

    it('urges submitting once the window opens', async () => {
      const host = await render({ withTeam: true, when: '2026-10-01T12:00:00+08:00' });

      expect(host.querySelector('.action--urgent')).toBeTruthy();
      const cta = host.querySelector<HTMLAnchorElement>('.action a');
      expect(cta?.getAttribute('href')).toBe('/participant/submission');
    });

    it('says plainly when the deadline passed with nothing submitted', async () => {
      const host = await render({ withTeam: true, when: '2026-10-12T12:00:00+08:00' });

      expect(host.querySelector('.action--urgent')).toBeTruthy();
      expect(actionText(host)).toContain('deadline has passed');
      // Nothing to click — the window has closed.
      expect(host.querySelector('.action a')).toBeNull();
    });

    it('asks for nothing while judging is under way', async () => {
      const host = await render({
        submitted: true,
        when: '2026-10-12T12:00:00+08:00',
        settings: { judgingOpen: true },
      });

      expect(host.querySelector('.action--urgent')).toBeNull();
      expect(actionText(host)).toContain('Nothing is needed');
    });
  });

  describe('team card', () => {
    it('names the team and its members', async () => {
      const host = await render({ withTeam: true });

      expect(host.querySelector('.team-card__name')?.textContent?.trim()).toBe('Quantum Leap');
      expect(host.querySelectorAll('.team-card__member').length).toBeGreaterThan(0);
    });

    it('links through to the team page', async () => {
      const host = await render({ withTeam: true });

      const link = host.querySelector<HTMLAnchorElement>('.team-card a');
      expect(link?.getAttribute('href')).toBe('/participant/team');
    });
  });

  describe('tabs', () => {
    it('shows the stage spine on the team tab', async () => {
      const host = await render({ withTeam: true, tab: 'team' });

      expect(host.querySelector('.stages')).toBeTruthy();
      expect(host.querySelector('.timeline')).toBeNull();
    });

    it('shows the shared event timeline on the event tab', async () => {
      const host = await render({ withTeam: true, tab: 'event' });

      expect(host.querySelector('.timeline')).toBeTruthy();
      expect(host.querySelector('.stages')).toBeNull();
    });

    it('offers the event timeline even to someone with no team', async () => {
      const host = await render({ tab: 'event' });

      expect(host.querySelector('.timeline')).toBeTruthy();
      expect(host.querySelector('.empty')).toBeNull();
    });

    it('links both tabs to real routes', async () => {
      const host = await render({ withTeam: true });

      const hrefs = Array.from(host.querySelectorAll<HTMLAnchorElement>('.tabs__tab')).map((a) =>
        a.getAttribute('href'),
      );
      expect(hrefs).toEqual(['/participant/progress/team', '/participant/progress/event']);
    });
  });
});
