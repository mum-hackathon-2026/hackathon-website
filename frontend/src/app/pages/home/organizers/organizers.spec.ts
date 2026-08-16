import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ORGANIZERS } from '../../../core/event/event-content';
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

  /*
   * The homepage grid and the organisers page read one list, so the two cannot
   * name different people. Asserted against ORGANIZERS rather than a copy of
   * it, so adding a person here is a one-line change and not a two-file one.
   */
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

  // The grid is the short view: names and roles only. Emails, departments and
  // bios belong to the organisers page, where someone has gone looking for them.
  it('withholds the contact detail the organisers page carries', () => {
    for (const organizer of ORGANIZERS) {
      expect(host().textContent).not.toContain(organizer.email);
      expect(host().textContent).not.toContain(organizer.bio);
    }
  });

  it('accents each avatar from the person’s entry', () => {
    cards().forEach((card, i) => {
      const avatar = card.querySelector('.organizers__avatar')!;
      expect(avatar.classList.contains(`organizers__avatar--${ORGANIZERS[i].accent}`)).toBe(true);
    });
  });

  // The initials stand in for a photo, and the name is right beside them —
  // announcing both would read every organiser's name twice.
  it('hides the initials from assistive technology', () => {
    for (const card of cards()) {
      const avatar = card.querySelector('.organizers__avatar')!;
      expect(avatar.getAttribute('aria-hidden')).toBe('true');
    }
  });

  it('shows the initials the entry carries', () => {
    cards().forEach((card, i) => {
      expect(textOf(card, '.organizers__avatar')).toBe(ORGANIZERS[i].initials);
    });
  });

  it('marks the people up as a list under one heading', () => {
    expect(host().querySelector('ul.organizers__grid')).toBeTruthy();
    expect(host().querySelector('h2')!.textContent).toContain('The team making it happen.');
  });
});
