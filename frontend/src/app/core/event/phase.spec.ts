import { TestBed } from '@angular/core/testing';
import { EVENT_CONFIG, EventConfig } from './event-config';
import { PhaseService } from './phase';

const BASE: EventConfig = {
  settings: {
    eventName: 'Test Hackathon',
    registrationOpensAt: new Date('2026-09-21T09:00:00+08:00'),
    registrationClosesAt: new Date('2026-09-25T23:59:00+08:00'),
    submissionDeadlineAt: new Date('2026-10-09T23:59:00+08:00'),
    judgingOpen: false,
    resultsPublishedAt: new Date('2026-10-19T10:00:00+08:00'),
    minTeamSize: 2,
    maxTeamSize: 5,
    screeningEnabled: false,
    judgesPerTeam: 3,
  },
  site: {
    university: 'Monash University Malaysia',
    organisedBy: 'Faculty of Information Technology',
    tagline: 'tagline',
    contactEmail: 'hackathon@monash.edu',
    discordUrl: 'https://discord.gg/monashhack',
    teamRegistrationFormUrl: 'https://forms.gle/test-team-registration',
    projectSubmissionFormUrl: 'https://forms.gle/test-project-submission',
    studentEmailDomain: 'student.monash.edu',
    tracks: ['Open Innovation'],
    judgingCriteria: [{ name: 'Innovation', weight: 100 }],
  },
};

function serviceAt(when: string, overrides: Partial<EventConfig['settings']> = {}): PhaseService {
  // The clock keeps advancing so Angular's scheduler can settle; every `when`
  // below sits well clear of a boundary so that drift can't flip an assertion.
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
  return TestBed.inject(PhaseService);
}

describe('PhaseService', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('is before registration until it opens', () => {
    const phase = serviceAt('2026-09-20T12:00:00+08:00');
    expect(phase.phase()).toBe('before-registration');
    expect(phase.nextMilestone()?.label).toBe('Registration opens');
  });

  it('is in registration between open and close', () => {
    const phase = serviceAt('2026-09-23T12:00:00+08:00');
    expect(phase.phase()).toBe('registration');
    expect(phase.nextMilestone()?.label).toBe('Problem statement release');
  });

  it('moves to submission once registration closes', () => {
    const phase = serviceAt('2026-09-30T12:00:00+08:00');
    expect(phase.phase()).toBe('submission');
    expect(phase.nextMilestone()?.label).toBe('Submissions close');
  });

  it('moves to judging once the submission deadline passes', () => {
    const phase = serviceAt('2026-10-12T12:00:00+08:00');
    expect(phase.phase()).toBe('judging');
    expect(phase.nextMilestone()?.label).toBe('Preliminary results');
  });

  it('moves to results once they are published', () => {
    const phase = serviceAt('2026-10-25T12:00:00+08:00');
    expect(phase.phase()).toBe('results');
    // Nothing left to count down to.
    expect(phase.nextMilestone()).toBeNull();
    expect(phase.remainingMs()).toBeNull();
  });

  it('treats judgingOpen as independent of the timeline', () => {
    // Still mid-registration, but an admin has already opened judging.
    const phase = serviceAt('2026-09-23T12:00:00+08:00', { judgingOpen: true });
    expect(phase.phase()).toBe('registration');
    expect(phase.judgingOpen()).toBe(true);

    expect(serviceAt('2026-09-23T12:00:00+08:00').judgingOpen()).toBe(false);
  });

  it('interprets dates as MYT, not the local zone', () => {
    // 2026-09-21T09:00+08:00 is 01:00 UTC. An hour before that is still
    // before registration; a UTC+11 reading would already have opened it.
    expect(serviceAt('2026-09-21T00:00:00Z').phase()).toBe('before-registration');
    expect(serviceAt('2026-09-21T02:00:00Z').phase()).toBe('registration');
  });

  it('counts down to the next milestone', () => {
    // Two hours before registration opens.
    const phase = serviceAt('2026-09-21T07:00:00+08:00');
    const remaining = phase.remainingMs();
    expect(remaining).not.toBeNull();
    expect(Math.round(remaining! / 60_000)).toBe(120);
  });

  it('falls back to the previous milestone when a date is unset', () => {
    const phase = serviceAt('2026-10-25T12:00:00+08:00', { resultsPublishedAt: null });
    // Results never published, so it stays in judging rather than jumping ahead.
    expect(phase.phase()).toBe('judging');
    expect(phase.nextMilestone()).toBeNull();
  });
});
