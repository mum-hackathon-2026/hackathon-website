import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { EVENT_CONFIG, MYT_OFFSET } from '../../core/event/event-config';
import { PhaseService } from '../../core/event/phase';
import { SubmissionService } from '../../core/submission/submission';
import { TeamService } from '../../core/team/team';
import { FormLinkCard } from '../../layout/form-link-card/form-link-card';
import { PageHeader } from '../../layout/page-header/page-header';
import { StateLocked } from '../../layout/state-locked/state-locked';

const MS_PER_SECOND = 1000;
const MS_PER_MINUTE = 60 * MS_PER_SECOND;
const MS_PER_HOUR = 60 * MS_PER_MINUTE;
const MS_PER_DAY = 24 * MS_PER_HOUR;

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/**
 * Read-only view of your entry, plus a link to the submission form.
 *
 * Projects are submitted on a Google Form rather than here, so this page owns
 * no draft and no fields — it shows whether your team's entry has landed, how
 * long is left, and the way through to the form.
 */
@Component({
  selector: 'app-my-submission',
  imports: [DatePipe, RouterLink, FormLinkCard, PageHeader, StateLocked],
  templateUrl: './my-submission.html',
  styleUrl: './my-submission.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MySubmission {
  private readonly submissions = inject(SubmissionService);
  private readonly teams = inject(TeamService);
  private readonly phaseService = inject(PhaseService);

  protected readonly config = inject(EVENT_CONFIG);
  protected readonly myt = MYT_OFFSET;
  protected readonly deadline = this.config.settings.submissionDeadlineAt;
  protected readonly formUrl = this.config.site.projectSubmissionFormUrl;

  protected readonly team = this.teams.myTeam;
  protected readonly submission = this.submissions.submission;
  protected readonly isSubmitted = this.submissions.isSubmitted;

  /** Submissions open when registration closes and shut at the deadline. */
  protected readonly isOpen = computed(() => this.phaseService.phase() === 'submission');
  protected readonly isBeforeWindow = computed(() => {
    const phase = this.phaseService.phase();
    return phase === 'before-registration' || phase === 'registration';
  });

  /** Time left to submit, sharing PhaseService's clock rather than starting another. */
  protected readonly countdown = computed(() => {
    const deadline = this.deadline;
    if (!deadline || !this.isOpen()) return null;

    const remaining = Math.max(0, deadline.getTime() - this.phaseService.now());
    return {
      days: pad(Math.floor(remaining / MS_PER_DAY)),
      hours: pad(Math.floor((remaining % MS_PER_DAY) / MS_PER_HOUR)),
      minutes: pad(Math.floor((remaining % MS_PER_HOUR) / MS_PER_MINUTE)),
    };
  });
}
