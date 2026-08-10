import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { SPONSOR_TIERS, Sponsor } from '../../../core/event/event-content';

@Component({
  selector: 'app-home-sponsors',
  templateUrl: './sponsors.html',
  styleUrl: './sponsors.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SponsorsSection {
  protected readonly tiers = SPONSOR_TIERS;

  /** Domains whose logo failed to load, so we can fall back to initials. */
  private readonly missingLogos = signal(new Set<string>());

  protected logoUrl(sponsor: Sponsor): string {
    return `https://logo.clearbit.com/${sponsor.domain}`;
  }

  protected hasLogo(sponsor: Sponsor): boolean {
    return !this.missingLogos().has(sponsor.domain);
  }

  protected onLogoError(sponsor: Sponsor): void {
    this.missingLogos.update((current) => new Set(current).add(sponsor.domain));
  }
}
