import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { EventSettingsService } from '../../../core/event/event-settings';
import { SPONSORS, Sponsor } from '../../../core/event/event-content';

@Component({
  selector: 'app-home-sponsors',
  templateUrl: './sponsors.html',
  styleUrl: './sponsors.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SponsorsSection {
  protected readonly sponsors = SPONSORS;

  /** The signal itself, not a snapshot — an admin rename has to reach the thank-you line. */
  protected readonly eventName = inject(EventSettingsService).eventName;

  /** Sponsors whose logo file failed to load, so we can fall back to a wordmark. */
  private readonly missingLogos = signal(new Set<string>());

  protected hasLogo(sponsor: Sponsor): boolean {
    return !this.missingLogos().has(sponsor.name);
  }

  protected onLogoError(sponsor: Sponsor): void {
    // A new Set rather than a mutation, so the signal actually notifies OnPush.
    this.missingLogos.update((current) => new Set(current).add(sponsor.name));
  }
}
