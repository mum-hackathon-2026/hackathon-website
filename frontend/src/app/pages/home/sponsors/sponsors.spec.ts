import { TestBed } from '@angular/core/testing';
import { SPONSORS } from '../../../core/event/event-content';
import { SponsorsSection } from './sponsors';

describe('SponsorsSection', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [SponsorsSection] }).compileComponents();
  });

  it('renders marquee sponsor cards linking to the sponsor website', async () => {
    const fixture = TestBed.createComponent(SponsorsSection);
    await fixture.whenStable();
    const host = fixture.nativeElement as HTMLElement;

    const cards = host.querySelectorAll<HTMLAnchorElement>('.sponsors__card');
    expect(cards.length).toBeGreaterThan(0);

    const firstCard = cards[0];
    expect(firstCard.href).toContain('averis.com');
    expect(firstCard.target).toBe('_blank');
    expect(firstCard.rel).toContain('noopener');

    const logos = host.querySelectorAll<HTMLImageElement>('.sponsors__logo');
    expect(logos.length).toBeGreaterThan(0);
    expect(logos[0].alt).toBe('Averis');
  });

  it('falls back to a wordmark when the logo file fails to load', async () => {
    const fixture = TestBed.createComponent(SponsorsSection);
    await fixture.whenStable();
    const host = fixture.nativeElement as HTMLElement;

    const image = host.querySelector<HTMLImageElement>('.sponsors__logo');
    expect(image).toBeTruthy();
    const sponsorName = image!.alt;

    image!.dispatchEvent(new Event('error'));
    await fixture.whenStable();

    expect(host.querySelector('.sponsors__logo')).toBeNull();
    expect(host.querySelector<HTMLElement>('.sponsors__wordmark')?.textContent?.trim()).toBe(
      sponsorName,
    );
  });
});
