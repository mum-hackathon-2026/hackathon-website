import { ChangeDetectionStrategy, Component } from '@angular/core';
import { PARTNERS, Partner } from '../../../core/event/event-content';

@Component({
  selector: 'app-home-organizers',
  templateUrl: './organizers.html',
  styleUrl: './organizers.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OrganizersSection {
  /** Who runs the event institutionally. The people who staff it are app-home-director. */
  protected readonly partners = PARTNERS;
  /** Replicated partner list for the infinite auto-scrolling marquee track */
  protected readonly marqueePartners: readonly Partner[] = [
    ...PARTNERS,
    ...PARTNERS,
    ...PARTNERS,
    ...PARTNERS,
  ];
}
