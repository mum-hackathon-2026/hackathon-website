import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { DatePipe } from '@angular/common';
import { EVENT_CONFIG, MYT_OFFSET } from '../../core/event/event-config';
import { PhaseService } from '../../core/event/phase';
import { PageHeader } from '../../layout/page-header/page-header';

type MilestoneStatus = 'past' | 'current' | 'next' | 'upcoming';

interface Milestone {
  readonly id: string;
  readonly label: string;
  readonly start: Date;
  /** Set only for milestones that span time, i.e. the judging period. */
  readonly end: Date | null;
  readonly accent: 'green' | 'blue' | 'red' | 'amber';
  readonly description: string;
  /** Extra nudge shown on deadlines people can miss. */
  readonly guidance?: string;
}

const MS_PER_DAY = 86_400_000;

@Component({
  selector: 'app-timeline',
  imports: [DatePipe, PageHeader],
  templateUrl: './timeline.html',
  styleUrl: './timeline.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Timeline {
  private readonly phaseService = inject(PhaseService);
  private readonly config = inject(EVENT_CONFIG);

  protected readonly myt = MYT_OFFSET;
  protected readonly eventName = this.config.settings.eventName;

  /**
   * Milestones are derived from the event config rather than declared here, so
   * the timeline can never drift from what the homepage counts down to.
   *
   * The judging period is the gap between submissions closing and results
   * publishing: V1 has no judging dates of its own, only a `judging_open` flag.
   */
  private readonly milestones = computed<readonly Milestone[]>(() => {
    const s = this.config.settings;
    const teamSize =
      s.minTeamSize === 1
        ? `up to ${s.maxTeamSize} members`
        : `${s.minTeamSize} to ${s.maxTeamSize} members`;

    const all: readonly (Milestone | null)[] = [
      s.registrationOpensAt && {
        id: 'registration-opens',
        label: 'Registration opens',
        start: s.registrationOpensAt,
        end: null,
        accent: 'green',
        description: `The participant portal opens and teams can register. Form a team of ${teamSize} and secure your place.`,
      },
      s.registrationClosesAt && {
        id: 'registration-closes',
        label: 'Registration closes',
        start: s.registrationClosesAt,
        end: null,
        accent: 'blue',
        description:
          'No new team registrations are accepted after this point. Teams still forming must be finalised before the deadline.',
        guidance: 'Confirm every member of your team before this date.',
      },
      s.submissionDeadlineAt && {
        id: 'submission-deadline',
        label: 'Submission deadline',
        start: s.submissionDeadlineAt,
        end: null,
        accent: 'red',
        description:
          'Your project files, repository link, demo URL and video walkthrough must all be submitted through the portal.',
        guidance:
          'The portal accepts updates right up to the deadline, so submit early and revise.',
      },
      s.submissionDeadlineAt &&
        s.resultsPublishedAt && {
          id: 'judging',
          label: 'Judging period',
          start: s.submissionDeadlineAt,
          end: s.resultsPublishedAt,
          accent: 'amber',
          description: `Judges review every submission against the published criteria — ${this.config.site.judgingCriteria
            .map((c) => c.name.toLowerCase())
            .join(', ')} — and scores are weighted and averaged across judges.`,
        },
      s.resultsPublishedAt && {
        id: 'results',
        label: 'Results announced',
        start: s.resultsPublishedAt,
        end: null,
        accent: 'green',
        description:
          'Final scores, rankings and prize-winner notifications are published to all registered participants at once.',
      },
    ];

    return all.filter((m): m is Milestone => m !== null);
  });

  /** Each milestone paired with where it sits relative to now. */
  protected readonly steps = computed(() => {
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
