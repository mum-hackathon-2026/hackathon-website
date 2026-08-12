import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CriterionScoreView } from '../../../core/judge/judge';

/**
 * One rubric line: the mark, an optional private note, and what the mark is
 * currently worth towards the total.
 */
@Component({
  selector: 'app-criterion-card',
  imports: [DecimalPipe, FormsModule],
  templateUrl: './criterion-card.html',
  styleUrl: './criterion-card.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CriterionCard {
  readonly criterion = input.required<CriterionScoreView>();
  readonly readOnly = input(false);
  readonly disabled = input(false);

  /** null when the judge clears the box — that deletes the row rather than storing a zero. */
  readonly scoreChange = output<number | null>();
  readonly commentChange = output<string>();

  /** How full the bar sits, as a share of this criterion's maximum. */
  protected readonly percent = computed(() => {
    const { score, maxScore } = this.criterion();
    if (score === null || maxScore <= 0) return 0;
    return Math.min(100, Math.max(0, (score / maxScore) * 100));
  });

  protected onScore(value: string): void {
    const trimmed = value.trim();
    if (trimmed === '') {
      this.scoreChange.emit(null);
      return;
    }
    const parsed = Number(trimmed);
    // Number('') is 0 and Number('5abc') is NaN — neither should reach the service
    // as a score, so an unparseable box reads as cleared.
    this.scoreChange.emit(Number.isNaN(parsed) ? null : parsed);
  }
}
