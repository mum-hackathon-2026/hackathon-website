import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { AdminStats } from '../../../core/admin/admin';

/** The event at a glance: four counts and how far judging has got. */
@Component({
  selector: 'app-event-stats',
  templateUrl: './event-stats.html',
  styleUrl: './event-stats.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EventStats {
  readonly stats = input.required<AdminStats>();
  /** Judging progress means nothing before an organiser opens judging. */
  readonly judgingOpen = input.required<boolean>();
}
