import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Explains why something is unavailable, dimming whatever is projected into it
 * so people can still see what they would have been able to do.
 */
@Component({
  selector: 'app-state-locked',
  templateUrl: './state-locked.html',
  styleUrl: './state-locked.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StateLocked {
  readonly heading = input.required<string>();
  readonly reason = input<string>();
  /** Already formatted for display, so the caller decides the timezone. */
  readonly deadline = input<string>();
}
