import { ChangeDetectionStrategy, Component } from '@angular/core';
import { ORGANIZERS } from '../../../core/event/event-content';

@Component({
  selector: 'app-home-organizers',
  templateUrl: './organizers.html',
  styleUrl: './organizers.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OrganizersSection {
  protected readonly organizers = ORGANIZERS;
}
