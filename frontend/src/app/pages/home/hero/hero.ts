import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { EVENT_CONFIG, MYT_OFFSET } from '../../../core/event/event-config';
import { PhaseService } from '../../../core/event/phase';

const MS_PER_SECOND = 1000;
const MS_PER_MINUTE = 60 * MS_PER_SECOND;
const MS_PER_HOUR = 60 * MS_PER_MINUTE;
const MS_PER_DAY = 24 * MS_PER_HOUR;

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

@Component({
  selector: 'app-home-hero',
  imports: [DatePipe, RouterLink],
  templateUrl: './hero.html',
  styleUrl: './hero.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Hero {
  private readonly phaseService = inject(PhaseService);

  protected readonly config = inject(EVENT_CONFIG);
  protected readonly myt = MYT_OFFSET;

  protected readonly phase = this.phaseService.phase;
  protected readonly milestone = this.phaseService.nextMilestone;

  protected readonly isRegistrationClosed = computed(() => {
    const p = this.phase();
    return p !== 'before-registration' && p !== 'registration';
  });

  protected readonly isResultsPhase = computed(() => this.phase() === 'results');

  /** Short status for the badge, following the phase rather than a fixed string. */
  protected readonly status = computed(() => {
    switch (this.phase()) {
      case 'before-registration':
        return 'Registrations open soon';
      case 'registration':
        return 'Registrations open · Problem Statement soon';
      case 'submission':
        return 'Building period · Submissions open';
      case 'judging':
        return 'Preliminary judging under way';
      case 'results':
        return 'Preliminary results announced';
    }
  });

  protected readonly segments = computed(() => {
    const remaining = this.phaseService.remainingMs();
    if (remaining === null) return null;

    return [
      { label: 'Days', value: pad(Math.floor(remaining / MS_PER_DAY)) },
      { label: 'Hours', value: pad(Math.floor((remaining % MS_PER_DAY) / MS_PER_HOUR)) },
      { label: 'Min', value: pad(Math.floor((remaining % MS_PER_HOUR) / MS_PER_MINUTE)) },
      { label: 'Sec', value: pad(Math.floor((remaining % MS_PER_MINUTE) / MS_PER_SECOND)) },
    ];
  });
}
