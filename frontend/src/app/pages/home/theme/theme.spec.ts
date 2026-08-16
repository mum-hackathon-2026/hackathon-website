import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DEFAULT_EVENT_CONFIG, EVENT_CONFIG, EventConfig } from '../../../core/event/event-config';
import { EventSettingsService } from '../../../core/event/event-settings';
import { ThemeSection } from './theme';

/**
 * `tracks` is overridable because the blurb's wording depends on how many there
 * are, and the shipped config has exactly three — the count that hides both of
 * the shapes this component used to get wrong.
 */
async function render(
  overrides: Partial<EventConfig['settings']> = {},
  tracks: readonly string[] = DEFAULT_EVENT_CONFIG.site.tracks,
) {
  TestBed.resetTestingModule();
  await TestBed.configureTestingModule({
    imports: [ThemeSection],
    providers: [
      {
        provide: EVENT_CONFIG,
        useValue: {
          ...DEFAULT_EVENT_CONFIG,
          site: { ...DEFAULT_EVENT_CONFIG.site, tracks },
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

    // The weights come straight from config, so the homepage cannot advertise a
    // breakdown the judging pages score against differently.
    it('states each criterion’s share of the final score', async () => {
      const fixture = await render();

      expect(
        pillars(fixture).map((p) => p.querySelector('.theme__pillar-desc')!.textContent!.trim()),
      ).toEqual(
        DEFAULT_EVENT_CONFIG.site.judgingCriteria.map((c) => `${c.weight}% of the final score`),
      );
    });

    /*
     * The accents cycle through the four-colour palette rather than being fixed
     * per criterion, so a fifth criterion wraps back to the first colour instead
     * of rendering unstyled.
     */
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

  describe('the blurb', () => {
    it('names every track', async () => {
      const fixture = await render();

      for (const track of DEFAULT_EVENT_CONFIG.site.tracks) {
        expect(blurb(fixture)).toContain(track);
      }
    });

    // Written as a sentence, not a bare join: the last track is joined with
    // "and" so the copy reads rather than listing.
    it('joins the tracks into a readable list', async () => {
      const fixture = await render();
      const tracks = DEFAULT_EVENT_CONFIG.site.tracks;

      expect(blurb(fixture)).toContain(
        `${tracks.slice(0, -1).join(', ')} and ${tracks[tracks.length - 1]}`,
      );
    });

    /*
     * The three cases below are the ones the shipped three-track config hides.
     * Both bugs they cover were live in the markup and unreachable in practice,
     * which is exactly why they went unnoticed: `tracks` is config, so the
     * blurb has to read correctly at any length rather than at today's.
     */
    it('does not state a count the track list could contradict', async () => {
      const fixture = await render({}, [
        'Open Innovation',
        'Sustainability',
        'HealthTech',
        'FinTech',
      ]);

      // The old copy said "one of three tracks" beside a list of however many
      // were configured, so a fourth track made the sentence wrong.
      expect(blurb(fixture)).toContain('HealthTech and FinTech');
      expect(blurb(fixture)).not.toContain('three');
    });

    it('drops the "and" clause when there is only one track', async () => {
      const fixture = await render({}, ['Open Innovation']);

      expect(blurb(fixture)).toContain('Pick a track — Open Innovation — and build');
      // The old join produced "— and Open Innovation —": an "and" with an
      // empty first clause in front of it.
      expect(blurb(fixture)).not.toContain('and Open Innovation');
    });

    it('joins exactly two tracks with "and" and no comma', async () => {
      const fixture = await render({}, ['Open Innovation', 'HealthTech']);

      expect(blurb(fixture)).toContain('Open Innovation and HealthTech');
      expect(blurb(fixture)).not.toContain('Open Innovation, HealthTech');
    });

    it('leaves the aside out entirely when no tracks are configured', async () => {
      const fixture = await render({}, []);

      expect(blurb(fixture)).toContain('Pick a track and build');
      expect(blurb(fixture)).not.toContain('—');
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
     * The team size reads from EventSettingsService, not the token, so an
     * organiser raising the cap has to change this copy too. Snapshotting it
     * into a field would leave the homepage advertising the old limit.
     */
    it('follows the settings when an organiser changes the limits', async () => {
      const fixture = await render();
      expect(blurb(fixture)).toContain('up to 4 members');

      const result = await TestBed.inject(EventSettingsService).update({ maxTeamSize: 6 });
      expect(result.ok, 'raising the cap should be accepted').toBe(true);
      await fixture.whenStable();

      expect(blurb(fixture)).toContain('up to 6 members');
    });
  });
});
