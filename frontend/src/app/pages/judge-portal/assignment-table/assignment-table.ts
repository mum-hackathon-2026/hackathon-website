import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AssignmentStatus, AssignmentView } from '../../../core/judge/judge';
import { StatusPill } from '../../../layout/status-pill/status-pill';

/** What the action column offers, per status. */
const ACTION_LABELS: Partial<Record<AssignmentStatus, string>> = {
  pending: 'Start review',
  in_progress: 'Continue',
  completed: 'View',
};

/** A judge's assignments as a table, each row opening its review. */
@Component({
  selector: 'app-assignment-table',
  imports: [RouterLink, StatusPill],
  templateUrl: './assignment-table.html',
  styleUrl: './assignment-table.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AssignmentTable {
  readonly rows = input.required<readonly AssignmentView[]>();
  /** Disables the decline control while a mutation is in flight. */
  readonly busy = input(false);
  readonly judgingOpen = input(true);

  /** Emits the assignment id the judge wants to step back from. */
  readonly declined = output<number>();

  /** A declined assignment has no review to open. */
  protected actionLabel(status: AssignmentStatus): string | null {
    if (status === 'completed') {
      return this.judgingOpen() ? 'Edit review' : 'View';
    }
    return ACTION_LABELS[status] ?? null;
  }
}
