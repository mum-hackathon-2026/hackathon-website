import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { EVENT_CONFIG } from '../../core/event/event-config';
import { EventTimeline } from '../../layout/event-timeline/event-timeline';
import { PageHeader } from '../../layout/page-header/page-header';

@Component({
  selector: 'app-timeline',
  imports: [EventTimeline, PageHeader],
  templateUrl: './timeline.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Timeline {
  private readonly config = inject(EVENT_CONFIG);

  protected readonly eventName = this.config.settings.eventName;
}
