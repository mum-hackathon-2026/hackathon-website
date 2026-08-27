import { ComponentFixture, TestBed } from '@angular/core/testing';
import { PARTNERS } from '../../../core/event/event-content';
import { OrganizersSection } from './organizers';

describe('OrganizersSection', () => {
  let fixture: ComponentFixture<OrganizersSection>;

  function host(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function partnerCards(): HTMLElement[] {
    return Array.from(
      host().querySelectorAll<HTMLElement>(
        '.organizers__marquee-group:not([aria-hidden]) .organizers__partner',
      ),
    );
  }

  beforeEach(async () => {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({ imports: [OrganizersSection] }).compileComponents();
    fixture = TestBed.createComponent(OrganizersSection);
    await fixture.whenStable();
  });

  it('names the section', () => {
    expect(host().querySelector('h2')!.textContent).toContain('Organizers');
  });

  it('names every partner through its logo alone', () => {
    const primaryCards = partnerCards().slice(0, PARTNERS.length);

    primaryCards.forEach((card, i) => {
      const img = card.querySelector<HTMLImageElement>('.organizers__partner-logo');
      expect(img?.getAttribute('alt')).toBe(`${PARTNERS[i].name} logo`);
      expect(card.textContent!.trim()).toBe('');
      expect(card.querySelector('.organizers__partner-role')).toBeNull();
      expect(card.querySelector('.organizers__partner-name')).toBeNull();
    });
  });

  it('repeats the whole list rather than part of it', () => {
    expect(partnerCards().length).toBeGreaterThanOrEqual(PARTNERS.length);
    expect(partnerCards().length % PARTNERS.length).toBe(0);
  });

  it('renders a logo for each partner', () => {
    const primaryCards = partnerCards().slice(0, PARTNERS.length);
    primaryCards.forEach((card, i) => {
      const img = card.querySelector<HTMLImageElement>('.organizers__partner-logo');
      expect(img).toBeTruthy();
      expect(img?.getAttribute('src')).toBe(PARTNERS[i].logo);
    });
  });
});
