import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DEFAULT_EVENT_CONFIG, EVENT_CONFIG, EventConfig } from '../../../core/event/event-config';
import { EventSettingsService } from '../../../core/event/event-settings';
import { ThemeSection } from './theme';

async function render(overrides: Partial<EventConfig['settings']> = {}) {
  TestBed.resetTestingModule();
  await TestBed.configureTestingModule({
    imports: [ThemeSection],
    providers: [
      {
        provide: EVENT_CONFIG,
        useValue: {
          ...DEFAULT_EVENT_CONFIG,
          settings: { ...DEFAULT_EVENT_CONFIG.settings, ...overrides },
        },
      },
    ],
  }).compileComponents();

  const fixture = TestBed.createComponent(ThemeSection);
  await fixture.whenStable();
  return fixture;
}

describe('ThemeSection', () => {
  function host(fixture: ComponentFixture<ThemeSection>): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function pillars(fixture: ComponentFixture<ThemeSection>): HTMLElement[] {
    return Array.from(host(fixture).querySelectorAll<HTMLElement>('.theme__pillar'));
  }

  function blurb(fixture: ComponentFixture<ThemeSection>): string {
    return host(fixture).querySelector('.theme__blurb')!.textContent!.replace(/\s+/g, ' ').trim();
  }

  describe('the judging pillars', () => {
    it('shows one pillar per configured criterion', async () => {
      const fixture = await render();

      expect(
        pillars(fixture).map((p) => p.querySelector('.theme__pillar-name')!.textContent!.trim()),
      ).toEqual(DEFAULT_EVENT_CONFIG.site.judgingCriteria.map((c) => c.name));
    });

    it('states each criterion’s share of the final score', async () => {
      const fixture = await render();

      expect(
        pillars(fixture).map((p) => p.querySelector('.theme__pillar-desc')!.textContent!.trim()),
      ).toEqual(
        DEFAULT_EVENT_CONFIG.site.judgingCriteria.map((c) => `${c.weight}% of the final score`),
      );
    });

    it('cycles the palette so any number of criteria stays styled', async () => {
      const fixture = await render();
      const accents = ['blue', 'green', 'red', 'yellow'];

      pillars(fixture).forEach((pillar, i) => {
        expect(pillar.classList.contains(`theme__pillar--${accents[i % accents.length]}`)).toBe(
          true,
        );
      });
    });
  });

  describe('the blurb and classified status', () => {
    it('states that the problem statement is classified', async () => {
      const fixture = await render();

      expect(host(fixture).querySelector('.theme__title')?.textContent).toContain('Classified');
      expect(blurb(fixture)).toContain('Averis sets a single industry problem statement');
      expect(blurb(fixture)).toContain('sealed until the opening ceremony');
      // The section used to promise tracks; one brief now, for everyone.
      expect(blurb(fixture)).toContain('no separate tracks');
    });

    it('says solo entries are allowed when the minimum is one', async () => {
      const fixture = await render({ minTeamSize: 1, maxTeamSize: 4 });

      expect(blurb(fixture)).toContain('up to 4 members, and you may enter solo');
    });

    it('states the range instead once solo entries are not allowed', async () => {
      const fixture = await render({ minTeamSize: 2, maxTeamSize: 5 });

      expect(blurb(fixture)).toContain('Teams can have 2 to 5 members.');
      expect(blurb(fixture)).not.toContain('solo');
    });

    it('follows the settings when an organiser changes the limits', async () => {
      const fixture = await render();
      expect(blurb(fixture)).toContain('2 to 5 members');

      const result = await TestBed.inject(EventSettingsService).update({ maxTeamSize: 6 });
      expect(result.ok, 'raising the cap should be accepted').toBe(true);
      await fixture.whenStable();

      expect(blurb(fixture)).toContain('2 to 6 members');
    });
  });
});
