import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { DEFAULT_EVENT_CONFIG, EVENT_CONFIG } from '../../../core/event/event-config';
import { EventSettingsService } from '../../../core/event/event-settings';
import { HomeFooter } from './footer';

describe('HomeFooter', () => {
  let fixture: ComponentFixture<HomeFooter>;

  function host(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function credit(): string {
    return host().querySelector('.footer__credit')!.textContent!.replace(/\s+/g, ' ').trim();
  }

  beforeEach(async () => {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [HomeFooter],
      providers: [
        provideRouter([]),
        { provide: EVENT_CONFIG, useValue: DEFAULT_EVENT_CONFIG },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(HomeFooter);
    await fixture.whenStable();
  });

  it('credits the event and the organisers behind it', () => {
    expect(credit()).toBe(
      `© ${DEFAULT_EVENT_CONFIG.settings.eventName}. ${DEFAULT_EVENT_CONFIG.site.organisedBy}.`,
    );
  });

  /*
   * The name reads from EventSettingsService, not the token — an organiser can
   * rename the event, and the footer has to follow. Snapshotting it into a
   * plain field would leave every page footed with the old name.
   */
  it('follows a rename rather than holding the name it started with', async () => {
    const result = await TestBed.inject(EventSettingsService).update({
      eventName: 'Monash Hackathon 2027',
    });
    expect(result.ok, 'renaming the event should be accepted').toBe(true);
    await fixture.whenStable();

    expect(credit()).toContain('Monash Hackathon 2027');
  });

  it('is marked up as the page footer', () => {
    expect(host().querySelector('footer')).toBeTruthy();
  });

  // Decoration beside text that already says whose event this is.
  it('hides the wordmark from assistive technology', () => {
    expect(host().querySelector('.footer__mark')!.getAttribute('aria-hidden')).toBe('true');
  });

  it('carries the tagline', () => {
    expect(host().querySelector('.footer__tagline')!.textContent?.trim()).toBe(
      'A student-run event.',
    );
  });
});
