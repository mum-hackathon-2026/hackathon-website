import { TestBed } from '@angular/core/testing';
import { SponsorsSection } from './sponsors';

describe('SponsorsSection', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [SponsorsSection] }).compileComponents();
  });

  it('renders a logo per sponsor across the tiers', async () => {
    const fixture = TestBed.createComponent(SponsorsSection);
    await fixture.whenStable();
    const host = fixture.nativeElement as HTMLElement;

    expect(host.querySelectorAll('.sponsors__tier').length).toBe(3);
    expect(host.querySelectorAll('.sponsors__logo').length).toBe(9);
  });

  it('falls back to initials when a logo fails to load', async () => {
    const fixture = TestBed.createComponent(SponsorsSection);
    await fixture.whenStable();
    const host = fixture.nativeElement as HTMLElement;

    const image = host.querySelector<HTMLImageElement>('.sponsors__logo-image');
    expect(image).toBeTruthy();
    const sponsorName = image!.alt;

    image!.dispatchEvent(new Event('error'));
    await fixture.whenStable();

    const fallback = host.querySelector<HTMLElement>('.sponsors__initials');
    expect(fallback).toBeTruthy();
    // The name survives the swap so the circle keeps an accessible label.
    expect(host.querySelector('.sponsors__logo')?.textContent).toContain(sponsorName);
  });
});
