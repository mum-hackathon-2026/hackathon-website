import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { DatePipe } from '@angular/common';
import { MYT_OFFSET } from '../../core/event/event-config';
import { MilestoneService } from '../../core/event/milestones';

/**
 * The event schedule as a vertical spine of milestones.
 *
 * Rendered by both the public timeline page and the participant progress page's
 * event tab. It reads MilestoneService directly rather than taking an input:
 * there is only one schedule, and both callers want all of it.
 */
@Component({
  selector: 'app-event-timeline',
  imports: [DatePipe],
  templateUrl: './event-timeline.html',
  styleUrl: './event-timeline.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EventTimeline {
  private readonly milestones = inject(MilestoneService);

  protected readonly myt = MYT_OFFSET;
  protected readonly steps = this.milestones.steps;
}
