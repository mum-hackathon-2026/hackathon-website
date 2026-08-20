import { ChangeDetectionStrategy, Component } from '@angular/core';
import { EVENT_PURPOSE, EVENT_SCALE } from '../../../core/event/event-content';

/**
 * What the event is for, and how big it is.
 *
 * Sits between the theme and the FAQ: the theme says what you would build, this
 * says why it is worth your eight days, and the FAQ answers the rest.
 */
@Component({
  selector: 'app-home-purpose',
  templateUrl: './purpose.html',
  styleUrl: './purpose.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PurposeSection {
  protected readonly purpose = EVENT_PURPOSE;
  protected readonly scale = EVENT_SCALE;
}
