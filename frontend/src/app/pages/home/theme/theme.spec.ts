import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DEFAULT_EVENT_CONFIG, EVENT_CONFIG, EventConfig } from '../../../core/event/event-config';
import { EventSettingsService } from '../../../core/event/event-settings';
import { ThemeSection } from './theme';

async function render(
  overrides: Partial<EventConfig['settings']> = {},
  siteOverrides: Partial<EventConfig['site']> = {},
) {
  TestBed.resetTestingModule();
  await TestBed.configureTestingModule({
    imports: [ThemeSection],
    providers: [
      {
        provide: EVENT_CONFIG,
        useValue: {
          ...DEFAULT_EVENT_CONFIG,
          settings: { ...DEFAULT_EVENT_CONFIG.settings, ...overrides },
          site: { ...DEFAULT_EVENT_CONFIG.site, ...siteOverrides },
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
    /** Config order is not display order: the chart ranks by weight. */
    const ranked = [...DEFAULT_EVENT_CONFIG.site.judgingCriteria].sort(
      (a, b) => b.weight - a.weight,
    );

    it('shows one pillar per configured criterion, heaviest first', async () => {
      const fixture = await render();

      expect(
        pillars(fixture).map((p) => p.querySelector('.theme__pillar-name')!.textContent!.trim()),
      ).toEqual(ranked.map((c) => c.name));
    });

    it('states each criterion’s share of the final score', async () => {
      const fixture = await render();

      expect(
        pillars(fixture).map((p) => p.querySelector('.theme__pillar-desc')!.textContent!.trim()),
      ).toEqual(ranked.map((c) => `${c.weight}% of the final score`));
    });

    // The reader's question is "what counts most", and config order does not
    // answer it. Descending weight does.
    it('never puts a lighter criterion above a heavier one', async () => {
      const fixture = await render();

      const shown = pillars(fixture).map((p) =>
        Number(/(\d+)%/.exec(p.querySelector('.theme__pillar-desc')!.textContent!)![1]),
      );

      expect(shown).toEqual([...shown].sort((a, b) => b - a));
    });

    /**
     * The bar is measured against the heaviest criterion, so the top one fills
     * its track and the rest read against it. The old code multiplied the
     * weight by a constant 4, which is the same thing only while nothing is
     * weighted above 25 — past that it overflowed the track silently.
     */
    it('scales the bars against the heaviest criterion, whatever it weighs', async () => {
      const fixture = await render(
        {},
        {
          judgingCriteria: [
            { name: 'Dominant', weight: 60 },
            { name: 'Middle', weight: 30 },
            { name: 'Small', weight: 10 },
          ],
        },
      );

      const shares = pillars(fixture).map((p) =>
        (p.querySelector('.theme__pillar-bar') as HTMLElement).style.getPropertyValue('--share'),
      );

      expect(shares).toEqual(['100%', '50%', '16.666666666666664%']);
    });
  });

  describe('the blurb and sealed status', () => {
    it('states that the problem statement is not out yet', async () => {
      const fixture = await render();

      expect(host(fixture).querySelector('.theme__title')?.textContent).toContain(
        'Theme & Problem Statement',
      );
      expect(host(fixture).querySelector('.theme__subtitle')?.textContent).toContain(
        'Revealed at the opening ceremony',
      );
      expect(blurb(fixture)).toContain('Averis sets one industry problem statement');
      expect(blurb(fixture)).toContain('sealed until the opening ceremony');
      // The section used to promise tracks; one brief now, for everyone.
      expect(blurb(fixture)).toContain('no tracks to choose between');
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

    /*
     * Renders on the real default config (2-5) rather than pinning a range, so
     * this keeps measuring what it is named for: the blurb follows the live
     * settings signal. The two tests above pin each branch of the wording.
     */
    it('follows the settings when an organiser changes the limits', async () => {
      const fixture = await render();
      expect(blurb(fixture)).toContain('Teams can have 2 to 5 members.');

      const result = await TestBed.inject(EventSettingsService).update({ maxTeamSize: 6 });
      expect(result.ok, 'raising the cap should be accepted').toBe(true);
      await fixture.whenStable();

      expect(blurb(fixture)).toContain('Teams can have 2 to 6 members.');
    });
  });
});
