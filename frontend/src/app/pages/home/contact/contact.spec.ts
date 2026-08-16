import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DEFAULT_EVENT_CONFIG, EVENT_CONFIG, EventConfig } from '../../../core/event/event-config';
import { ContactSection } from './contact';

const CONFIG: EventConfig = {
  ...DEFAULT_EVENT_CONFIG,
  site: {
    ...DEFAULT_EVENT_CONFIG.site,
    contactEmail: 'organisers@example.edu',
    discordUrl: 'https://discord.gg/example',
  },
};

describe('ContactSection', () => {
  let fixture: ComponentFixture<ContactSection>;

  function host(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function links(): HTMLAnchorElement[] {
    return Array.from(host().querySelectorAll<HTMLAnchorElement>('.contact__link'));
  }

  beforeEach(async () => {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [ContactSection],
      providers: [{ provide: EVENT_CONFIG, useValue: CONFIG }],
    }).compileComponents();
    fixture = TestBed.createComponent(ContactSection);
    await fixture.whenStable();
  });

  it('offers exactly the two ways in', () => {
    expect(links().length).toBe(2);
  });

  describe('email', () => {
    // Both the href and the visible text come from config, so the address
    // someone reads is the address the link opens.
    it('links the configured address as a mailto', () => {
      expect(links()[0].getAttribute('href')).toBe(`mailto:${CONFIG.site.contactEmail}`);
    });

    it('shows the address rather than hiding it behind "email us"', () => {
      expect(links()[0].textContent?.trim()).toBe(CONFIG.site.contactEmail);
    });
  });

  describe('Discord', () => {
    it('links the configured invite', () => {
      expect(links()[1].getAttribute('href')).toBe(CONFIG.site.discordUrl);
    });

    /*
     * Discord is off-site, so it opens in a new tab — and `rel="noopener"` is
     * what stops the opened page reaching back through `window.opener`.
     */
    it('opens off-site in a new tab, without handing it a window reference', () => {
      expect(links()[1].getAttribute('target')).toBe('_blank');
      expect(links()[1].getAttribute('rel')).toContain('noopener');
    });

    it('keeps the mail link in the same tab', () => {
      expect(links()[0].getAttribute('target')).toBeNull();
    });
  });

  // Both icons repeat what the link text already says.
  it('hides both icons from assistive technology', () => {
    const icons = host().querySelectorAll('.contact__icon');

    expect(icons.length).toBe(2);
    for (const icon of icons) {
      expect(icon.getAttribute('aria-hidden')).toBe('true');
    }
  });

  // The nav's "Contact" link jumps to this anchor; losing the id turns it into
  // a link that does nothing.
  it('anchors the section for the nav to jump to', () => {
    expect(host().querySelector('#contact')).toBeTruthy();
  });

  it('says what the organisers can help with', () => {
    expect(host().querySelector('.contact__heading')!.textContent?.trim()).toBe('Got a question?');
    expect(host().querySelector('.contact__blurb')!.textContent).toContain('accessibility');
  });
});
