import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { EVENT_CONFIG, MYT_OFFSET } from '../../core/event/event-config';
import { EventSettingsService } from '../../core/event/event-settings';
import { OUTCOME_LABELS, ResultsService } from '../../core/results/results';
import { PageHeader } from '../../layout/page-header/page-header';
import { StateLocked } from '../../layout/state-locked/state-locked';
import { JudgeReviews } from './judge-reviews/judge-reviews';
import { RankingsTable } from './rankings-table/rankings-table';

type ResultsTab = 'result' | 'rankings' | 'awards' | 'feedback';

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
    RankingsTable,
  ],
  templateUrl: './results.html',
  styleUrl: './results.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Results {
  private readonly results = inject(ResultsService);

  protected readonly config = inject(EVENT_CONFIG);
  private readonly settings = inject(EventSettingsService);
  protected readonly myt = MYT_OFFSET;
  protected readonly eventName = this.settings.eventName;
  protected readonly outcomeLabels = OUTCOME_LABELS;

  protected readonly published = this.results.published;
  protected readonly publishedAt = this.results.publishedAt;
  protected readonly totalTeams = this.results.totalTeams;
  protected readonly rankings = this.results.rankings;
  protected readonly myResult = this.results.myResult;
  protected readonly criteria = this.results.myCriteria;
  protected readonly reviews = this.results.myReviews;
  protected readonly awards = this.results.awards;

  protected readonly activeTab = signal<ResultsTab>('result');

  /** Tabs that need a result of your own drop out when you have none. */
  protected readonly tabs = computed<readonly TabDef[]>(() => {
    const mine = this.myResult() !== null;
    return [
      ...(mine ? [{ id: 'result' as const, label: 'My result' }] : []),
      { id: 'rankings' as const, label: 'Rankings' },
      { id: 'awards' as const, label: 'Awards' },
      ...(mine ? [{ id: 'feedback' as const, label: 'Judge feedback' }] : []),
    ];
  });

  /** Falls back to the first available tab, so a missing result cannot strand the view. */
  protected readonly tab = computed<ResultsTab>(() => {
    const available = this.tabs().map((t) => t.id);
    const active = this.activeTab();
    return available.includes(active) ? active : (available[0] ?? 'rankings');
  });

  protected readonly overallAwards = computed(() =>
    this.awards().filter((a) => a.category === 'overall'),
  );

  /** The subtitle carries the headline so it is readable before any tab is opened. */
  protected readonly subtitle = computed(() => {
    if (!this.published()) return 'Results have not been published yet.';

    const mine = this.myResult();
    const count = this.totalTeams();
    if (!mine) return `Final standings for all ${count} teams.`;

    const rank = mine.tied ? `Joint #${mine.rank}` : `#${mine.rank}`;
    return `${mine.teamName} · ${rank} of ${count} · ${mine.finalScore} pts`;
  });

  protected select(tab: ResultsTab): void {
    this.activeTab.set(tab);
  }

  /** Width of a score bar, as a percentage of the criterion's maximum. */
  protected percent(score: number, max: number): number {
    return max > 0 ? Math.round((score / max) * 100) : 0;
  }
}
