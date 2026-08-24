import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { AssignmentStatus, JudgeStats } from '../../../core/judge/judge';

/** How far through their queue a judge is: four counts, interactive filters, and a bar. */
@Component({
  selector: 'app-judging-progress',
  templateUrl: './judging-progress.html',
  styleUrl: './judging-progress.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class JudgingProgress {
  readonly stats = input.required<JudgeStats>();
  readonly filterSelected = output<AssignmentStatus | 'all'>();

  protected selectFilter(status: AssignmentStatus | 'all'): void {
    this.filterSelected.emit(status);
  }
}
