import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** Standard page title block: optional eyebrow, title, optional subtitle, rule beneath. */
@Component({
  selector: 'app-page-header',
  templateUrl: './page-header.html',
  styleUrl: './page-header.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PageHeader {
  readonly eyebrow = input<string>();
  readonly title = input.required<string>();
  readonly subtitle = input<string>();
}
