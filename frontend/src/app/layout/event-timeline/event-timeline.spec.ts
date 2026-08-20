import { ComponentFixture, TestBed } from '@angular/core/testing';
import { EVENT_CONFIG, EventConfig } from '../../core/event/event-config';
import { MilestoneService } from '../../core/event/milestones';
import { EventTimeline } from './event-timeline';

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

describe('EventTimeline', () => {
  let fixture: ComponentFixture<EventTimeline>;

  function host(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function steps(): HTMLElement[] {
    return Array.from(host().querySelectorAll<HTMLElement>('.timeline__step'));
  }

  function statuses(): (string | null)[] {
    return steps().map((step) => step.getAttribute('data-status'));
  }

  function pill(index: number): string | null {
    return steps()[index].querySelector('.timeline__pill')?.textContent?.trim() ?? null;
  }

  async function renderAt(when: string, overrides: Partial<EventConfig['settings']> = {}) {
    // The clock keeps advancing so Angular's scheduler can settle; every `when`
    // below sits well clear of a milestone so drift cannot flip an assertion.
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date(when));

    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [EventTimeline],
      providers: [
        {
          provide: EVENT_CONFIG,
          useValue: { ...BASE, settings: { ...BASE.settings, ...overrides } },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(EventTimeline);
    await fixture.whenStable();
  }

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders one step per milestone, in schedule order', async () => {
    await renderAt('2026-09-23T12:00:00+08:00');
    const labels = steps().map((step) =>
      step.querySelector('.timeline__label')!.textContent!.trim(),
    );

    expect(labels).toEqual([
      'Registration opens',
      'Registration closes',
      'Submission deadline',
      'Judging period',
      'Results announced',
    ]);
  });

  it('marks what has passed, what is next and what is still upcoming', async () => {
    await renderAt('2026-09-23T12:00:00+08:00');

    expect(statuses()).toEqual(['past', 'next', 'upcoming', 'upcoming', 'upcoming']);
  });

  it('marks a milestone that spans time as happening now', async () => {
    await renderAt('2026-10-12T12:00:00+08:00');

    expect(statuses()).toEqual(['past', 'past', 'past', 'current', 'upcoming']);
    expect(pill(3)).toBe('Happening now');
  });

  it('marks everything past once the last milestone is behind us', async () => {
    await renderAt('2026-11-01T12:00:00+08:00');

    expect(statuses()).toEqual(['past', 'past', 'past', 'past', 'past']);
  });

  /*
   * Whole days, floored — the hero countdown floors too, and ceil here would
   * show "In 3 days" where the homepage says 2 for the very same instant.
   */
  it('counts whole days to the next milestone', async () => {
    await renderAt('2026-09-23T12:00:00+08:00');

    expect(pill(1)).toBe('In 2 days');
  });

  it('says "Today" rather than "In 0 days" on the day itself', async () => {
    await renderAt('2026-09-25T09:00:00+08:00');

    expect(pill(1)).toBe('Today');
  });

  it('labels a finished milestone as done and ticks it', async () => {
    await renderAt('2026-09-23T12:00:00+08:00');

    expect(pill(0)).toBe('Done');
    expect(steps()[0].querySelector('.timeline__tick')).toBeTruthy();
    expect(steps()[1].querySelector('.timeline__tick')).toBeNull();
  });

  // Only the active milestone carries a pill; labelling every future step
  // would drown the one that matters.
  it('leaves upcoming steps unpilled', async () => {
    await renderAt('2026-09-23T12:00:00+08:00');

    expect(pill(2)).toBeNull();
    expect(pill(4)).toBeNull();
  });

  it('renders dates in Malaysian time whatever the reader’s locale', async () => {
    await renderAt('2026-09-23T12:00:00+08:00');
    const date = steps()[0].querySelector('.timeline__date')!.textContent!;

    expect(date).toContain('21 Sep 2026');
    expect(date).toContain('MYT');
  });

  /**
   * The spine gives the shape of the schedule, not the clock. Pages that hang
   * on an exact instant — the submission deadline on My Submission, the hero
   * countdown — still print the time; this does not.
   */
  it('states the day without a time of day', async () => {
    await renderAt('2026-09-23T12:00:00+08:00');

    for (const step of steps()) {
      expect(step.querySelector('.timeline__date')!.textContent).not.toMatch(/\d{1,2}:\d{2}/);
    }
  });

  it('renders a span as a range and a point in time as one date', async () => {
    await renderAt('2026-09-23T12:00:00+08:00');

    expect(steps()[3].querySelector('.timeline__date')!.textContent).toContain('19 Oct 2026');
    expect(steps()[0].querySelector('.timeline__date')!.textContent).not.toContain('—');
  });

  it('drops the connector after the last step', async () => {
    await renderAt('2026-09-23T12:00:00+08:00');
    const connectors = steps().map((step) => step.querySelector('.timeline__connector') !== null);

    expect(connectors).toEqual([true, true, true, true, false]);
  });

  // Guidance is a nudge about something you can still act on. Once the date has
  // passed it is advice about the past.
  it('shows guidance only while the milestone is still ahead', async () => {
    await renderAt('2026-09-23T12:00:00+08:00');
    expect(steps()[1].querySelector('.timeline__guidance')).toBeTruthy();

    await renderAt('2026-10-12T12:00:00+08:00');
    expect(steps()[1].querySelector('.timeline__guidance')).toBeNull();
  });

  // A null date drops its milestone rather than rendering an empty step, so the
  // timeline shortens to whatever the settings actually pin down.
  it('omits a milestone whose date is not set', async () => {
    await renderAt('2026-09-23T12:00:00+08:00', { registrationOpensAt: null });
    const service = TestBed.inject(MilestoneService);

    expect(steps().length).toBe(service.milestones().length);
    expect(host().textContent).not.toContain('Registration opens');
  });

  it('takes its accent from the milestone so the colours match the schedule', async () => {
    await renderAt('2026-09-23T12:00:00+08:00');
    const service = TestBed.inject(MilestoneService);

    steps().forEach((step, i) => {
      expect(step.classList.contains(`timeline__step--${service.milestones()[i].accent}`)).toBe(
        true,
      );
    });
  });
});
