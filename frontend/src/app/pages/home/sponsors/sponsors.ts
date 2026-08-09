import { ChangeDetectionStrategy, Component, signal } from '@angular/core';

interface Sponsor {
  readonly name: string;
  /** Used to fetch the logo, and as the identity key for the fallback. */
  readonly domain: string;
  readonly initials: string;
  readonly color: string;
  readonly background: string;
}

interface SponsorTier {
  readonly name: string;
  /** Modifier suffix driving circle size and spacing, see sponsors.scss. */
  readonly key: 'platinum' | 'gold' | 'silver';
  readonly sponsors: readonly Sponsor[];
}

/** Placeholder line-up from the design — real sponsors come from the API later. */
const TIERS: readonly SponsorTier[] = [
  {
    name: 'Platinum',
    key: 'platinum',
    sponsors: [
      {
        name: 'Atlassian',
        domain: 'atlassian.com',
        initials: 'AT',
        color: '#0052CC',
        background: '#E6F0FF',
      },
      {
        name: 'Google',
        domain: 'google.com',
        initials: 'G',
        color: '#4285F4',
        background: '#E8F0FE',
      },
    ],
  },
  {
    name: 'Gold',
    key: 'gold',
    sponsors: [
      {
        name: 'Canva',
        domain: 'canva.com',
        initials: 'CV',
        color: '#7D2AE8',
        background: '#F3E8FF',
      },
      {
        name: 'Seek',
        domain: 'seek.com.au',
        initials: 'SK',
        color: '#1A1A2E',
        background: '#F0F0F0',
      },
      {
        name: 'REA Group',
        domain: 'rea-group.com',
        initials: 'RE',
        color: '#E4003B',
        background: '#FFE4EC',
      },
    ],
  },
  {
    name: 'Silver',
    key: 'silver',
    sponsors: [
      {
        name: 'Xero',
        domain: 'xero.com',
        initials: 'XE',
        color: '#13B5EA',
        background: '#E3F7FD',
      },
      {
        name: 'Buildkite',
        domain: 'buildkite.com',
        initials: 'BK',
        color: '#14CC80',
        background: '#E3FBF0',
      },
      {
        name: 'CultureAmp',
        domain: 'cultureamp.com',
        initials: 'CA',
        color: '#FF4E50',
        background: '#FFE8E8',
      },
      {
        name: 'Carsales',
        domain: 'carsales.com.au',
        initials: 'CS',
        color: '#E30613',
        background: '#FFE4E4',
      },
    ],
  },
];

@Component({
  selector: 'app-home-sponsors',
  templateUrl: './sponsors.html',
  styleUrl: './sponsors.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SponsorsSection {
  protected readonly tiers = TIERS;

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
