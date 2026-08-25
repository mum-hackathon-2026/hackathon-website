import { EVENT_SCHEDULE, SchedulePhase } from '../../core/event/event-content';
import { EventMilestone } from '../../core/event/milestones';
import { buildStops } from './track-stops';

function milestone(
  id: string,
  label: string,
  start: string,
  end: string | null = null,
): EventMilestone {
  return {
    id,
    label,
    start: new Date(start),
    end: end ? new Date(end) : null,
    accent: 'blue',
    description: `${label} description`,
  };
}

function phase(id: string, name: string, start: string, end: string | null = null): SchedulePhase {
  return {
    id,
    name,
    start: new Date(start),
    end: end ? new Date(end) : null,
    venue: null,
    summary: `${name} summary`,
  };
}

const MILESTONES: readonly EventMilestone[] = [
  milestone('registration-opens', 'Registration opens', '2026-09-01T00:00:00+08:00'),
  milestone('registration-closes', 'Registration closes', '2026-09-18T23:59:00+08:00'),
  milestone('submission-deadline', 'Submission deadline', '2026-09-22T12:00:00+08:00'),
  milestone('judging', 'Judging period', '2026-09-22T12:00:00+08:00', '2026-09-25T12:00:00+08:00'),
  milestone('results', 'Results announced', '2026-09-25T12:00:00+08:00'),
];

const BEFORE_ANYTHING = new Date('2026-08-01T00:00:00+08:00').getTime();
const AFTER_EVERYTHING = new Date('2026-10-01T00:00:00+08:00').getTime();

describe('buildStops', () => {
  it('runs in date order', () => {
    const stops = buildStops(MILESTONES, EVENT_SCHEDULE, BEFORE_ANYTHING);

    const times = stops.map((stop) => stop.start.getTime());
    expect([...times].sort((a, b) => a - b)).toEqual(times);
  });

  it('never lists the same stop twice', () => {
    const ids = buildStops(MILESTONES, EVENT_SCHEDULE, BEFORE_ANYTHING).map((stop) => stop.id);

    expect(new Set(ids).size).toBe(ids.length);
  });

  // Two stops may share an instant without being duplicates: judging starts
  // the moment submissions close. Only one such pair should exist, and both
  // halves of it are real events with different names.
  it('allows a shared instant only where one stop begins as another ends', () => {
    const stops = buildStops(MILESTONES, EVENT_SCHEDULE, BEFORE_ANYTHING);

    const shared = stops.filter(
      (stop, i) => i > 0 && stop.start.getTime() === stops[i - 1].start.getTime(),
    );

    expect(shared.map((stop) => stop.id)).toEqual(['judging']);
  });

  // The schedule restates three milestones under its own names. Showing both
  // would put "Submission" and "Submission deadline" side by side on one line.
  it('drops the schedule phases a milestone already covers', () => {
    const stops = buildStops(MILESTONES, EVENT_SCHEDULE, BEFORE_ANYTHING);
    const ids = stops.map((stop) => stop.id);

    expect(ids).not.toContain('submission');
    expect(ids).not.toContain('shortlisting');
    expect(ids).not.toContain('finalist-announcement');
    expect(ids).toContain('submission-deadline');
    expect(ids).toContain('results');
  });

  it('keeps the phases that only the schedule knows about', () => {
    const ids = buildStops(MILESTONES, EVENT_SCHEDULE, BEFORE_ANYTHING).map((stop) => stop.id);

    expect(ids).toContain('opening-ceremony');
    expect(ids).toContain('build-period');
    expect(ids).toContain('final-pitch-day');
  });

  it('gives every stop a badge and an accent', () => {
    for (const stop of buildStops(MILESTONES, EVENT_SCHEDULE, BEFORE_ANYTHING)) {
      expect(stop.kind.length).toBeGreaterThan(0);
      expect(['blue', 'red', 'green', 'amber']).toContain(stop.accent);
    }
  });

  it('carries the venue through from a phase that has one', () => {
    const stops = buildStops(MILESTONES, EVENT_SCHEDULE, BEFORE_ANYTHING);
    const finals = stops.find((stop) => stop.id === 'final-pitch-day');

    expect(finals?.venue).toBe('Plenary Theatre');
  });

  describe('where now sits', () => {
    it('marks everything upcoming before the event starts', () => {
      const stops = buildStops(MILESTONES, EVENT_SCHEDULE, BEFORE_ANYTHING);

      expect(stops[0].status).toBe('next');
      expect(stops.slice(1).every((stop) => stop.status === 'upcoming')).toBe(true);
    });

    it('marks everything past once the event is over', () => {
      const stops = buildStops(MILESTONES, EVENT_SCHEDULE, AFTER_EVERYTHING);

      expect(stops.every((stop) => stop.status === 'past')).toBe(true);
    });

    it('calls a stop current while it is running', () => {
      // Mid-build-period: started, not finished.
      const during = new Date('2026-09-20T12:00:00+08:00').getTime();
      const stops = buildStops(MILESTONES, EVENT_SCHEDULE, during);

      const current = stops.filter((stop) => stop.status === 'current');
      expect(current.length).toBe(1);
      expect(current[0].id).toBe('build-period');
    });

    // "Next" has to mean the next thing on the merged line, which is why status
    // is recomputed here rather than carried over. At midday on the 18th the
    // ceremony (18:00) comes before registration closing (23:59), so a stop the
    // milestone list does not contain is the one that must be named.
    it('names the next stop from the merged run, not the milestones alone', () => {
      const between = new Date('2026-09-18T12:00:00+08:00').getTime();
      const stops = buildStops(MILESTONES, EVENT_SCHEDULE, between);

      const next = stops.find((stop) => stop.status === 'next');
      expect(next?.id).toBe('opening-ceremony');
    });

    it('leaves exactly one stop live at any instant', () => {
      for (const at of [
        '2026-09-01T12:00:00+08:00',
        '2026-09-18T20:00:00+08:00',
        '2026-09-23T00:00:00+08:00',
        '2026-09-26T12:00:00+08:00',
      ]) {
        const stops = buildStops(MILESTONES, EVENT_SCHEDULE, new Date(at).getTime());
        const live = stops.filter((stop) => stop.status === 'current' || stop.status === 'next');
        expect(live.length).toBe(1);
      }
    });
  });

  it('copes with an empty schedule', () => {
    const stops = buildStops(MILESTONES, [], BEFORE_ANYTHING);

    expect(stops.length).toBe(MILESTONES.length);
  });

  it('copes with no milestones at all, which is a config with no dates set', () => {
    const stops = buildStops([], EVENT_SCHEDULE, BEFORE_ANYTHING);

    expect(stops.length).toBeGreaterThan(0);
    expect(stops.map((stop) => stop.id)).not.toContain('submission');
  });

  it('does not mutate what it is given', () => {
    const phases = [phase('a', 'A', '2026-09-05T00:00:00+08:00')];
    const before = [...phases];

    buildStops(MILESTONES, phases, BEFORE_ANYTHING);

    expect(phases).toEqual(before);
  });
});
