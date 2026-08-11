import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { EVENT_CONFIG, MYT_OFFSET } from '../../core/event/event-config';
import { PhaseService } from '../../core/event/phase';
import {
  SubmissionActionResult,
  SubmissionDraft,
  SubmissionService,
} from '../../core/submission/submission';
import { TeamService } from '../../core/team/team';
import { ConfirmDialog } from '../../layout/confirm-dialog/confirm-dialog';
import { PageHeader } from '../../layout/page-header/page-header';
import { StateLocked } from '../../layout/state-locked/state-locked';

const MS_PER_SECOND = 1000;
const MS_PER_MINUTE = 60 * MS_PER_SECOND;
const MS_PER_HOUR = 60 * MS_PER_MINUTE;
const MS_PER_DAY = 24 * MS_PER_HOUR;

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

@Component({
  selector: 'app-my-submission',
  imports: [DatePipe, FormsModule, RouterLink, ConfirmDialog, PageHeader, StateLocked],
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
  protected readonly tracks = this.config.site.tracks;
  protected readonly deadline = this.config.settings.submissionDeadlineAt;

  protected readonly team = this.teams.myTeam;
  protected readonly submission = this.submissions.submission;
  protected readonly isSubmitted = this.submissions.isSubmitted;
  protected readonly pending = this.submissions.pending;

  /** Submissions open when registration closes and shut at the deadline. */
  protected readonly isOpen = computed(() => this.phaseService.phase() === 'submission');
  protected readonly isBeforeWindow = computed(() => {
    const phase = this.phaseService.phase();
    return phase === 'before-registration' || phase === 'registration';
  });

  protected readonly form = signal<SubmissionDraft>({
    projectTitle: '',
    description: '',
    githubUrl: '',
    deployedUrl: '',
    trackLabel: '',
  });

  protected readonly error = signal<string | null>(null);
  protected readonly savedAt = signal<Date | null>(null);
  protected readonly confirming = signal(false);

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

  constructor() {
    // Load whatever the team already has into the form, including after a
    // teammate's changes arrive once this is a real API.
    effect(() => {
      const record = this.submissions.submission();
      if (!record) return;
      this.form.set({
        projectTitle: record.projectTitle,
        description: record.description,
        githubUrl: record.githubUrl,
        deployedUrl: record.deployedUrl,
        trackLabel: record.trackLabel,
      });
    });
  }

  protected update<K extends keyof SubmissionDraft>(field: K, value: SubmissionDraft[K]): void {
    this.form.update((current) => ({ ...current, [field]: value }));
  }

  protected async saveDraft(): Promise<void> {
    const result = await this.submissions.saveDraft(this.form());
    this.report(result, () => this.savedAt.set(new Date()));
  }

  protected async confirmSubmit(): Promise<void> {
    this.confirming.set(false);
    const result = await this.submissions.submit(this.form());
    this.report(result, () => this.savedAt.set(new Date()));
  }

  private report(result: SubmissionActionResult, onSuccess: () => void): void {
    if (result.ok) {
      this.error.set(null);
      onSuccess();
    } else {
      this.error.set(result.error);
    }
  }
}
