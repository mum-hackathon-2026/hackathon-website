import { TestBed } from '@angular/core/testing';
import { SPONSORS } from '../../../core/event/event-content';
import { SponsorsSection } from './sponsors';

describe('SponsorsSection', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [SponsorsSection] }).compileComponents();
  });

  it('renders a mark per sponsor, naming each one', async () => {
    const fixture = TestBed.createComponent(SponsorsSection);
    await fixture.whenStable();
    const host = fixture.nativeElement as HTMLElement;

    // Against the constant rather than a literal, so adding a sponsor cannot
    // leave a stale expectation passing.
    expect(host.querySelectorAll('.sponsors__mark').length).toBe(SPONSORS.length);

    const names = [...host.querySelectorAll<HTMLImageElement>('.sponsors__logo')].map(
      (logo) => logo.alt,
    );
    expect(names).toEqual(SPONSORS.map((sponsor) => sponsor.name));
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
    // The visible wordmark is aria-hidden, so the name has to survive elsewhere.
    expect(host.querySelector('.sponsors__mark')?.textContent).toContain(sponsorName);
  });
});
