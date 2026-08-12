import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AdminService, AdminTeamRow, ATTENTION_LABELS } from '../../../core/admin/admin';
import { EVENT_CONFIG } from '../../../core/event/event-config';
import { SubmissionStatus } from '../../../core/submission/submission';
import { TeamStatus } from '../../../core/team/team';
import { ConfirmDialog } from '../../../layout/confirm-dialog/confirm-dialog';

/** 'all' is the unfiltered default rather than a status the schema knows about. */
type StatusFilter = TeamStatus | 'all';
type TrackFilter = string | 'all';

export const TEAM_STATUS_LABELS: Record<TeamStatus, string> = {
  forming: 'Forming',
  complete: 'Complete',
  disqualified: 'Disqualified',
  withdrawn: 'Withdrawn',
};

/** The same vocabulary as the Submissions section, so a row reads the same in both. */
const SUBMISSION_STATUS_LABELS: Record<SubmissionStatus, string> = {
  draft: 'Draft',
  submitted: 'Submitted',
  withdrawn: 'Withdrawn',
  disqualified: 'Disqualified',
};

/**
 * Every team, filterable, with the actions an organiser takes on one.
 *
 * The design draft offers Lock / Unlock here. There is no such status:
 * `teams_status_check` allows only forming, complete, disqualified and
 * withdrawn, so a lock would be a value the database rejects on write. Withdraw
 * and Disqualify are the two settled states that do exist, and they are what
 * this offers instead — see the note in the template.
 */
@Component({
  selector: 'app-admin-teams',
  imports: [ConfirmDialog, FormsModule],
  templateUrl: './admin-teams.html',
  styleUrl: './admin-teams.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminTeams {
  private readonly admin = inject(AdminService);
  private readonly config = inject(EVENT_CONFIG);

  protected readonly statusLabels = TEAM_STATUS_LABELS;
  protected readonly submissionLabels = SUBMISSION_STATUS_LABELS;
  protected readonly attentionLabels = ATTENTION_LABELS;
  protected readonly pending = this.admin.pending;

  protected readonly search = signal('');
  protected readonly statusFilter = signal<StatusFilter>('all');
  protected readonly trackFilter = signal<TrackFilter>('all');

  protected readonly error = signal<string | null>(null);
  protected readonly notice = signal<string | null>(null);

  /** The team awaiting confirmation, and which way. */
  protected readonly confirming = signal<{ team: AdminTeamRow; to: TeamStatus } | null>(null);
  /** The team being renamed, if any. */
  protected readonly renaming = signal<AdminTeamRow | null>(null);
  protected readonly draftName = signal('');

  protected readonly tracks = this.config.site.tracks;

  protected readonly statusFilters: readonly { id: StatusFilter; label: string }[] = [
    { id: 'all', label: 'All statuses' },
    { id: 'forming', label: 'Forming' },
    { id: 'complete', label: 'Complete' },
    { id: 'disqualified', label: 'Disqualified' },
    { id: 'withdrawn', label: 'Withdrawn' },
  ];

  protected readonly rows = computed<readonly AdminTeamRow[]>(() => {
    const term = this.search().trim().toLowerCase();
    const status = this.statusFilter();
    const track = this.trackFilter();

    return this.admin.teams().filter((row) => {
      if (status !== 'all' && row.status !== status) return false;
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
    const all = this.admin.teams();
    const count = (status: TeamStatus) => all.filter((row) => row.status === status).length;
    return `${count('forming') + count('complete')} still in · ${count('withdrawn')} withdrawn · ${count('disqualified')} disqualified`;
  });

  protected clearFilters(): void {
    this.search.set('');
    this.statusFilter.set('all');
    this.trackFilter.set('all');
  }

  protected ask(team: AdminTeamRow, to: TeamStatus): void {
    this.confirming.set({ team, to });
  }

  protected startRename(team: AdminTeamRow): void {
    this.renaming.set(team);
    this.draftName.set(team.teamName);
  }

  protected async confirm(): Promise<void> {
    const pendingChange = this.confirming();
    this.confirming.set(null);
    if (!pendingChange) return;

    const { team, to } = pendingChange;
    const result = await this.admin.setTeamStatus(team.teamId, to);
    this.report(result, `${team.teamName} is now ${TEAM_STATUS_LABELS[to].toLowerCase()}.`);
  }

  protected async saveName(): Promise<void> {
    const team = this.renaming();
    if (!team) return;

    const result = await this.admin.renameTeam(team.teamId, this.draftName());
    if (result.ok) this.renaming.set(null);
    this.report(result, `Renamed to ${this.draftName().trim()}.`);
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
