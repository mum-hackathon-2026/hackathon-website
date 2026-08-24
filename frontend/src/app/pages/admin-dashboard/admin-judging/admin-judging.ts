import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import {
  AdminAssignment,
  AdminAssignmentRow,
  AdminJudge,
  AdminService,
  AdminTeamRow,
  JudgeWorkload,
} from '../../../core/admin/admin';
import { EVENT_CONFIG } from '../../../core/event/event-config';
import { EventSettingsService } from '../../../core/event/event-settings';
import { PhaseService } from '../../../core/event/phase';

export type JudgingStatusFilter = 'all' | 'complete' | 'in_progress' | 'unreviewed' | 'under_assigned';

export interface TeamJudgingProgressRow {
  readonly teamId: number;
  readonly teamName: string;
  readonly projectTitle: string;
  readonly trackLabel: string;
  readonly reviewsCompleted: number;
  readonly reviewsExpected: number;
  readonly percent: number;
  readonly assignedJudges: readonly AdminAssignment[];
  readonly averageScore: number | null;
  readonly status: 'complete' | 'in_progress' | 'unreviewed' | 'under_assigned';
  readonly statusLabel: string;
  readonly statusTone: 'green' | 'blue' | 'amber' | 'red';
}

@Component({
  selector: 'app-admin-judging',
  imports: [DecimalPipe, FormsModule, RouterLink],
  templateUrl: './admin-judging.html',
  styleUrl: './admin-judging.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminJudging {
  private readonly admin = inject(AdminService);
  private readonly config = inject(EVENT_CONFIG);
  private readonly phaseService = inject(PhaseService);
  private readonly settings = inject(EventSettingsService);

  protected readonly stats = this.admin.stats;
  protected readonly judgingOpen = this.phaseService.judgingOpen;
  protected readonly judgesPerTeam = this.settings.judgesPerTeam;
  protected readonly workloads = this.admin.workloads;
  protected readonly tracks = computed(() => ['all', ...this.config.site.tracks]);

  protected readonly search = signal('');
  protected readonly statusFilter = signal<JudgingStatusFilter>('all');
  protected readonly trackFilter = signal<string>('all');

  protected readonly statusFilters: readonly { id: JudgingStatusFilter; label: string }[] = [
    { id: 'all', label: 'All submissions' },
    { id: 'complete', label: 'Fully reviewed' },
    { id: 'in_progress', label: 'In progress' },
    { id: 'unreviewed', label: 'Not started' },
    { id: 'under_assigned', label: 'Needs more judges' },
  ];

  /** Map of teamId -> average score from results if available */
  private readonly averageScoresByTeam = computed<ReadonlyMap<number, number>>(() => {
    const map = new Map<number, number>();
    for (const res of this.admin.results()) {
      if (res.finalScore !== null) {
        map.set(res.teamId, res.finalScore);
      }
    }
    return map;
  });

  /** Map of teamId -> assigned judges list */
  private readonly assignmentsByTeam = computed<ReadonlyMap<number, readonly AdminAssignment[]>>(() => {
    const map = new Map<number, AdminAssignment[]>();
    for (const row of this.admin.assignments()) {
      map.set(row.teamId, [...row.judges]);
    }
    return map;
  });

  /** Submitted teams with computed judging progress */
  protected readonly allRows = computed<readonly TeamJudgingProgressRow[]>(() => {
    const teams = this.admin.teams().filter((t) => t.submissionStatus === 'submitted');
    const assignments = this.assignmentsByTeam();
    const scores = this.averageScoresByTeam();
    const targetJudges = this.judgesPerTeam();

    return teams.map((team) => {
      const assigned = assignments.get(team.teamId) ?? [];
      const expected = Math.max(team.reviewsExpected, targetJudges);
      const completed = team.reviewsCompleted;
      const percent = expected > 0 ? Math.min(100, Math.round((completed / expected) * 100)) : 0;
      const isUnderAssigned = assigned.length < targetJudges;

      let status: 'complete' | 'in_progress' | 'unreviewed' | 'under_assigned';
      let statusLabel: string;
      let statusTone: 'green' | 'blue' | 'amber' | 'red';

      if (isUnderAssigned) {
        status = 'under_assigned';
        statusLabel = `Short of panel (${assigned.length}/${targetJudges})`;
        statusTone = 'red';
      } else if (completed >= expected && expected > 0) {
        status = 'complete';
        statusLabel = 'Fully reviewed';
        statusTone = 'green';
      } else if (completed > 0) {
        status = 'in_progress';
        statusLabel = `${completed}/${expected} reviewed`;
        statusTone = 'blue';
      } else {
        status = 'unreviewed';
        statusLabel = 'Awaiting reviews';
        statusTone = 'amber';
      }

      return {
        teamId: team.teamId,
        teamName: team.teamName,
        projectTitle: team.projectTitle || 'Untitled project',
        trackLabel: team.trackLabel,
        reviewsCompleted: completed,
        reviewsExpected: expected,
        percent,
        assignedJudges: assigned,
        averageScore: scores.get(team.teamId) ?? null,
        status,
        statusLabel,
        statusTone,
      };
    });
  });

  protected readonly filteredRows = computed<readonly TeamJudgingProgressRow[]>(() => {
    const term = this.search().trim().toLowerCase();
    const status = this.statusFilter();
    const track = this.trackFilter();

    return this.allRows().filter((row) => {
      if (status !== 'all' && row.status !== status) return false;
      if (track !== 'all' && row.trackLabel !== track) return false;
      if (!term) return true;

      const matchesTeam = row.teamName.toLowerCase().includes(term);
      const matchesProject = row.projectTitle.toLowerCase().includes(term);
      const matchesJudge = row.assignedJudges.some((j) => j.judgeName.toLowerCase().includes(term));
      return matchesTeam || matchesProject || matchesJudge;
    });
  });

  protected readonly metrics = computed(() => {
    const rows = this.allRows();
    const fullyReviewed = rows.filter((r) => r.status === 'complete').length;
    const inProgress = rows.filter((r) => r.status === 'in_progress').length;
    const unreviewed = rows.filter((r) => r.status === 'unreviewed').length;
    const underAssigned = rows.filter((r) => r.status === 'under_assigned').length;

    return {
      total: rows.length,
      fullyReviewed,
      inProgress,
      unreviewed,
      underAssigned,
    };
  });

  protected readonly filtersActive = computed(
    () => this.search().trim() !== '' || this.statusFilter() !== 'all' || this.trackFilter() !== 'all',
  );

  protected clearFilters(): void {
    this.search.set('');
    this.statusFilter.set('all');
    this.trackFilter.set('all');
  }
}
