import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { JudgeStats } from '../../../core/judge/judge';

/** How far through their queue a judge is: four counts and a bar. */
@Component({
  selector: 'app-judging-progress',
  templateUrl: './judging-progress.html',
  styleUrl: './judging-progress.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class JudgingProgress {
  readonly stats = input.required<JudgeStats>();
}
