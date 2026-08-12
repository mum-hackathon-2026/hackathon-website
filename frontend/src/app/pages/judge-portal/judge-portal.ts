import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { EVENT_CONFIG } from '../../core/event/event-config';
import { PhaseService } from '../../core/event/phase';
import { AssignmentStatus, AssignmentView, JudgeService } from '../../core/judge/judge';
import { ConfirmDialog } from '../../layout/confirm-dialog/confirm-dialog';
import { PageHeader } from '../../layout/page-header/page-header';
import { StateLocked } from '../../layout/state-locked/state-locked';
import { StatusPill } from '../../layout/status-pill/status-pill';
import { AssignmentTable } from './assignment-table/assignment-table';
import { JudgingProgress } from './judging-progress/judging-progress';

type PortalTab = 'overview' | 'assignments' | 'completed';

interface TabDef {
  readonly id: PortalTab;
  readonly label: string;
}

/** 'all' is the unfiltered default rather than a status the schema knows about. */
type StatusFilter = AssignmentStatus | 'all';

@Component({
  selector: 'app-judge-portal',
  imports: [
    FormsModule,
    AssignmentTable,
    ConfirmDialog,
    JudgingProgress,
    PageHeader,
    StateLocked,
    StatusPill,
  ],
  templateUrl: './judge-portal.html',
  styleUrl: './judge-portal.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class JudgePortal {
  private readonly judge = inject(JudgeService);
  private readonly phaseService = inject(PhaseService);
  private readonly config = inject(EVENT_CONFIG);

  protected readonly eventName = this.config.settings.eventName;
  protected readonly assignments = this.judge.myAssignments;
  protected readonly stats = this.judge.stats;
  protected readonly judgingOpen = this.judge.judgingOpen;
  protected readonly pending = this.judge.pending;

  protected readonly error = signal<string | null>(null);
  protected readonly notice = signal<string | null>(null);
  /** The assignment awaiting a decline confirmation, if any. */
  protected readonly declining = signal<AssignmentView | null>(null);

  protected readonly activeTab = signal<PortalTab>('overview');
  protected readonly search = signal('');
  protected readonly statusFilter = signal<StatusFilter>('all');

  protected readonly statusFilters: readonly { id: StatusFilter; label: string }[] = [
    { id: 'all', label: 'All statuses' },
    { id: 'pending', label: 'Not started' },
    { id: 'in_progress', label: 'In progress' },
    { id: 'completed', label: 'Completed' },
    { id: 'declined', label: 'Declined' },
  ];

  protected readonly completed = computed(() =>
    this.assignments().filter((row) => row.status === 'completed'),
  );

  /** Where the judge left off — started but not submitted. */
  protected readonly inProgress = computed(() =>
    this.assignments().filter((row) => row.status === 'in_progress'),
  );

  /**
   * With judging shut there is nothing to act on, so only the record of
   * submitted work remains — and only if there is any.
   */
  protected readonly tabs = computed<readonly TabDef[]>(() => {
    if (!this.judgingOpen()) {
      return this.completed().length > 0 ? [{ id: 'completed' as const, label: 'Completed' }] : [];
    }
    return [
      { id: 'overview', label: 'Overview' },
      { id: 'assignments', label: 'Assignments' },
      { id: 'completed', label: 'Completed' },
    ];
  });

  /** Falls back to the first available tab, so a closed window cannot strand the view. */
  protected readonly tab = computed<PortalTab>(() => {
    const available = this.tabs().map((t) => t.id);
    const active = this.activeTab();
    return available.includes(active) ? active : (available[0] ?? 'overview');
  });

  protected readonly filtered = computed<readonly AssignmentView[]>(() => {
    const term = this.search().trim().toLowerCase();
    const status = this.statusFilter();

    return this.assignments().filter((row) => {
      if (status !== 'all' && row.status !== status) return false;
      if (!term) return true;
      return (
        row.teamName.toLowerCase().includes(term) || row.projectTitle.toLowerCase().includes(term)
      );
    });
  });

  protected readonly filtersActive = computed(
    () => this.search().trim() !== '' || this.statusFilter() !== 'all',
  );

  protected readonly subtitle = computed(() => {
    const s = this.stats();
    if (s.total === 0) return 'You have no teams assigned yet.';
    if (!this.judgingOpen()) return `${s.total} teams assigned to you.`;
    return `${s.completed} of ${s.total - s.declined} reviews submitted.`;
  });

  /**
   * `judging_open` is a boolean with no history, so nothing in the schema can
   * tell "not opened yet" from "closed again". The phase can, and it is real data.
   */
  protected readonly closedReason = computed(() =>
    this.phaseService.phase() === 'results'
      ? 'Judging has closed and results are published.'
      : "Judging hasn't opened yet. An organiser opens it once every submission is in.",
  );

  protected select(tab: PortalTab): void {
    this.activeTab.set(tab);
  }

  protected clearFilters(): void {
    this.search.set('');
    this.statusFilter.set('all');
  }

  protected async confirmDecline(): Promise<void> {
    const assignment = this.declining();
    this.declining.set(null);
    if (!assignment) return;

    const result = await this.judge.declineAssignment(assignment.id);
    if (result.ok) {
      this.error.set(null);
      this.notice.set(`You declined ${assignment.teamName}. An organiser can reassign it.`);
    } else {
      this.notice.set(null);
      this.error.set(result.error);
    }
  }

  protected ask(assignmentId: number): void {
    this.declining.set(this.assignments().find((row) => row.id === assignmentId) ?? null);
  }
}
