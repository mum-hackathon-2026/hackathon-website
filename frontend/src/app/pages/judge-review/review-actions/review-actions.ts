import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { DecimalPipe } from '@angular/common';

/** The running total and the two ways out of a review, pinned to the bottom. */
@Component({
  selector: 'app-review-actions',
  imports: [DecimalPipe],
  templateUrl: './review-actions.html',
  styleUrl: './review-actions.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReviewActions {
  readonly scoredCount = input.required<number>();
  readonly criteriaCount = input.required<number>();
  readonly weightedTotal = input.required<number>();
  readonly allScored = input.required<boolean>();
  readonly dirty = input(false);
  readonly busy = input(false);
  readonly savedAt = input<Date | null>(null);

  readonly save = output<void>();
  readonly submit = output<void>();
}
