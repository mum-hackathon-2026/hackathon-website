import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Sends someone off to a Google Form.
 *
 * Registration and project submission both happen on Forms rather than on the
 * site, so the two participant pages have the same shape: explain what the form
 * is for, link to it, and say what happens once it is filled in. This is that
 * block, shared so the pages cannot drift apart.
 *
 * The link opens in a new tab because the form is somebody else's site and
 * losing this page to it would strand a signed-in participant.
 */
@Component({
  selector: 'app-form-link-card',
  templateUrl: './form-link-card.html',
  styleUrl: './form-link-card.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FormLinkCard {
  readonly heading = input.required<string>();
  readonly description = input<string>();
  readonly href = input.required<string>();
  readonly buttonLabel = input.required<string>();
  /** What happens after the form is submitted — the sync is not instant. */
  readonly note = input<string>();
}
