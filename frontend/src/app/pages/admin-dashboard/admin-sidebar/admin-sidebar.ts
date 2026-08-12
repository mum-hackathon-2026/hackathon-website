import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { SECTIONS, SectionId } from '../../../core/admin/admin';

/**
 * The workspace's section list.
 *
 * Entries are `routerLink`s rather than buttons, so a section is a real address
 * a colleague can be sent — the whole reason the route carries `:section`.
 */
@Component({
  selector: 'app-admin-sidebar',
  imports: [RouterLink, RouterLinkActive],
  templateUrl: './admin-sidebar.html',
  styleUrl: './admin-sidebar.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminSidebar {
  readonly eventName = input.required<string>();
  readonly badges = input.required<Partial<Record<SectionId, number>>>();
  /** Drives the mobile drawer; ignored from tablet width up. */
  readonly open = input.required<boolean>();

  readonly dismissed = output<void>();

  protected readonly sections = SECTIONS;
}
