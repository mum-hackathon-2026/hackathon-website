import { TestBed } from '@angular/core/testing';
import { EVENT_CONFIG, EventConfig } from './event-config';
import { MilestoneService } from './milestones';

const BASE: EventConfig = {
  settings: {
    eventName: 'Test Hackathon',
    registrationOpensAt: new Date('2026-09-21T09:00:00+08:00'),
    registrationClosesAt: new Date('2026-09-25T23:59:00+08:00'),
    submissionDeadlineAt: new Date('2026-10-09T23:59:00+08:00'),
    judgingOpen: false,
    resultsPublishedAt: new Date('2026-10-19T10:00:00+08:00'),
    minTeamSize: 1,
    maxTeamSize: 4,
    screeningEnabled: false,
  },
  site: {
    university: 'Monash University Malaysia',
    faculty: 'Faculty of Information Technology',
    tagline: 'tagline',
    contactEmail: 'hackathon@monash.edu',
    discordUrl: 'https://discord.gg/monashhack',
    teamRegistrationFormUrl: 'https://forms.gle/test-team-registration',
    projectSubmissionFormUrl: 'https://forms.gle/test-project-submission',
    studentEmailDomain: 'student.monash.edu',
    tracks: ['Open Innovation'],
    judgingCriteria: [
      { name: 'Innovation', weight: 60 },
      { name: 'Technical Execution', weight: 40 },
    ],
  },
};

function serviceAt(
  when: string,
  overrides: Partial<EventConfig['settings']> = {},
): MilestoneService {
  // The clock keeps advancing so Angular's scheduler can settle; every `when`
  // sits well clear of a milestone so drift cannot flip an assertion.
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date(when));

  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      {
        provide: EVENT_CONFIG,
        useValue: { ...BASE, settings: { ...BASE.settings, ...overrides } },
      },
    ],
  });
  return TestBed.inject(MilestoneService);
}

const DURING_REGISTRATION = '2026-09-23T12:00:00+08:00';

describe('MilestoneService', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  describe('the schedule', () => {
    it('derives five milestones from the event settings', () => {
      const service = serviceAt(DURING_REGISTRATION);

      expect(service.milestones().map((m) => m.id)).toEqual([
        'registration-opens',
        'registration-closes',
        'submission-deadline',
        'judging',
        'results',
      ]);
    });

    it('lists them in chronological order', () => {
      const service = serviceAt(DURING_REGISTRATION);
      const starts = service.milestones().map((m) => m.start.getTime());

      expect([...starts].sort((a, b) => a - b)).toEqual(starts);
    });

    /*
     * V1 has no judging dates of its own, only a `judging_open` flag, so the
     * judging period is inferred from the gap between the two dates it does
     * have. Losing either end must drop the milestone rather than leave a span
     * with one boundary.
     */
    it('spans the judging period from the deadline to publication', () => {
      const service = serviceAt(DURING_REGISTRATION);
      const judging = service.milestones().find((m) => m.id === 'judging')!;

      expect(judging.start).toEqual(BASE.settings.submissionDeadlineAt);
      expect(judging.end).toEqual(BASE.settings.resultsPublishedAt);
    });

    it('is the only milestone that spans time', () => {
      const service = serviceAt(DURING_REGISTRATION);
      const spanning = service.milestones().filter((m) => m.end !== null);

      expect(spanning.map((m) => m.id)).toEqual(['judging']);
    });

    it('drops a milestone whose date is not set', () => {
      const service = serviceAt(DURING_REGISTRATION, { registrationOpensAt: null });

      expect(service.milestones().map((m) => m.id)).not.toContain('registration-opens');
      expect(service.milestones().length).toBe(4);
    });

    it('drops the judging period when either end is missing', () => {
      const service = serviceAt(DURING_REGISTRATION, { resultsPublishedAt: null });

      expect(service.milestones().map((m) => m.id)).toEqual([
        'registration-opens',
        'registration-closes',
        'submission-deadline',
      ]);
    });

    it('has nothing to show when no date is set at all', () => {
      const service = serviceAt(DURING_REGISTRATION, {
        registrationOpensAt: null,
        registrationClosesAt: null,
        submissionDeadlineAt: null,
        resultsPublishedAt: null,
      });

      expect(service.milestones()).toEqual([]);
    });

    // The team-size wording is the settings read back as prose, so a change to
    // the limits must not leave the timeline describing the old ones.
    it('describes the team size from the configured limits', () => {
      const service = serviceAt(DURING_REGISTRATION, { minTeamSize: 2, maxTeamSize: 5 });
      const opens = service.milestones().find((m) => m.id === 'registration-opens')!;

      expect(opens.description).toContain('2 to 5 members');
    });

    it('says "up to" rather than "1 to" when solo teams are allowed', () => {
      const service = serviceAt(DURING_REGISTRATION, { minTeamSize: 1, maxTeamSize: 4 });
      const opens = service.milestones().find((m) => m.id === 'registration-opens')!;

      expect(opens.description).toContain('up to 4 members');
      expect(opens.description).not.toContain('1 to 4');
    });

    it('names the judging criteria the site publishes', () => {
      const service = serviceAt(DURING_REGISTRATION);
      const judging = service.milestones().find((m) => m.id === 'judging')!;

      expect(judging.description).toContain('innovation, technical execution');
    });

    // Guidance is the nudge on a deadline people can miss; not every milestone
    // has one, and the timeline only renders it where it exists.
    it('attaches guidance to the deadlines that can be missed', () => {
      const service = serviceAt(DURING_REGISTRATION);
      const withGuidance = service.milestones().filter((m) => m.guidance);

      expect(withGuidance.map((m) => m.id)).toEqual(['registration-closes', 'submission-deadline']);
    });
  });

  describe('where each milestone sits relative to now', () => {
    it('marks the first unreached milestone as next and the rest as upcoming', () => {
      const service = serviceAt('2026-09-20T12:00:00+08:00');

      expect(service.steps().map((s) => s.status)).toEqual([
        'next',
        'upcoming',
        'upcoming',
        'upcoming',
        'upcoming',
      ]);
    });

    it('marks reached milestones as past', () => {
      const service = serviceAt(DURING_REGISTRATION);

      expect(service.steps().map((s) => s.status)).toEqual([
        'past',
        'next',
        'upcoming',
        'upcoming',
        'upcoming',
      ]);
    });

    // A spanning milestone is `current` for its whole length, which a plain
    // start-time comparison would only get right on the first instant.
    it('marks a spanning milestone as current while it is running', () => {
      const service = serviceAt('2026-10-12T12:00:00+08:00');

      expect(service.steps().map((s) => s.status)).toEqual([
        'past',
        'past',
        'past',
        'current',
        'upcoming',
      ]);
    });

    it('marks everything past once the last milestone is behind us', () => {
      const service = serviceAt('2026-11-01T12:00:00+08:00');

      expect(service.steps().every((s) => s.status === 'past')).toBe(true);
    });

    /*
     * Floored whole days, matching the hero countdown. Ceil here would show one
     * more day than the homepage for the very same instant.
     */
    it('counts whole days to a milestone that has not arrived', () => {
      const service = serviceAt(DURING_REGISTRATION);
      const closes = service.steps().find((s) => s.id === 'registration-closes')!;

      expect(closes.daysAway).toBe(2);
    });

    it('counts zero days on the day itself, never a negative', () => {
      const service = serviceAt('2026-09-25T09:00:00+08:00');
      const closes = service.steps().find((s) => s.id === 'registration-closes')!;

      expect(closes.daysAway).toBe(0);
    });

    it('has no count for milestones already reached', () => {
      const service = serviceAt(DURING_REGISTRATION);
      const reached = service.steps().filter((s) => s.status === 'past' || s.status === 'current');

      expect(reached.length).toBeGreaterThan(0);
      for (const step of reached) {
        expect(step.daysAway).toBeNull();
      }
    });

    it('carries every milestone field through onto the step', () => {
      const service = serviceAt(DURING_REGISTRATION);
      const steps = service.steps();
      const milestones = service.milestones();

      expect(steps.length).toBe(milestones.length);
      steps.forEach((step, i) => {
        expect(step.id).toBe(milestones[i].id);
        expect(step.label).toBe(milestones[i].label);
        expect(step.accent).toBe(milestones[i].accent);
        expect(step.description).toBe(milestones[i].description);
      });
    });

    it('has exactly one active step while any milestone remains', () => {
      const service = serviceAt(DURING_REGISTRATION);
      const active = service.steps().filter((s) => s.status === 'current' || s.status === 'next');

      expect(active.length).toBe(1);
    });
  });
});
