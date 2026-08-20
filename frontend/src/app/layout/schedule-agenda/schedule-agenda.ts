import { ChangeDetectionStrategy, Component } from '@angular/core';
import { DatePipe } from '@angular/common';
import { MYT_OFFSET } from '../../core/event/event-config';
import { EVENT_SCHEDULE } from '../../core/event/event-content';

/**
 * The published programme, phase by phase, with each phase's run sheet.
 *
 * Static reference copy: unlike `app-event-timeline` next to it, nothing here
 * reacts to the clock. The timeline says where the event *is*; this says what
 * the event *is*, including the detail `event_settings` has no columns for.
 */
@Component({
  selector: 'app-schedule-agenda',
  imports: [DatePipe],
  templateUrl: './schedule-agenda.html',
  styleUrl: './schedule-agenda.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ScheduleAgenda {
  protected readonly myt = MYT_OFFSET;
  protected readonly phases = EVENT_SCHEDULE;
}
