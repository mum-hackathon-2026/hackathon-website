import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { EVENT_CONFIG } from '../../../core/event/event-config';
import { EventSettingsService } from '../../../core/event/event-settings';

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
   *
   * No colour here. Rank decides it and rank is position, so the stylesheet
   * assigns it by `nth-child` — which is also what guarantees a segment in the
   * track and its row below always agree, without the two being wired together.
   */
  protected readonly pillars = computed(() => {
    const ranked = [...this.config.site.judgingCriteria].sort((a, b) => b.weight - a.weight);
    const heaviest = Math.max(...ranked.map((criterion) => criterion.weight), 1);

    return ranked.map((criterion) => ({
      ...criterion,
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
