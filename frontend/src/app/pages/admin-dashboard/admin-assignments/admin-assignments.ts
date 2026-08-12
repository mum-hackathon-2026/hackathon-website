import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  ADMIN_ASSIGNMENT_STATUS_LABELS,
  AdminAssignment,
  AdminAssignmentRow,
  AdminService,
} from '../../../core/admin/admin';
import { ConfirmDialog } from '../../../layout/confirm-dialog/confirm-dialog';
import { JudgeWorkloadPanel } from './judge-workload/judge-workload';

/** 'all' is the unfiltered default; the rest narrow to what needs doing. */
type CoverageFilter = 'all' | 'under' | 'unassigned';

/** The judge and the team they would come off, held while we confirm. */
interface PendingRemoval {
  readonly row: AdminAssignmentRow;
  readonly assignment: AdminAssignment;
}

/**
 * Judge-to-team assignments: who is reviewing what, and the panel's balance.
 *
 * This is one of the sections the schema supports as drawn — `assignments`
 * carries everything the design asks for. The two places it departs from the
 * draft are both constraints rather than choices:
 *
 *  - The draft ignores a repeat assignment silently. `assignments` has a UNIQUE
 *    key on (team_id, judge_id), so this refuses it and says why.
 *  - The draft removes a judge with a bare × and no warning. Deleting the row
 *    cascades to `scores`, so a judge who has started or finished loses that
 *    work with no undo. Anything past 'pending' asks first.
 */
@Component({
  selector: 'app-admin-assignments',
  imports: [ConfirmDialog, FormsModule, JudgeWorkloadPanel],
  templateUrl: './admin-assignments.html',
  styleUrl: './admin-assignments.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminAssignments {
  private readonly admin = inject(AdminService);

  protected readonly statusLabels = ADMIN_ASSIGNMENT_STATUS_LABELS;
  protected readonly pending = this.admin.pending;
  protected readonly workloads = this.admin.workloads;

  protected readonly search = signal('');
  protected readonly coverage = signal<CoverageFilter>('all');

  /** The two dropdowns on the assign panel. '' is the unchosen placeholder. */
  protected readonly draftTeam = signal('');
  protected readonly draftJudge = signal('');

  protected readonly error = signal<string | null>(null);
  protected readonly notice = signal<string | null>(null);

  protected readonly removing = signal<PendingRemoval | null>(null);

  protected readonly coverageFilters: readonly { id: CoverageFilter; label: string }[] = [
    { id: 'all', label: 'All teams' },
    { id: 'under', label: 'Short of a full panel' },
    { id: 'unassigned', label: 'Nobody assigned' },
  ];

  /** Settled teams are out of the running, so they are not offered for assigning. */
  protected readonly assignableTeams = computed(() =>
    this.admin
      .assignments()
      .filter((row) => row.teamStatus !== 'withdrawn' && row.teamStatus !== 'disqualified'),
  );

  /** Heaviest load last, so the obvious pick is at the top. */
  protected readonly judgeOptions = computed(() =>
    [...this.workloads()].sort((a, b) => a.assigned - b.assigned),
  );

  protected readonly rows = computed<readonly AdminAssignmentRow[]>(() => {
    const term = this.search().trim().toLowerCase();
    const coverage = this.coverage();

    return this.admin.assignments().filter((row) => {
      if (coverage === 'under' && !row.underAssigned) return false;
      if (coverage === 'unassigned' && row.judges.length > 0) return false;
      if (!term) return true;
      return row.teamName.toLowerCase().includes(term);
    });
  });

  protected readonly filtersActive = computed(
    () => this.search().trim() !== '' || this.coverage() !== 'all',
  );

  protected readonly summary = computed(() => {
    const all = this.admin.assignments();
    const total = all.reduce((sum, row) => sum + row.judges.length, 0);
    const short = all.filter((row) => row.underAssigned).length;

    return `${all.length} teams to review · ${total} assignments · ${short} short of a full panel`;
  });

  protected clearFilters(): void {
    this.search.set('');
    this.coverage.set('all');
  }

  protected async assign(): Promise<void> {
    const teamId = Number(this.draftTeam());
    const judgeId = Number(this.draftJudge());
    if (!teamId || !judgeId) {
      this.report({ ok: false, error: 'Pick a team and a judge first.' }, '');
      return;
    }

    const result = await this.admin.assignJudge(teamId, judgeId);
    if (result.ok) {
      const team = this.admin.assignments().find((row) => row.teamId === teamId);
      const judge = this.workloads().find((row) => row.userId === judgeId);
      this.draftJudge.set('');
      this.report(result, `${judge?.name} is now reviewing ${team?.teamName}.`);
    } else {
      this.report(result, '');
    }
  }

  /**
   * A judge who has not started loses nothing, so that goes straight through.
   * Anything else destroys scores on the way out and asks first.
   */
  protected async remove(row: AdminAssignmentRow, assignment: AdminAssignment): Promise<void> {
    if (assignment.status !== 'pending') {
      this.removing.set({ row, assignment });
      return;
    }
    await this.commitRemoval(row, assignment);
  }

  protected async confirmRemoval(): Promise<void> {
    const pendingRemoval = this.removing();
    this.removing.set(null);
    if (!pendingRemoval) return;

    await this.commitRemoval(pendingRemoval.row, pendingRemoval.assignment);
  }

  private async commitRemoval(row: AdminAssignmentRow, assignment: AdminAssignment): Promise<void> {
    const result = await this.admin.unassignJudge(assignment.id);
    this.report(result, `${assignment.judgeName} is off ${row.teamName}.`);
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
