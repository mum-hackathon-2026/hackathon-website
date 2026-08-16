import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { ASSIGNMENT_STATUS_LABELS, AssignmentStatus } from '../../core/judge/judge';

/**
 * An assignment's status as a dot and a label.
 *
 * The one treatment for `assignments.status` anywhere in the app: the judge
 * portal table, the "continue" card, the review screen, and the judge chips on
 * the admin Assignments section all render through here. Admin used to draw its
 * own `.chip` against a second copy of these four labels; that copy is gone, and
 * `ASSIGNMENT_STATUS_LABELS` is now the only place the wording lives. Reach for
 * this component rather than starting another.
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
