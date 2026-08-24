import { TestBed } from '@angular/core/testing';
import { DEFAULT_EVENT_CONFIG, EVENT_CONFIG, EventConfig } from '../../core/event/event-config';
import {
  AFTER_RESULTS,
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
  return Array.from(host.querySelectorAll('.timeline__step')).map((el) =>
    el.getAttribute('data-status'),
  );
}

function labels(host: HTMLElement): string[] {
  return Array.from(host.querySelectorAll('.timeline__label')).map(
    (el) => el.textContent?.trim() ?? '',
  );
}

describe('Timeline', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('derives its milestones from the event config', async () => {
    const host = await renderAt(BEFORE_REGISTRATION);

    expect(labels(host)).toEqual([
      'Registration opens',
      'Registration closes',
      'Submission deadline',
      'Judging period',
      'Results announced',
    ]);
  });

  it('marks everything ahead of the event as upcoming, with the first one next', async () => {
    const host = await renderAt(BEFORE_REGISTRATION);

    expect(statuses(host)).toEqual(['next', 'upcoming', 'upcoming', 'upcoming', 'upcoming']);
  });

  it('settles milestones that have passed', async () => {
    // After registration closes, before the submission deadline.
    const host = await renderAt(DURING_SUBMISSION);

    expect(statuses(host)).toEqual(['past', 'past', 'next', 'upcoming', 'upcoming']);
  });

  it('shows the judging period as running once submissions close', async () => {
    // Between the submission deadline and results.
    const host = await renderAt(DURING_JUDGING);

    const steps = statuses(host);
    expect(steps[2]).toBe('past');
    expect(steps[3]).toBe('current');
  });

  it('marks every milestone past once results are out', async () => {
    const host = await renderAt(AFTER_RESULTS);

    expect(statuses(host)).toEqual(['past', 'past', 'past', 'past', 'past']);
  });

  it('omits milestones whose dates are unset', async () => {
    const host = await renderAt(BEFORE_REGISTRATION, { resultsPublishedAt: null });

    // No results date means no results milestone, and no judging period to bound.
    expect(labels(host)).toEqual([
      'Registration opens',
      'Registration closes',
      'Submission deadline',
    ]);
  });

  it('states the team size from config rather than its own copy', async () => {
    const host = await renderAt(BEFORE_REGISTRATION);

    const first = host.querySelector('.timeline__description')?.textContent ?? '';
    expect(first).toContain(
      `${DEFAULT_EVENT_CONFIG.settings.minTeamSize} to ${DEFAULT_EVENT_CONFIG.settings.maxTeamSize} members`,
    );
  });

  /**
   * The spine prints days, not times, so the zone only shows up at a day
   * boundary. Opening at 00:30 MYT is 16:30 UTC the day before, so a render
   * that ignored the offset would name the wrong day outright.
   */
  it('renders dates in MYT regardless of the local zone', async () => {
    const host = await renderAt(BEFORE_REGISTRATION, {
      registrationOpensAt: new Date('2026-09-02T00:30:00+08:00'),
    });

    const date = host.querySelector('.timeline__date')?.textContent ?? '';
    expect(date).toContain('2 Sep 2026');
    expect(date).not.toContain('1 Sep 2026');
  });
});
