import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { EVENT_CONFIG } from '../../../core/event/event-config';
import { ORGANIZERS } from '../../../core/event/event-content';

@Component({
  selector: 'app-home-director',
  templateUrl: './director.html',
  styleUrl: './director.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DirectorSection {
  /** Both people who run the event day to day, and how to reach either of them. */
  protected readonly directors = ORGANIZERS;
  /** For the catch-all email and Discord links below the cards. */
  protected readonly site = inject(EVENT_CONFIG).site;
}
