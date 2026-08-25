import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  computed,
  effect,
  inject,
  signal,
  viewChildren,
} from '@angular/core';
import { EVENT_SCHEDULE } from '../../core/event/event-content';
import { MYT_OFFSET } from '../../core/event/event-config';
import { MilestoneService } from '../../core/event/milestones';
import { PhaseService } from '../../core/event/phase';
import { buildStops } from './track-stops';

/**
 * How much of a stop has to be on screen before it arrives. Low, because the
 * card should be moving while the reader is still scrolling toward it rather
 * than starting once it is already in the middle of the page.
 */
const REVEAL_THRESHOLD = 0.12;

/**
 * Pulls the trigger line up from the bottom of the window, so a stop starts
 * arriving a little before it would otherwise cross into view.
 */
const REVEAL_MARGIN = '0px 0px -12% 0px';

/**
 * How long to wait for the observer to say anything before giving up on it.
 *
 * `IntersectionObserver` existing is not the same as it working: it can be
 * present and never deliver a callback, and the cost of that is the whole
 * schedule staying invisible. If nothing has arrived by now, everything is
 * shown at once and the observer is abandoned. Long enough that a working
 * observer will always have spoken first, so this never fires in practice.
 */
const OBSERVER_GRACE_MS = 1600;

/**
 * The event as one run of dated stops, arriving as the reader scrolls to them.
 *
 * Cards slide in from alternating sides and the spine fills with colour behind
 * them, so the page reads as progress down a line rather than as a list that
 * happens to be in order.
 *
 * The motion is an enhancement and the content never depends on it. Nothing is
 * hidden until the component has confirmed it can put it back: the hidden
 * starting state lives behind a class this component adds, so a page whose
 * script never ran, a browser without `IntersectionObserver`, and a reader who
 * has asked for less motion all get every stop visible from the start. Getting
 * that the wrong way round would hide the whole schedule on exactly the setups
 * least able to recover.
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

  private readonly stopEls = viewChildren<ElementRef<HTMLElement>>('stop');

  protected readonly myt = MYT_OFFSET;

  protected readonly stops = computed(() =>
    buildStops(this.milestones.milestones(), EVENT_SCHEDULE, this.phase.now()),
  );

  /**
   * Whether stops start hidden and arrive on scroll. False until proven
   * otherwise, which is what makes the fallback the safe direction.
   */
  protected readonly animated = signal(false);

  private observer: IntersectionObserver | null = null;
  private graceTimer: ReturnType<typeof setTimeout> | null = null;
  /** Whether the observer has ever said anything. See OBSERVER_GRACE_MS. */
  private observerSpoke = false;

  constructor() {
    this.animated.set(canAnimate());

    effect(() => {
      const elements = this.stopEls().map((ref) => ref.nativeElement);
      if (elements.length === 0 || !this.animated()) return;

      // Rebuilt rather than added to: the stop list is keyed by id, so a
      // schedule change swaps elements out and the old ones are gone.
      this.observer?.disconnect();
      this.observer = new IntersectionObserver(
        (entries) => {
          this.observerSpoke = true;
          for (const entry of entries) {
            if (!entry.isIntersecting) continue;
            entry.target.classList.add('is-revealed');
            // A stop arrives once. Without this it would replay every time the
            // reader scrolled back up, which is distracting rather than nice.
            this.observer?.unobserve(entry.target);
          }
        },
        { threshold: REVEAL_THRESHOLD, rootMargin: REVEAL_MARGIN },
      );

      for (const element of elements) this.observer.observe(element);

      if (this.graceTimer !== null) clearTimeout(this.graceTimer);
      this.graceTimer = setTimeout(() => {
        if (this.observerSpoke) return;
        for (const element of elements) element.classList.add('is-revealed');
        this.observer?.disconnect();
        this.observer = null;
      }, OBSERVER_GRACE_MS);
    });

    inject(DestroyRef).onDestroy(() => {
      this.observer?.disconnect();
      if (this.graceTimer !== null) clearTimeout(this.graceTimer);
    });
  }
}

function canAnimate(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof IntersectionObserver === 'function' &&
    typeof window.matchMedia === 'function' &&
    !window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}
