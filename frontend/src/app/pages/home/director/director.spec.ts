import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DEFAULT_EVENT_CONFIG, EVENT_CONFIG, EventConfig } from '../../../core/event/event-config';
import { ORGANIZERS } from '../../../core/event/event-content';
import { DirectorSection } from './director';

const CONFIG: EventConfig = {
  ...DEFAULT_EVENT_CONFIG,
  site: {
    ...DEFAULT_EVENT_CONFIG.site,
    contactEmail: 'organisers@example.edu',
    discordUrl: 'https://discord.gg/example',
  },
};

describe('DirectorSection', () => {
  let fixture: ComponentFixture<DirectorSection>;

  function host(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function cards(): HTMLElement[] {
    return Array.from(host().querySelectorAll<HTMLElement>('.director__card'));
  }

  function textOf(card: HTMLElement, selector: string): string {
    return card.querySelector(selector)!.textContent!.trim();
  }

  function contactLinks(): HTMLAnchorElement[] {
    return Array.from(host().querySelectorAll<HTMLAnchorElement>('.director__contact-link'));
  }

  beforeEach(async () => {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [DirectorSection],
      providers: [{ provide: EVENT_CONFIG, useValue: CONFIG }],
    }).compileComponents();
    fixture = TestBed.createComponent(DirectorSection);
    await fixture.whenStable();
  });

  it('names the section', () => {
    expect(host().querySelector('h2')!.textContent).toContain('Contact');
  });

  it('shows every director the shared list names', () => {
    expect(cards().length).toBe(ORGANIZERS.length);
    expect(cards().map((card) => textOf(card, '.director__name'))).toEqual(
      ORGANIZERS.map((o) => o.name),
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
      const img = card.querySelector<HTMLImageElement>('.director__photo');
      const avatar = card.querySelector('.director__avatar');
      if (ORGANIZERS[i].avatarUrl) {
        expect(img).toBeTruthy();
        expect(img?.getAttribute('alt')).toBe(`${ORGANIZERS[i].name} portrait`);
      } else {
        expect(avatar).toBeTruthy();
        expect(avatar?.getAttribute('aria-hidden')).toBe('true');
      }
    });
  });

  it('marks the directors up as a list under one heading', () => {
    expect(host().querySelector('ul.director__grid')).toBeTruthy();
  });

  describe('the catch-all contact links', () => {
    it('offers exactly the two ways in', () => {
      expect(contactLinks().length).toBe(2);
    });

    describe('email', () => {
      it('links the configured address as a mailto', () => {
        expect(contactLinks()[0].getAttribute('href')).toBe(`mailto:${CONFIG.site.contactEmail}`);
      });

      it('shows the address rather than hiding it behind "email us"', () => {
        expect(contactLinks()[0].textContent?.trim()).toBe(CONFIG.site.contactEmail);
      });
    });

    describe('Discord', () => {
      it('links the configured invite', () => {
        expect(contactLinks()[1].getAttribute('href')).toBe(CONFIG.site.discordUrl);
      });

      /*
       * Discord is off-site, so it opens in a new tab — and `rel="noopener"` is
       * what stops the opened page reaching back through `window.opener`.
       */
      it('opens off-site in a new tab, without handing it a window reference', () => {
        expect(contactLinks()[1].getAttribute('target')).toBe('_blank');
        expect(contactLinks()[1].getAttribute('rel')).toContain('noopener');
      });

      it('keeps the mail link in the same tab', () => {
        expect(contactLinks()[0].getAttribute('target')).toBeNull();
      });
    });

    // Both icons repeat what the link text already says.
    it('hides both icons from assistive technology', () => {
      const icons = host().querySelectorAll('.director__contact-icon');

      expect(icons.length).toBe(2);
      for (const icon of icons) {
        expect(icon.getAttribute('aria-hidden')).toBe('true');
      }
    });

    it('anchors the section for a future "Contact" link to jump to', () => {
      expect(host().querySelector('#contact')).toBeTruthy();
    });
  });
});
