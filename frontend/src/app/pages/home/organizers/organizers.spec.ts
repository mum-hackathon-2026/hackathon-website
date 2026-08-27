import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ORGANIZERS, PARTNERS } from '../../../core/event/event-content';
import { OrganizersSection } from './organizers';

describe('OrganizersSection', () => {
  let fixture: ComponentFixture<OrganizersSection>;

  function host(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function cards(): HTMLElement[] {
    return Array.from(host().querySelectorAll<HTMLElement>('.organizers__card'));
  }

  function textOf(card: HTMLElement, selector: string): string {
    return card.querySelector(selector)!.textContent!.trim();
  }

  beforeEach(async () => {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({ imports: [OrganizersSection] }).compileComponents();
    fixture = TestBed.createComponent(OrganizersSection);
    await fixture.whenStable();
  });

  it('shows every organiser the shared list names', () => {
    expect(cards().length).toBe(ORGANIZERS.length);
    expect(cards().map((card) => textOf(card, '.organizers__name'))).toEqual(
      ORGANIZERS.map((o) => o.name),
    );
  });

  it('names each person’s role beside them', () => {
    expect(cards().map((card) => textOf(card, '.organizers__role'))).toEqual(
      ORGANIZERS.map((o) => o.role),
    );
  });

  it('displays real contact details and LinkedIn profile buttons', () => {
    for (const organizer of ORGANIZERS) {
      if (organizer.email) {
        expect(host().textContent).toContain(organizer.email);
      }
      if (organizer.phone) {
        expect(host().textContent).toContain(organizer.phone);
      }
    }
    const linkedinBtns = host().querySelectorAll('.btn-linkedin');
    expect(linkedinBtns.length).toBe(ORGANIZERS.length);
  });

  it('renders photos or initials avatars with proper accessibility attributes', () => {
    cards().forEach((card, i) => {
      const img = card.querySelector<HTMLImageElement>('.organizers__photo');
      const avatar = card.querySelector('.organizers__avatar');
      if (ORGANIZERS[i].avatarUrl) {
        expect(img).toBeTruthy();
        expect(img?.getAttribute('alt')).toBe(`${ORGANIZERS[i].name} portrait`);
      } else {
        expect(avatar).toBeTruthy();
        expect(avatar?.getAttribute('aria-hidden')).toBe('true');
      }
    });
  });

  it('marks the people up as a list under one heading', () => {
    expect(host().querySelector('ul.organizers__grid')).toBeTruthy();
    expect(host().querySelector('h2')!.textContent).toContain('Who runs it.');
  });

  describe('partners', () => {
    function partnerCards(): HTMLElement[] {
      return Array.from(
        host().querySelectorAll<HTMLElement>(
          '.organizers__marquee-group:not([aria-hidden]) .organizers__partner',
        ),
      );
    }

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

    it('puts the organising bodies above the individual people', () => {
      const partners = host().querySelector('.organizers__marquee')!;
      const grid = host().querySelector('.organizers__grid')!;

      expect(
        partners.compareDocumentPosition(grid) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    });
  });
});
