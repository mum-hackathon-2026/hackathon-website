import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { EVENT_CONFIG } from './event-config';

/**
 * Where the event currently is, derived from the configured dates.
 *
 * These are the timeline states the public site cares about. Note `judgingOpen`
 * is a *separate* concern: V1 models it as a boolean an admin flips to let
 * judges score, not as a date window, so it is exposed on its own rather than
 * folded into this sequence.
 */
export type EventPhase =
  | 'before-registration'
  | 'registration'
  | 'submission'
  /** Submissions closed, results not yet published. */
  | 'judging'
  | 'results';

export interface Milestone {
  readonly label: string;
  readonly at: Date;
}

const TICK_MS = 1000;

@Injectable({ providedIn: 'root' })
export class PhaseService {
  private readonly config = inject(EVENT_CONFIG);

  private readonly clock = signal(Date.now());

  /**
   * Ticks once a second so countdowns re-render. Exposed so pages that lay out
   * their own view of the schedule share one clock rather than starting another.
   */
  readonly now = this.clock.asReadonly();

  readonly phase = computed<EventPhase>(() => {
    const { registrationOpensAt, registrationClosesAt, submissionDeadlineAt, resultsPublishedAt } =
      this.config.settings;
    const now = this.now();

    // Latest milestone reached wins, so a null date simply defers to the one before it.
    if (resultsPublishedAt && now >= resultsPublishedAt.getTime()) return 'results';
    if (submissionDeadlineAt && now >= submissionDeadlineAt.getTime()) return 'judging';
    if (registrationClosesAt && now >= registrationClosesAt.getTime()) return 'submission';
    if (registrationOpensAt && now >= registrationOpensAt.getTime()) return 'registration';
    return 'before-registration';
  });

  /** Whether judges may score right now. Admin-controlled, independent of the timeline. */
  readonly judgingOpen = computed(() => this.config.settings.judgingOpen);

  readonly nextMilestone = computed<Milestone | null>(() => {
    const { registrationOpensAt, registrationClosesAt, submissionDeadlineAt, resultsPublishedAt } =
      this.config.settings;

    switch (this.phase()) {
      case 'before-registration':
        return milestone('Registration opens', registrationOpensAt);
      case 'registration':
        return milestone('Registration closes', registrationClosesAt);
      case 'submission':
        return milestone('Submissions close', submissionDeadlineAt);
      case 'judging':
        return milestone('Results announced', resultsPublishedAt);
      case 'results':
        return null; // Nothing left to count down to.
    }
  });

  /** Milliseconds until the next milestone, or null when there isn't one. */
  readonly remainingMs = computed<number | null>(() => {
    const next = this.nextMilestone();
    return next ? Math.max(0, next.at.getTime() - this.now()) : null;
  });

  constructor() {
    const ticker = setInterval(() => this.clock.set(Date.now()), TICK_MS);
    inject(DestroyRef).onDestroy(() => clearInterval(ticker));
  }
}

function milestone(label: string, at: Date | null): Milestone | null {
  return at ? { label, at } : null;
}
