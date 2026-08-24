import { Injectable, computed, inject } from '@angular/core';
import { EventSettingsService } from './event-settings';
import { EVENT_CONFIG } from './event-config';
import { PhaseService } from './phase';

/**
 * The event schedule as a list of milestones, each tagged with where it sits
 * relative to now.
 *
 * Derived from the event settings rather than declared, so the timeline page and the
 * participant progress page can never drift from what the homepage counts down
 * to. Both render this through `app-event-timeline`.
 */

export type MilestoneAccent = 'green' | 'blue' | 'red' | 'amber';

export type MilestoneStatus = 'past' | 'current' | 'next' | 'upcoming';

export interface EventMilestone {
  readonly id: string;
  readonly label: string;
  readonly start: Date;
  /** Set only for milestones that span time, i.e. the judging period. */
  readonly end: Date | null;
  readonly accent: MilestoneAccent;
  readonly description: string;
  /** Extra nudge shown on deadlines people can miss. */
  readonly guidance?: string;
}

export interface MilestoneStep extends EventMilestone {
  readonly status: MilestoneStatus;
  /** Whole days until this starts, or null once it has been reached. */
  readonly daysAway: number | null;
}

const MS_PER_DAY = 86_400_000;

@Injectable({ providedIn: 'root' })
export class MilestoneService {
  private readonly phaseService = inject(PhaseService);
  private readonly settings = inject(EventSettingsService);
  private readonly config = inject(EVENT_CONFIG);

  /**
   * The judging period is the gap between submissions closing and results
   * publishing: V1 has no judging dates of its own, only a `judging_open` flag.
   */
  readonly milestones = computed<readonly EventMilestone[]>(() => {
    const s = this.settings.settings();
    const teamSize =
      s.minTeamSize === 1
        ? `up to ${s.maxTeamSize} members`
        : `${s.minTeamSize} to ${s.maxTeamSize} members`;

    const all: readonly (EventMilestone | null)[] = [
      s.registrationOpensAt && {
        id: 'registration-opens',
        label: 'Registration opens',
        start: s.registrationOpensAt,
        end: null,
        accent: 'green',
        description: `The participant portal opens and teams can register. Get a team of ${teamSize} together and put your entry in.`,
      },
      s.registrationClosesAt && {
        id: 'registration-closes',
        label: 'Registration closes',
        start: s.registrationClosesAt,
        end: null,
        accent: 'blue',
        description:
          'No new team registrations are accepted after this point. If your team is still coming together, settle it before the deadline.',
        guidance: 'Confirm every member of your team before this date.',
      },
      s.submissionDeadlineAt && {
        id: 'submission-deadline',
        label: 'Submission deadline',
        start: s.submissionDeadlineAt,
        end: null,
        accent: 'red',
        description:
          'Send your repository link, project brief, video demo and demo URL through the submission form.',
        guidance: 'The form accepts updates right up to the deadline, so submit early and revise.',
      },
      s.submissionDeadlineAt &&
        s.resultsPublishedAt && {
          id: 'judging',
          label: 'Judging period',
          start: s.submissionDeadlineAt,
          end: s.resultsPublishedAt,
          accent: 'amber',
          description: `Judges score every submission against the published criteria (${this.config.site.judgingCriteria
            .map((c) => c.name.toLowerCase())
            .join(', ')}). Scores are weighted, then averaged across judges.`,
        },
      s.resultsPublishedAt && {
        id: 'results',
        label: 'Results announced',
        start: s.resultsPublishedAt,
        end: null,
        accent: 'green',
        description:
          'Scores, rankings and prize winners go out to everyone who registered, all at the same time.',
      },
    ];

    return all.filter((m): m is EventMilestone => m !== null);
  });

  /** Each milestone paired with where it sits relative to now. */
  readonly steps = computed<readonly MilestoneStep[]>(() => {
    const now = this.phaseService.now();
    const milestones = this.milestones();

    // The first milestone that hasn't finished is either running or the next up.
    const activeIndex = milestones.findIndex((m) => (m.end ?? m.start).getTime() >= now);

    return milestones.map((milestone, i) => {
      let status: MilestoneStatus;
      if (i < activeIndex || activeIndex === -1) {
        status = 'past';
      } else if (i > activeIndex) {
        status = 'upcoming';
      } else {
        status = milestone.start.getTime() <= now ? 'current' : 'next';
      }

      // Whole days only, matching the hero countdown — ceil here would show 42
      // where the homepage shows 41 for the very same instant.
      const daysAway =
        status === 'next' || status === 'upcoming'
          ? Math.max(0, Math.floor((milestone.start.getTime() - now) / MS_PER_DAY))
          : null;

      return { ...milestone, status, daysAway };
    });
  });
}
