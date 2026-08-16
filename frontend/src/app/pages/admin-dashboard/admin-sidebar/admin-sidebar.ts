import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { SECTIONS, SectionId } from '../../../core/admin/admin';

/**
 * The workspace's section list.
 *
 * Entries are `routerLink`s rather than buttons, so a section is a real address
 * a colleague can be sent — the whole reason the route carries `:section`.
 *
 * Escape closes the drawer, matching `NavBar`'s mobile drawer. Without it the
 * scrim was the only way out that did not involve navigating somewhere, which
 * left a keyboard user stuck with it open.
 */
@Component({
  selector: 'app-admin-sidebar',
  imports: [RouterLink, RouterLinkActive],
  templateUrl: './admin-sidebar.html',
  styleUrl: './admin-sidebar.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(document:keydown.escape)': 'onEscape()',
  },
})
export class AdminSidebar {
  readonly eventName = input.required<string>();
  readonly badges = input.required<Partial<Record<SectionId, number>>>();
  /** Drives the mobile drawer; ignored from tablet width up. */
  readonly open = input.required<boolean>();

  readonly dismissed = output<void>();

  protected readonly sections = SECTIONS;

  /** Only when it is actually open, so Escape elsewhere on the page is not swallowed. */
  protected onEscape(): void {
    if (this.open()) this.dismissed.emit();
  }
}
