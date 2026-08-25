import { TestBed } from '@angular/core/testing';
import { DEFAULT_EVENT_CONFIG, EVENT_CONFIG, EventConfig } from '../../core/event/event-config';
import {
  BEFORE_REGISTRATION,
  DURING_JUDGING,
  DURING_SUBMISSION,
} from '../../core/event/event-config.testing';
import { Timeline } from './timeline';

async function renderAt(when: string, overrides: Partial<EventConfig['settings']> = {}) {
  // Clock keeps advancing so Angular's scheduler settles; every `when` sits well
  // clear of a boundary so drift can't flip an assertion.
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date(when));

  TestBed.resetTestingModule();
  await TestBed.configureTestingModule({
    imports: [Timeline],
    providers: [
      {
        provide: EVENT_CONFIG,
        useValue: {
          ...DEFAULT_EVENT_CONFIG,
          settings: { ...DEFAULT_EVENT_CONFIG.settings, ...overrides },
        },
      },
    ],
  }).compileComponents();

  const fixture = TestBed.createComponent(Timeline);
  await fixture.whenStable();
  return fixture.nativeElement as HTMLElement;
}

function statuses(host: HTMLElement): (string | null)[] {
  return Array.from(host.querySelectorAll('.track__stop')).map((el) =>
    el.getAttribute('data-status'),
  );
}

function labels(host: HTMLElement): string[] {
  return Array.from(host.querySelectorAll('.track__title')).map(
    (el) => el.textContent?.trim() ?? '',
  );
}

/** Well past the last thing on the schedule, which is Final Pitch Day. */
const AFTER_THE_EVENT = '2026-10-05T12:00:00+08:00';

describe('Timeline', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  // The page shows one run of the event, merged from the milestones the
  // settings row drives and the phases only the declared schedule knows.
  it('runs the milestones and the schedule phases as one list', async () => {
    const host = await renderAt(BEFORE_REGISTRATION);

    expect(labels(host)).toEqual([
      'Registration opens',
      'Registration closes',
      'Opening Ceremony',
      'Build Period',
      'Submission deadline',
      'Judging period',
      'Results announced',
      'Final Pitch Day',
    ]);
  });

  it('marks everything ahead of the event as upcoming, with the first one next', async () => {
    const host = await renderAt(BEFORE_REGISTRATION);

    expect(statuses(host)[0]).toBe('next');
    expect(
      statuses(host)
        .slice(1)
        .every((status) => status === 'upcoming'),
    ).toBe(true);
  });

  it('settles the stops that have passed', async () => {
    // Registration has closed and the build period is running.
    const host = await renderAt(DURING_SUBMISSION);
    const steps = statuses(host);

    expect(steps.slice(0, 3)).toEqual(['past', 'past', 'past']);
    expect(labels(host)[3]).toBe('Build Period');
    expect(steps[3]).toBe('current');
  });

  it('shows the judging period as running once submissions close', async () => {
    const host = await renderAt(DURING_JUDGING);

    const index = labels(host).indexOf('Judging period');
    expect(statuses(host)[index]).toBe('current');
  });

  it('marks every stop past once the whole event is over', async () => {
    const host = await renderAt(AFTER_THE_EVENT);

    expect(statuses(host).every((status) => status === 'past')).toBe(true);
  });

  // Results are published the day before the final pitch, so the schedule
  // deliberately outlives the last milestone. The page has to keep going.
  it('keeps running after the last milestone, because the schedule does', async () => {
    const host = await renderAt('2026-09-26T12:00:00+08:00');

    const index = labels(host).indexOf('Final Pitch Day');
    expect(statuses(host)[index]).toBe('current');
  });

  it('omits milestones whose dates are unset, keeping the schedule phases', async () => {
    const host = await renderAt(BEFORE_REGISTRATION, { resultsPublishedAt: null });

    // No results date means no results milestone, and no judging period to
    // bound. The declared phases do not depend on the settings row at all.
    expect(labels(host)).toEqual([
      'Registration opens',
      'Registration closes',
      'Opening Ceremony',
      'Build Period',
      'Submission deadline',
      'Final Pitch Day',
    ]);
  });

  it('gives every stop a category badge', async () => {
    const host = await renderAt(BEFORE_REGISTRATION);

    const badges = Array.from(host.querySelectorAll('.track__badge'));
    expect(badges.length).toBe(labels(host).length);
    expect(badges.every((el) => (el.textContent?.trim().length ?? 0) > 0)).toBe(true);
  });

  it('states the team size from config rather than its own copy', async () => {
    const host = await renderAt(BEFORE_REGISTRATION);

    const first = host.querySelector('.track__summary')?.textContent ?? '';
    // Branches as `MilestoneService` does: "up to N" only reads correctly when
    // one person is a legal team, which V6 ended.
    const { minTeamSize, maxTeamSize } = DEFAULT_EVENT_CONFIG.settings;
    expect(first).toContain(
      minTeamSize === 1
        ? `up to ${maxTeamSize} members`
        : `${minTeamSize} to ${maxTeamSize} members`,
    );
  });

  /**
   * The track prints days, not times, so the zone only shows up at a day
   * boundary. Opening at 00:30 MYT is 16:30 UTC the day before, so a render
   * that ignored the offset would name the wrong day outright.
   */
  it('renders dates in MYT regardless of the local zone', async () => {
    const host = await renderAt(BEFORE_REGISTRATION, {
      registrationOpensAt: new Date('2026-09-02T00:30:00+08:00'),
    });

    const date = host.querySelector('.track__when')?.textContent ?? '';
    expect(date).toContain('2 Sep');
    expect(date).not.toContain('1 Sep');
  });
});
