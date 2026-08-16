import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { ASSIGNMENT_STATUS_LABELS, AssignmentStatus } from '../../core/judge/judge';

/**
 * An assignment's status as a dot and a label.
 *
 * Shared because the portal table, the "continue" card and the review screen all
 * need the same four treatments. Those three are the only consumers: the admin
 * Assignments section renders its own `.chip` against `ADMIN_ASSIGNMENT_STATUS_LABELS`,
 * which is a second copy of the same four `assignments.status` labels. Reach for
 * this component before adding a third.
 */
@Component({
  selector: 'app-status-pill',
  templateUrl: './status-pill.html',
  styleUrl: './status-pill.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StatusPill {
  readonly status = input.required<AssignmentStatus>();

  protected readonly labels = ASSIGNMENT_STATUS_LABELS;
}
