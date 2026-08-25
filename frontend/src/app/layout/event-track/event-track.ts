import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  HostListener,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { EVENT_SCHEDULE } from '../../core/event/event-content';
import { MYT_OFFSET } from '../../core/event/event-config';
import { MilestoneService } from '../../core/event/milestones';
import { PhaseService } from '../../core/event/phase';
import { buildStops } from './track-stops';

/**
 * Below this the track is a vertical list. A horizontal run needs room to be
 * worth the scroll, and pinning the viewport on a phone takes away the one
 * gesture a reader has.
 */
const WIDE_ENOUGH = '(min-width: 900px)';

/**
 * The event as one horizontal run: the reader scrolls down, and the track
 * travels sideways beneath a pinned viewport.
 *
 * The sideways motion is an enhancement and nothing depends on it. The markup
 * is an ordered list in date order, so a narrow screen, a reader who has asked
 * for less motion, and anything without JavaScript all get the same stops as a
 * plain vertical list — same DOM, same order, different stylesheet branch.
 * That is also what makes it keyboard-reachable: paging down drives the track,
 * so there is nothing to tab through and nothing that can be scrolled past.
 *
 * The stops themselves come from `track-stops.ts`, which merges the two lists
 * the site keeps about its own schedule.
 */
@Component({
  selector: 'app-event-track',
  imports: [DatePipe],
  templateUrl: './event-track.html',
  styleUrl: './event-track.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EventTrack {
  private readonly milestones = inject(MilestoneService);
  private readonly phase = inject(PhaseService);

  private readonly root = viewChild<ElementRef<HTMLElement>>('root');
  private readonly rail = viewChild<ElementRef<HTMLElement>>('rail');

  protected readonly myt = MYT_OFFSET;

  protected readonly stops = computed(() =>
    buildStops(this.milestones.milestones(), EVENT_SCHEDULE, this.phase.now()),
  );

  /**
   * How far the rail has to travel, in pixels. Doubles as the extra height the
   * section needs: a pixel of vertical scroll buys a pixel of sideways travel,
   * so the two are the same number and the pace needs no tuning.
   */
  protected readonly travel = signal(0);

  private frame: number | null = null;

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      if (this.frame !== null) cancelAnimationFrame(this.frame);
    });
  }

  @HostListener('window:scroll')
  onScroll(): void {
    this.schedule();
  }

  @HostListener('window:resize')
  onResize(): void {
    this.schedule();
  }

  /**
   * Measure and paint on the next frame.
   *
   * Both the measurement and the transform are done here rather than through
   * bindings: this runs on every scroll event, and a bound transform would put
   * change detection on the same schedule.
   */
  private schedule(): void {
    if (this.frame !== null) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = null;
      this.paint();
    });
  }

  private paint(): void {
    const root = this.root()?.nativeElement;
    const rail = this.rail()?.nativeElement;
    if (!root || !rail || typeof window === 'undefined') return;

    if (!this.horizontal()) {
      // Vertical mode owns the layout; leave no stale transform behind, which
      // would otherwise survive a resize across the breakpoint.
      rail.style.transform = '';
      this.travel.set(0);
      return;
    }

    const distance = Math.max(0, rail.scrollWidth - window.innerWidth);
    this.travel.set(distance);

    // How far the section has been scrolled through, 0 to 1. The section is
    // taller than the viewport by exactly `distance`, so that is the range.
    const box = root.getBoundingClientRect();
    const progress = distance === 0 ? 0 : clamp(-box.top / distance, 0, 1);

    rail.style.transform = `translate3d(${(-progress * distance).toFixed(2)}px, 0, 0)`;
  }

  private horizontal(): boolean {
    return (
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia(WIDE_ENOUGH).matches &&
      !window.matchMedia('(prefers-reduced-motion: reduce)').matches
    );
  }
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(Math.max(value, low), high);
}
