import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { EVENT_CONFIG } from '../../core/event/event-config';
import { EventSettingsService } from '../../core/event/event-settings';
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
  private readonly settings = inject(EventSettingsService);

  protected readonly eventName = this.settings.eventName;
}
