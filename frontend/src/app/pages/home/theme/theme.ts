import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { EVENT_CONFIG } from '../../../core/event/event-config';
import { EventSettingsService } from '../../../core/event/event-settings';

/**
 * Accent per rank, in palette order.
 *
 * Assigned after sorting, so the colours run in weight order and the heaviest
 * criterion is always the same colour. There are more criteria than accents, so
 * a colour repeats further down the list — which is why nothing is identified
 * by colour alone here; every row carries its own name and figure.
 */
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

  /**
   * The criteria as a chart: heaviest first, each with the share of the track
   * its bar should fill.
   *
   * Sorted because the question a reader actually has is "what counts most",
   * and config order does not answer it — they would have to read all seven
   * figures and rank them by hand.
   *
   * `share` is measured against the heaviest criterion rather than against 100,
   * so the longest bar is full and the rest read against it. That is what the
   * old `weight * 4` was doing, but as a constant that happened to equal
   * 100/25: it silently overflowed the track the moment any criterion was
   * weighted above 25. Derived from the data, it cannot.
   */
  protected readonly pillars = computed(() => {
    const ranked = [...this.config.site.judgingCriteria].sort((a, b) => b.weight - a.weight);
    const heaviest = Math.max(...ranked.map((criterion) => criterion.weight), 1);

    return ranked.map((criterion, i) => ({
      ...criterion,
      accent: ACCENTS[i % ACCENTS.length],
      share: (criterion.weight / heaviest) * 100,
    }));
  });

  protected readonly teamSize = computed(() => {
    const { minTeamSize, maxTeamSize } = this.settings.settings();
    return minTeamSize === 1
      ? `Teams can have up to ${maxTeamSize} members, and you may enter solo.`
      : `Teams can have ${minTeamSize} to ${maxTeamSize} members.`;
  });
}
