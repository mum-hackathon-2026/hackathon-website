import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { AdminService, SectionId } from '../../../core/admin/admin';
import { MYT_OFFSET } from '../../../core/event/event-config';
import { PhaseService } from '../../../core/event/phase';

/** One headline number, and the section that explains it. */
interface Kpi {
  readonly label: string;
  readonly value: number;
  readonly sub: string;
  readonly section: SectionId;
  /** Picks the accent stripe; keeps colour out of the template. */
  readonly tone: 'blue' | 'violet' | 'green' | 'amber' | 'sky' | 'red';
}

/**
 * The workspace's front page: six counts, how judging is going, what needs
 * doing, and what just happened.
 *
 * Every tile and alert is a link into the section that acts on it, which is
 * what makes this a landing page rather than a report.
 */
@Component({
  selector: 'app-admin-overview',
  imports: [DatePipe, RouterLink],
  templateUrl: './admin-overview.html',
  styleUrl: './admin-overview.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminOverview {
  private readonly admin = inject(AdminService);
  private readonly phaseService = inject(PhaseService);

  protected readonly myt = MYT_OFFSET;
  protected readonly stats = this.admin.stats;
  protected readonly urgent = this.admin.urgent;
  protected readonly audit = this.admin.audit;
  protected readonly judgingOpen = this.phaseService.judgingOpen;

  protected readonly kpis = computed<readonly Kpi[]>(() => {
    const s = this.stats();
    return [
      {
        label: 'Registered teams',
        value: s.teams,
        sub: `${s.activeTeams} still in`,
        section: 'teams',
        tone: 'blue',
      },
      {
        label: 'Participants',
        value: s.participants,
        sub: `across ${s.teams} teams`,
        section: 'participants',
        tone: 'violet',
      },
      {
        label: 'Submissions',
        value: s.submitted,
        sub: `${s.drafts} still drafts`,
        section: 'submissions',
        tone: 'green',
      },
      {
        label: 'Reviews complete',
        value: s.reviewsCompleted,
        sub: `of ${s.reviewsExpected} expected`,
        section: 'judging',
        tone: 'amber',
      },
      {
        label: 'Active judges',
        value: s.activeJudges,
        sub: `${s.judges} on the panel`,
        section: 'judges',
        tone: 'sky',
      },
      {
        label: 'Open issues',
        value: s.needingAttention,
        sub: 'need attention',
        section: 'teams',
        tone: 'red',
      },
    ];
  });

  /** The most recent handful; the Audit Log section holds the rest. */
  protected readonly recent = computed(() => this.audit().slice(0, 7));
}
