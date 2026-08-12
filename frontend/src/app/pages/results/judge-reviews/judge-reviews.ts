import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { JudgeReview } from '../../../core/results/results';

/** Each judge's per-criterion scores and written feedback for one team. */
@Component({
  selector: 'app-judge-reviews',
  imports: [DecimalPipe],
  templateUrl: './judge-reviews.html',
  styleUrl: './judge-reviews.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class JudgeReviews {
  readonly reviews = input.required<readonly JudgeReview[]>();
}
