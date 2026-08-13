import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { JudgeWorkload } from '../../../../core/admin/admin';

/**
 * How much each judge is carrying, as a bar per judge.
 *
 * Split out of the Assignments section rather than inlined: the Judges section
 * needs the same panel, and a component of its own also keeps both stylesheets
 * inside the 4 kB per-component budget.
 */
@Component({
  selector: 'app-judge-workload',
  templateUrl: './judge-workload.html',
  styleUrl: './judge-workload.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class JudgeWorkloadPanel {
  readonly judges = input.required<readonly JudgeWorkload[]>();

  /** The busiest judge, so the bars have something to scale against. */
  protected readonly peak = computed(() =>
    Math.max(1, ...this.judges().map((judge) => judge.assigned)),
  );
}
