import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  HostListener,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { AuthService } from '../../core/auth/auth';
import { EVENT_CONFIG } from '../../core/event/event-config';
import { PhaseService } from '../../core/event/phase';
import { SpringState, idleOffset, stepSpring, stretchFor } from './orb-motion';
import { Point, Rect, chooseSpot, isComfortable } from './orb-placement';

/**
 * The route trees the orb stays out of. Both are dense working surfaces — a
 * judging rubric and admin tables — where a floating badge is an obstruction
 * rather than an invitation.
 */
const EXCLUDED_PREFIXES = ['/judge', '/admin'] as const;

/**
 * Elements whose boxes the orb treats as "text". Deliberately broad: it is
 * cheaper to avoid a few empty containers than to land on a caption.
 */
const TEXT_SELECTOR =
  'p, h1, h2, h3, h4, h5, h6, li, a, button, label, td, th, dt, dd, figcaption, blockquote';

/** Half the orb, matching --orb-size in the stylesheet. */
const ORB_RADIUS = 28;

/** Keep-out band for the fixed nav bar. */
const NAV_INSET = 72;

/** Quiet period after scrolling or resizing before the orb reconsiders. */
const SETTLE_MS = 180;

const MS_PER_MINUTE = 60_000;
const MS_PER_HOUR = 60 * MS_PER_MINUTE;
const MS_PER_DAY = 24 * MS_PER_HOUR;

/**
 * A floating orb in the sponsor's orange that hops around the page, always
 * landing somewhere clear of text.
 *
 * Deliberately self-contained. It renders from `app.html` **outside**
 * `<router-outlet>`, so it survives navigation without remounting and no page
 * template refers to it: editing copy anywhere in the app cannot collide with
 * this component, and removing it is deleting one line and this folder.
 *
 * It reads three services and writes to none of them. The geometry lives in
 * `orb-placement.ts`; this class only measures the page and applies the answer.
 */
@Component({
  selector: 'app-orb',
  templateUrl: './orb.html',
  styleUrl: './orb.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Orb {
  private readonly auth = inject(AuthService);
  private readonly phase = inject(PhaseService);
  private readonly router = inject(Router);
  private readonly config = inject(EVENT_CONFIG);

  /** The current URL, tracked so the orb can absent itself from some trees. */
  private readonly url = signal(this.router.url);

  readonly visible = computed(
    () => !EXCLUDED_PREFIXES.some((prefix) => this.url().startsWith(prefix)),
  );

  readonly open = signal(false);
  readonly signedIn = this.auth.isSignedIn;

  /** Null until the first measurement, when the stylesheet's corner applies. */
  readonly spot = signal<Point | null>(null);

  /**
   * Which side the panel opens on. It sits left of the orb by default, which
   * would run off screen once the orb roams into the left half.
   */
  readonly panelOnRight = signal(false);

  private readonly anchor = viewChild<ElementRef<HTMLElement>>('anchor');
  private readonly core = viewChild<ElementRef<HTMLElement>>('core');

  readonly firstName = computed(() => this.auth.user()?.name.split(' ')[0] ?? '');

  readonly registrationFormUrl = this.config.site.teamRegistrationFormUrl;

  /**
   * "Registration closes in 3 days", or null once the schedule has run out.
   * Reuses `PhaseService` rather than deriving a second countdown, so the orb
   * can never disagree with the hero.
   */
  readonly status = computed<string | null>(() => {
    const next = this.phase.nextMilestone();
    const remaining = this.phase.remainingMs();
    if (!next || remaining === null) return null;
    return `${next.label} in ${humanise(remaining)}`;
  });

  private settleTimer: ReturnType<typeof setTimeout> | null = null;

  /** Null until the first placement; after that the loop owns it. */
  private spring: SpringState | null = null;
  private frame: number | null = null;
  private lastFrameMs = 0;
  private startedMs = 0;

  constructor() {
    // One subscription does all the arrival jobs: retarget the URL, drop any
    // panel that would otherwise hang over the page you land on, and hop to a
    // clear spot on the new page. Plain rather than piped through rxjs
    // operators — this is the app shell, and everything imported here lands in
    // the initial bundle.
    const navigations = this.router.events.subscribe((event) => {
      if (!(event instanceof NavigationEnd)) return;
      this.url.set(event.urlAfterRedirects);
      this.open.set(false);
      // The incoming page has not laid out yet, so measuring now would read the
      // outgoing one. A frame's delay is enough for the new DOM to exist.
      this.afterLayout(() => this.hop());
    });

    inject(DestroyRef).onDestroy(() => {
      navigations.unsubscribe();
      this.stopLoop();
      if (this.settleTimer !== null) clearTimeout(this.settleTimer);
    });

    this.afterLayout(() => this.hop());

    // The anchor only exists while the orb is visible, so the loop follows the
    // element rather than the component: it starts when the orb appears on a
    // public route and stops again on the admin or judge trees.
    effect(() => {
      const element = this.anchor();
      if (element && !prefersReducedMotion()) this.startLoop();
      else this.stopLoop();
    });
  }

  toggle(): void {
    this.open.update((wasOpen) => !wasOpen);
  }

  close(): void {
    this.open.set(false);
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.close();
  }

  /**
   * Scrolling does not move the orb by itself — motion in the corner of the eye
   * while reading is tiring. It only relocates once text has actually scrolled
   * underneath where it sits.
   */
  @HostListener('window:scroll')
  onScroll(): void {
    this.afterSettle(() => {
      const here = this.spot();
      if (here && isComfortable(here, ORB_RADIUS, this.textRects())) return;
      this.hop();
    });
  }

  /** A resize invalidates the whole measurement, so re-check unconditionally. */
  @HostListener('window:resize')
  onResize(): void {
    this.afterSettle(() => this.hop());
  }

  /** Measure the page and move somewhere clear. */
  private hop(): void {
    if (!this.visible() || typeof window === 'undefined') return;
    if (prefersReducedMotion()) return;

    const next = chooseSpot({
      viewport: { width: window.innerWidth, height: window.innerHeight },
      obstacles: this.textRects(),
      radius: ORB_RADIUS,
      topInset: NAV_INSET,
      current: this.spot(),
    });

    this.spot.set(next);
    this.panelOnRight.set(next.x < window.innerWidth / 2);

    // The very first placement has nowhere to travel from, so it starts where
    // it lands rather than flying in from the viewport origin.
    if (this.spring === null) {
      this.spring = { at: next, velocity: { x: 0, y: 0 } };
      this.paint(this.spring, 0);
    }
  }

  /**
   * Every run of text currently on screen.
   *
   * Only what is in view matters — the orb is positioned in viewport
   * coordinates, so a paragraph two screens down cannot be under it. Elements
   * with no text of their own are skipped so layout wrappers do not blank out
   * the whole page.
   */
  private textRects(): readonly Rect[] {
    const rects: Rect[] = [];
    const height = window.innerHeight;
    const width = window.innerWidth;

    for (const element of document.querySelectorAll(TEXT_SELECTOR)) {
      if (element.closest('.orb')) continue;
      if (!element.textContent?.trim()) continue;

      const box = element.getBoundingClientRect();
      if (box.width === 0 || box.height === 0) continue;
      if (box.bottom < 0 || box.top > height || box.right < 0 || box.left > width) continue;

      rects.push({ left: box.left, top: box.top, right: box.right, bottom: box.bottom });
    }
    return rects;
  }

  /**
   * The animation loop.
   *
   * Writes transforms straight to the elements rather than through a signal:
   * a bound style would run change detection sixty times a second for a value
   * only these two nodes care about.
   */
  private startLoop(): void {
    if (this.frame !== null || typeof requestAnimationFrame !== 'function') return;

    this.startedMs = now();
    this.lastFrameMs = this.startedMs;

    const tick = () => {
      const at = now();
      const dt = (at - this.lastFrameMs) / 1000;
      this.lastFrameMs = at;

      const target = this.spot();
      if (target) {
        this.spring = stepSpring(
          this.spring ?? { at: target, velocity: { x: 0, y: 0 } },
          target,
          dt,
        );
        this.paint(this.spring, at - this.startedMs);
      }

      this.frame = requestAnimationFrame(tick);
    };

    this.frame = requestAnimationFrame(tick);
  }

  private stopLoop(): void {
    if (this.frame === null) return;
    cancelAnimationFrame(this.frame);
    this.frame = null;
  }

  /** Put the current motion state on screen. */
  private paint(spring: SpringState, elapsedMs: number): void {
    const anchor = this.anchor()?.nativeElement;
    if (!anchor) return;

    const drift = idleOffset(elapsedMs);
    anchor.style.transform = `translate(${(spring.at.x + drift.x).toFixed(2)}px, ${(spring.at.y + drift.y).toFixed(2)}px)`;

    const core = this.core()?.nativeElement;
    if (!core) return;

    // Stretch lives on the core so it composes with the button's hover scale
    // instead of fighting it for the same transform property.
    const stretch = stretchFor(spring.velocity);
    core.style.transform = `rotate(${stretch.angle.toFixed(3)}rad) scale(${stretch.scaleX.toFixed(3)}, ${stretch.scaleY.toFixed(3)}) rotate(${(-stretch.angle).toFixed(3)}rad)`;
  }

  /** Run once the browser has laid the new DOM out. */
  private afterLayout(run: () => void): void {
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => run());
    else run();
  }

  /** Run once the user has stopped scrolling or resizing. */
  private afterSettle(run: () => void): void {
    if (this.settleTimer !== null) clearTimeout(this.settleTimer);
    this.settleTimer = setTimeout(run, SETTLE_MS);
  }
}

/** Monotonic where available, so a clock change cannot jolt the spring. */
function now(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/** Coarse and readable: the orb is a glance, not a stopwatch. */
function humanise(ms: number): string {
  if (ms >= MS_PER_DAY) {
    const days = Math.floor(ms / MS_PER_DAY);
    return `${days} ${days === 1 ? 'day' : 'days'}`;
  }
  if (ms >= MS_PER_HOUR) {
    const hours = Math.floor(ms / MS_PER_HOUR);
    return `${hours} ${hours === 1 ? 'hour' : 'hours'}`;
  }
  const minutes = Math.max(1, Math.floor(ms / MS_PER_MINUTE));
  return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`;
}
