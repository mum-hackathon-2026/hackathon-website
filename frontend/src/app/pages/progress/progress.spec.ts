import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AuthService, SESSION_STORAGE } from '../../core/auth/auth';
import { DEFAULT_EVENT_CONFIG, EVENT_CONFIG, EventConfig } from '../../core/event/event-config';
import {
  AFTER_RESULTS,
  DURING_JUDGING,
  DURING_REGISTRATION,
  DURING_SUBMISSION,
} from '../../core/event/event-config.testing';
import { SubmissionService } from '../../core/submission/submission';
import { TeamService } from '../../core/team/team';
import { Progress } from './progress';

interface Options {
  readonly when?: string;
  readonly settings?: Partial<EventConfig['settings']>;
  /** Sign in and join a seeded team before rendering. */
  readonly withTeam?: boolean;
  /** Submit a complete project. Implies withTeam. */
  readonly submitted?: boolean;
}

async function render({
  when = DURING_REGISTRATION,
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
    it('moves directly to submission once team is registered', async () => {
      const host = await render({ withTeam: true, when: DURING_REGISTRATION });

      expect(stageStates(host)).toEqual(['done', 'current', 'pending', 'pending', 'pending']);
      expect(currentStageLabel(host)).toBe('Project submission');
    });

    it('prompts project submission when registered', async () => {
      const host = await render({ withTeam: true, when: DURING_SUBMISSION });

      expect(stageStates(host)).toEqual(['done', 'current', 'pending', 'pending', 'pending']);
      expect(currentStageLabel(host)).toBe('Project submission');
    });

    it('advances to review once the project is submitted and judging starts', async () => {
      const host = await render({
        submitted: true,
        when: DURING_JUDGING,
        settings: { judgingOpen: true },
      });

      expect(stageStates(host)).toEqual(['done', 'done', 'current', 'pending', 'pending']);
      expect(currentStageLabel(host)).toBe('Under review');
    });

    it('reaches judging complete once scoring is closed but results are not out', async () => {
      const host = await render({
        submitted: true,
        when: DURING_JUDGING,
        settings: { judgingOpen: false },
      });

      expect(stageStates(host)).toEqual(['done', 'done', 'done', 'current', 'pending']);
      expect(currentStageLabel(host)).toBe('Judging complete');
    });

    it('completes every stage once results are published', async () => {
      const host = await render({ submitted: true, when: AFTER_RESULTS });

      expect(stageStates(host)).toEqual(['done', 'done', 'done', 'done', 'current']);
      expect(currentStageLabel(host)).toBe('Results announced');
    });

    it('does not claim a team is under review when it never submitted', async () => {
      // Judging has started, but this team has no submission.
      const host = await render({ withTeam: true, when: DURING_JUDGING });

      expect(stageStates(host)).toEqual(['done', 'current', 'pending', 'pending', 'pending']);
    });
  });

  describe('next action', () => {
    it('prompts submission immediately once team is registered', async () => {
      const host = await render({ withTeam: true, when: DURING_REGISTRATION });

      expect(host.querySelector('.action--urgent')).toBeTruthy();
      expect(actionText(host)).toContain('submit your project');
      const cta = host.querySelector<HTMLAnchorElement>('.action a');
      expect(cta?.getAttribute('href')).toBe('/participant/submission');
    });

    it('urges submitting project entry', async () => {
      const host = await render({ withTeam: true, when: DURING_SUBMISSION });

      expect(host.querySelector('.action--urgent')).toBeTruthy();
      const cta = host.querySelector<HTMLAnchorElement>('.action a');
      expect(cta?.getAttribute('href')).toBe('/participant/submission');
    });

    it('asks for nothing while judging is under way once submitted', async () => {
      const host = await render({
        submitted: true,
        when: DURING_JUDGING,
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
});
