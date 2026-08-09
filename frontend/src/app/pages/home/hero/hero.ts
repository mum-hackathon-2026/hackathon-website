import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';

/** Registration deadline, in Melbourne time. */
const DEADLINE = new Date('2026-08-15T23:59:00+11:00');

const MS_PER_SECOND = 1000;
const MS_PER_MINUTE = 60 * MS_PER_SECOND;
const MS_PER_HOUR = 60 * MS_PER_MINUTE;
const MS_PER_DAY = 24 * MS_PER_HOUR;

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

@Component({
  selector: 'app-home-hero',
  imports: [RouterLink],
  templateUrl: './hero.html',
  styleUrl: './hero.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Hero {
  private readonly now = signal(Date.now());

  protected readonly segments = computed(() => {
    const remaining = Math.max(0, DEADLINE.getTime() - this.now());
    return [
      { label: 'Days', value: pad(Math.floor(remaining / MS_PER_DAY)) },
      { label: 'Hours', value: pad(Math.floor((remaining % MS_PER_DAY) / MS_PER_HOUR)) },
      { label: 'Min', value: pad(Math.floor((remaining % MS_PER_HOUR) / MS_PER_MINUTE)) },
      { label: 'Sec', value: pad(Math.floor((remaining % MS_PER_MINUTE) / MS_PER_SECOND)) },
    ];
  });

  constructor() {
    const ticker = setInterval(() => this.now.set(Date.now()), MS_PER_SECOND);
    inject(DestroyRef).onDestroy(() => clearInterval(ticker));
  }
}
