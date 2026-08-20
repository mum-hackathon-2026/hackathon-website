import { ChangeDetectionStrategy, Component } from '@angular/core';
import { ORGANIZERS, PARTNERS } from '../../../core/event/event-content';

@Component({
  selector: 'app-home-organizers',
  templateUrl: './organizers.html',
  styleUrl: './organizers.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OrganizersSection {
  protected readonly organizers = ORGANIZERS;
  /** Who runs the event, above the individual people who staff it. */
  protected readonly partners = PARTNERS;
}
