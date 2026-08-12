import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AdminService, AdminTeamRow } from '../../../core/admin/admin';
import { EVENT_CONFIG, MYT_OFFSET } from '../../../core/event/event-config';
import { SubmissionStatus } from '../../../core/submission/submission';

type StatusFilter = SubmissionStatus | 'none' | 'all';

const STATUS_LABELS: Record<SubmissionStatus, string> = {
  draft: 'Draft',
  submitted: 'Submitted',
  withdrawn: 'Withdrawn',
  disqualified: 'Disqualified',
};

/**
 * Every submission in the event, filterable, with its links.
 *
 * Teams with no `submissions` row appear too, under a 'none' filter that is not
 * a status the column has — a missing row and a draft are different states and
 * an organiser chases them differently.
 */
@Component({
  selector: 'app-admin-submissions',
  imports: [DatePipe, FormsModule],
  templateUrl: './admin-submissions.html',
  styleUrl: './admin-submissions.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminSubmissions {
  private readonly admin = inject(AdminService);
  private readonly config = inject(EVENT_CONFIG);

  protected readonly myt = MYT_OFFSET;
  protected readonly statusLabels = STATUS_LABELS;
  protected readonly tracks = this.config.site.tracks;

  protected readonly search = signal('');
  protected readonly statusFilter = signal<StatusFilter>('all');
  protected readonly trackFilter = signal<string>('all');

  protected readonly statusFilters: readonly { id: StatusFilter; label: string }[] = [
    { id: 'all', label: 'All statuses' },
    { id: 'submitted', label: 'Submitted' },
    { id: 'draft', label: 'Draft' },
    { id: 'withdrawn', label: 'Withdrawn' },
    { id: 'disqualified', label: 'Disqualified' },
    { id: 'none', label: 'No submission' },
  ];

  protected readonly rows = computed<readonly AdminTeamRow[]>(() => {
    const term = this.search().trim().toLowerCase();
    const status = this.statusFilter();
    const track = this.trackFilter();

    return this.admin.teams().filter((row) => {
      if (status === 'none' && row.submissionStatus !== null) return false;
      if (status !== 'all' && status !== 'none' && row.submissionStatus !== status) return false;
      if (track !== 'all' && row.trackLabel !== track) return false;
      if (!term) return true;
      return (
        row.teamName.toLowerCase().includes(term) || row.projectTitle.toLowerCase().includes(term)
      );
    });
  });

  protected readonly filtersActive = computed(
    () =>
      this.search().trim() !== '' || this.statusFilter() !== 'all' || this.trackFilter() !== 'all',
  );

  protected readonly summary = computed(() => {
    const s = this.admin.stats();
    return `${s.submitted} submitted · ${s.drafts} drafts · ${s.noSubmission} not started`;
  });

  protected clearFilters(): void {
    this.search.set('');
    this.statusFilter.set('all');
    this.trackFilter.set('all');
  }
}
