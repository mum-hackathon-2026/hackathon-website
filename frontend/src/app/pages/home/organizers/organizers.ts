import { ChangeDetectionStrategy, Component } from '@angular/core';

interface Organizer {
  readonly name: string;
  readonly role: string;
  readonly initials: string;
  /** Modifier suffix for the avatar colour pair, see organizers.scss. */
  readonly accent: 'blue' | 'green' | 'red' | 'yellow';
}

/** Placeholder people from the design — the real committee comes from the API later. */
const ORGANIZERS: readonly Organizer[] = [
  { name: 'Mei-Lin Zhao', role: 'Event Director', initials: 'MZ', accent: 'blue' },
  { name: 'Rohan Patel', role: 'Sponsorship Lead', initials: 'RP', accent: 'green' },
  { name: 'Sofia Andersen', role: 'Logistics', initials: 'SA', accent: 'red' },
  { name: 'Kwame Asante', role: 'Judging Coordinator', initials: 'KA', accent: 'yellow' },
  { name: 'Yuki Tanaka', role: 'Marketing', initials: 'YT', accent: 'blue' },
  { name: 'Caitlin Murphy', role: 'Participant Experience', initials: 'CM', accent: 'green' },
];

@Component({
  selector: 'app-home-organizers',
  templateUrl: './organizers.html',
  styleUrl: './organizers.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OrganizersSection {
  protected readonly organizers = ORGANIZERS;
}
