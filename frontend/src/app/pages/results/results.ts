import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { EVENT_CONFIG, MYT_OFFSET } from '../../core/event/event-config';
import { EventSettingsService } from '../../core/event/event-settings';
import { OUTCOME_LABELS, ResultsService } from '../../core/results/results';
import { TeamService } from '../../core/team/team';
import { PdfReportService } from '../../core/results/pdf-report.service';
import { PageHeader } from '../../layout/page-header/page-header';
import { StateLocked } from '../../layout/state-locked/state-locked';
import { JudgeReviews } from './judge-reviews/judge-reviews';

type ResultsTab = 'result' | 'feedback';

interface TabDef {
  readonly id: ResultsTab;
  readonly label: string;
}

@Component({
  selector: 'app-results',
  imports: [
    DatePipe,
    DecimalPipe,
    RouterLink,
    PageHeader,
    StateLocked,
    JudgeReviews,
  ],
  templateUrl: './results.html',
  styleUrl: './results.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Results {
  private readonly results = inject(ResultsService);
  private readonly teams = inject(TeamService);
  private readonly pdfService = inject(PdfReportService);

  protected readonly config = inject(EVENT_CONFIG);
  private readonly settings = inject(EventSettingsService);
  protected readonly myt = MYT_OFFSET;
  protected readonly eventName = this.settings.eventName;
  protected readonly outcomeLabels = OUTCOME_LABELS;

  protected readonly published = this.results.published;
  protected readonly publishedAt = this.results.publishedAt;
  protected readonly myResult = this.results.myResult;
  protected readonly criteria = this.results.myCriteria;
  protected readonly reviews = this.results.myReviews;

  protected readonly isFinalist = computed(() => {
    const mine = this.myResult();
    const team = this.teams.myTeam();
    return mine?.outcome === 'finalist' || team?.shortlisted === true;
  });

  protected readonly activeTab = signal<ResultsTab>('result');

  protected readonly tabs = computed<readonly TabDef[]>(() => {
    const mine = this.myResult() !== null;
    return [
      ...(mine ? [{ id: 'result' as const, label: 'Evaluation & Score' }] : []),
      ...(mine ? [{ id: 'feedback' as const, label: 'Judge Feedback' }] : []),
    ];
  });

  protected readonly tab = computed<ResultsTab>(() => {
    const available = this.tabs().map((t) => t.id);
    const active = this.activeTab();
    return available.includes(active) ? active : (available[0] ?? 'result');
  });

  protected readonly subtitle = computed(() => {
    if (!this.published()) return 'Preliminary results have not been published yet.';

    const mine = this.myResult();
    if (!mine) return 'Preliminary Round Evaluation Results.';

    const statusText = mine.outcome === 'finalist' ? 'Finalist Qualifier 🎉' : 'Evaluation Completed';
    return `${mine.teamName} · ${statusText} · ${mine.finalScore?.toFixed(1) ?? '--'} pts`;
  });

  protected select(tab: ResultsTab): void {
    this.activeTab.set(tab);
  }

  /** Width of a score bar, as a percentage of the criterion's maximum. */
  protected percent(score: number, max: number): number {
    return max > 0 ? Math.round((score / max) * 100) : 0;
  }

  /** Trigger download of the official preliminary evaluation PDF report */
  protected downloadPdfReport(): void {
    const res = this.myResult();
    if (!res) return;

    this.pdfService.generateAndDownloadReport({
      teamName: res.teamName,
      projectTitle: res.projectTitle,
      trackLabel: res.trackLabel,
      finalScore: res.finalScore,
      outcome: res.outcome,
      judgeCount: res.judgeCount,
      criteria: this.criteria(),
      reviews: this.reviews(),
    });
  }
}

