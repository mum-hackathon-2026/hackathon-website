import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import {
  AdminResultRow,
  AdminService,
  RESULT_ISSUE_LABELS,
  ResultIssue,
} from '../../../core/admin/admin';
import { MYT_OFFSET } from '../../../core/event/event-config';
import { OUTCOME_LABELS } from '../../../core/results/results';
import { ConfirmDialog } from '../../../layout/confirm-dialog/confirm-dialog';

/** 'all' is the unfiltered default; the rest are the checks worth making. */
type ResultFilter = 'all' | 'shortlisted' | 'flagged' | 'unpublished';

/** Which publication change is awaiting confirmation, if any. */
type PendingPublish = 'publish' | 'unpublish' | null;

/**
 * The rankings as they will be read, plus the two things an organiser decides
 * about them: who is on the shortlist, and whether the results are out.
 *
 * **The table is not recomputed here.** Rows come from `AdminService.results()`,
 * which reads `ResultsService.rankings()` — the exact rows the participant
 * results page renders. A second ranking derived for organisers could disagree
 * with the one being published, and nothing would catch it.
 *
 * Three things worth knowing before trusting this screen:
 *
 *  - **Publishing writes two columns, on purpose.** It stamps
 *    `team_results.published_at` per row *and* sets
 *    `event_settings.results_published_at`, because `ResultsService` gates the
 *    public page on the event phase and the phase derives from that second
 *    column. Stamping only the rows would mark results published where no
 *    participant could see them.
 *  - **Flags never block.** A disqualified team is allowed a published row —
 *    `disqualified` is one of `team_results_outcome_check`'s outcomes — so the
 *    issues column is there to be read, not obeyed.
 *  - **Shortlisting has no rule attached.** `teams.shortlisted` carries no
 *    constraint tying it to a rank, so the section does not invent one.
 */
@Component({
  selector: 'app-admin-results',
  imports: [DatePipe, FormsModule, RouterLink, ConfirmDialog],
  templateUrl: './admin-results.html',
  styleUrl: './admin-results.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminResults {
  private readonly admin = inject(AdminService);

  protected readonly myt = MYT_OFFSET;
  protected readonly outcomeLabels = OUTCOME_LABELS;
  protected readonly issueLabels = RESULT_ISSUE_LABELS;

  protected readonly pending = this.admin.pending;
  protected readonly published = this.admin.resultsPublished;

  protected readonly search = signal('');
  protected readonly filter = signal<ResultFilter>('all');
  protected readonly error = signal<string | null>(null);
  protected readonly notice = signal<string | null>(null);
  protected readonly confirming = signal<PendingPublish>(null);

  protected readonly filters: readonly { id: ResultFilter; label: string }[] = [
    { id: 'all', label: 'All results' },
    { id: 'shortlisted', label: 'Shortlisted' },
    { id: 'flagged', label: 'Needs a look' },
    { id: 'unpublished', label: 'Not published' },
  ];

  protected readonly rows = computed<readonly AdminResultRow[]>(() => {
    const term = this.search().trim().toLowerCase();
    const filter = this.filter();

    return this.admin.results().filter((row) => {
      if (filter === 'shortlisted' && !row.shortlisted) return false;
      if (filter === 'flagged' && row.issues.length === 0) return false;
      if (filter === 'unpublished' && row.publishedAt !== null) return false;
      if (!term) return true;
      return (
        row.teamName.toLowerCase().includes(term) || row.projectTitle.toLowerCase().includes(term)
      );
    });
  });

  protected readonly filtersActive = computed(
    () => this.search().trim() !== '' || this.filter() !== 'all',
  );

  protected readonly summary = computed(() => {
    const all = this.admin.results();
    const shortlisted = all.filter((row) => row.shortlisted).length;
    const flagged = all.filter((row) => row.issues.length > 0).length;
    const live = all.filter((row) => row.publishedAt !== null).length;

    return `${all.length} ranked · ${shortlisted} shortlisted · ${flagged} worth a look · ${live} published`;
  });

  /** The teams a publish would actually stamp, for the confirmation copy. */
  protected readonly publishable = computed(
    () => this.admin.results().filter((row) => row.finalScore !== null).length,
  );

  protected readonly flaggedCount = computed(
    () => this.admin.results().filter((row) => row.issues.length > 0).length,
  );

  protected clearFilters(): void {
    this.search.set('');
    this.filter.set('all');
  }

  protected async toggleShortlist(row: AdminResultRow): Promise<void> {
    const result = await this.admin.setShortlisted(row.teamId, !row.shortlisted);
    this.report(
      result,
      row.shortlisted
        ? `${row.teamName} is off the shortlist.`
        : `${row.teamName} is on the shortlist.`,
    );
  }

  protected async confirmPublish(): Promise<void> {
    const action = this.confirming();
    this.confirming.set(null);
    if (!action) return;

    if (action === 'publish') {
      const count = this.publishable();
      this.report(await this.admin.publishResults(), `Results published for ${count} teams.`);
    } else {
      this.report(await this.admin.unpublishResults(), 'Results are no longer published.');
    }
  }

  protected issueText(issues: readonly ResultIssue[]): string {
    return issues.map((issue) => this.issueLabels[issue]).join(' · ');
  }

  private report(result: { ok: boolean; error?: string }, success: string): void {
    if (result.ok) {
      this.error.set(null);
      this.notice.set(success);
    } else {
      this.notice.set(null);
      this.error.set(result.error ?? 'That did not work.');
    }
  }
}
