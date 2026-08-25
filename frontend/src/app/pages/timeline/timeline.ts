import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { EVENT_CONFIG } from '../../core/event/event-config';
import { EventSettingsService } from '../../core/event/event-settings';
import { EventTrack } from '../../layout/event-track/event-track';
import { PageHeader } from '../../layout/page-header/page-header';

@Component({
  selector: 'app-timeline',
  imports: [EventTrack, PageHeader],
  templateUrl: './timeline.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Timeline {
  private readonly config = inject(EVENT_CONFIG);
  private readonly settings = inject(EventSettingsService);

  protected readonly eventName = this.settings.eventName;
}
