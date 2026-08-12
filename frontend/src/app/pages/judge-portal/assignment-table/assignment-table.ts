import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { AssignmentView } from '../../../core/judge/judge';
import { StatusPill } from '../../../layout/status-pill/status-pill';

/**
 * A judge's assignments as a table.
 *
 * Rows do not link anywhere yet: the review screen is a separate change, and a
 * routerLink to an unregistered path throws NG04002 on click.
 */
@Component({
  selector: 'app-assignment-table',
  imports: [StatusPill],
  templateUrl: './assignment-table.html',
  styleUrl: './assignment-table.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AssignmentTable {
  readonly rows = input.required<readonly AssignmentView[]>();
  /** Disables the decline control while a mutation is in flight. */
  readonly busy = input(false);

  /** Emits the assignment id the judge wants to step back from. */
  readonly declined = output<number>();
}
