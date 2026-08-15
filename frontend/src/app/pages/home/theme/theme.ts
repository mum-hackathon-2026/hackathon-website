import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { EVENT_CONFIG } from '../../../core/event/event-config';
import { EventSettingsService } from '../../../core/event/event-settings';

/** Rotating accent for the pillar top borders, in palette order. */
const ACCENTS = ['blue', 'green', 'red', 'yellow'] as const;

@Component({
  selector: 'app-home-theme',
  templateUrl: './theme.html',
  styleUrl: './theme.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ThemeSection {
  protected readonly config = inject(EVENT_CONFIG);
  private readonly settings = inject(EventSettingsService);

  /** Judging criteria carry the accents; the weights come straight from config. */
  protected readonly pillars = computed(() =>
    this.config.site.judgingCriteria.map((criterion, i) => ({
      ...criterion,
      accent: ACCENTS[i % ACCENTS.length],
    })),
  );

  protected readonly teamSize = computed(() => {
    const { minTeamSize, maxTeamSize } = this.settings.settings();
    return minTeamSize === 1
      ? `Teams can have up to ${maxTeamSize} members, and you may enter solo.`
      : `Teams can have ${minTeamSize} to ${maxTeamSize} members.`;
  });

  protected readonly trackList = computed(() => {
    const tracks = this.config.site.tracks;
    return tracks.slice(0, -1).join(', ') + ' and ' + tracks[tracks.length - 1];
  });
}
