import { SchedulePhase } from '../../core/event/event-content';
import { EventMilestone, MilestoneAccent, MilestoneStatus } from '../../core/event/milestones';

/**
 * One chronological run of the event, merged from the two lists that describe
 * it, for the timeline track to render.
 *
 * The site holds the schedule twice and on purpose. `MilestoneService` derives
 * five dates from `event_settings`, and those are what the site *reacts* to —
 * the hero countdown and the progress page read them. `EVENT_SCHEDULE` is a
 * declared run of show with phases the settings row has no column for, like
 * the build period. Neither is redundant, but read end to end they overlap,
 * and a reader wants one line rather than two lists to reconcile.
 *
 * Display only. Nothing here writes back, and both sources stay exactly as
 * they are.
 */

export interface TrackStop {
  readonly id: string;
  /** Short category, for the badge: Registration, Build, Judging. */
  readonly kind: string;
  readonly label: string;
  readonly start: Date;
  /** Set only where the stop spans more than a day. */
  readonly end: Date | null;
  readonly venue: string | null;
  readonly description: string;
  /** Extra nudge, on the deadlines people miss. */
  readonly guidance: string | null;
  readonly accent: MilestoneAccent;
  readonly status: MilestoneStatus;
}

/**
 * Schedule phases that say the same thing as a milestone, and so are dropped
 * when the two lists are merged.
 *
 * `event-content.ts` names two of these itself: "the submission and finalist
 * phases restate `submissionDeadlineAt` and `resultsPublishedAt`". Shortlisting
 * is the third — it is the judging window under another name, and the
 * milestone version is the one derived from live settings rather than typed in
 * by hand.
 *
 * Matched on id rather than on dates being close together: an id changing is a
 * deliberate edit somebody makes, whereas dates drifting apart by a day would
 * silently start showing both.
 */
const RESTATED_BY_A_MILESTONE: readonly string[] = [
  'submission',
  'shortlisting',
  'finalist-announcement',
];

/** The badge each stop carries. Keyed by id, so a new stop must choose one. */
const KIND_BY_ID: Readonly<Record<string, string>> = {
  'registration-opens': 'Registration',
  'registration-closes': 'Registration',
  'opening-ceremony': 'Ceremony',
  'build-period': 'Build',
  'submission-deadline': 'Deadline',
  judging: 'Judging',
  results: 'Results',
  'final-pitch-day': 'Finals',
};

/** Schedule phases carry no accent of their own, so they are assigned one. */
const ACCENT_BY_ID: Readonly<Record<string, MilestoneAccent>> = {
  'opening-ceremony': 'blue',
  'build-period': 'green',
  'final-pitch-day': 'red',
};

const FALLBACK_KIND = 'Event';

/**
 * Merge the two lists into one ordered run, and work out where `now` sits in
 * it.
 *
 * Status is recomputed across the merged list rather than carried over from
 * `MilestoneService`: "next" means the next thing that happens, and once the
 * schedule's own phases are interleaved the answer changes.
 */
export function buildStops(
  milestones: readonly EventMilestone[],
  schedule: readonly SchedulePhase[],
  now: number,
): readonly TrackStop[] {
  const fromMilestones = milestones.map((milestone) => ({
    id: milestone.id,
    kind: KIND_BY_ID[milestone.id] ?? FALLBACK_KIND,
    label: milestone.label,
    start: milestone.start,
    end: milestone.end,
    venue: null,
    description: milestone.description,
    guidance: milestone.guidance ?? null,
    accent: milestone.accent,
  }));

  const fromSchedule = schedule
    .filter((phase) => !RESTATED_BY_A_MILESTONE.includes(phase.id))
    .map((phase) => ({
      id: phase.id,
      kind: KIND_BY_ID[phase.id] ?? FALLBACK_KIND,
      label: phase.name,
      start: phase.start,
      end: phase.end,
      venue: phase.venue,
      description: phase.summary,
      guidance: null,
      accent: ACCENT_BY_ID[phase.id] ?? 'blue',
    }));

  const ordered = [...fromMilestones, ...fromSchedule].sort(
    (a, b) => a.start.getTime() - b.start.getTime(),
  );

  // The first stop that has not finished is either running now or the next up.
  // Mirrors MilestoneService so the two cannot disagree about where we are.
  const activeIndex = ordered.findIndex((stop) => (stop.end ?? stop.start).getTime() >= now);

  return ordered.map((stop, i) => {
    let status: MilestoneStatus;
    if (activeIndex === -1 || i < activeIndex) {
      status = 'past';
    } else if (i > activeIndex) {
      status = 'upcoming';
    } else {
      status = stop.start.getTime() <= now ? 'current' : 'next';
    }
    return { ...stop, status };
  });
}
