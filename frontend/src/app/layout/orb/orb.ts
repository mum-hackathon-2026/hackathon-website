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
import { SpringState, idleOffset, scrollPull, stepSpring } from './orb-motion';
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

/** Grace after the pointer leaves, so a near miss does not dismiss the panel. */
const LEAVE_GRACE_MS = 220;

const MS_PER_MINUTE = 60_000;
const MS_PER_HOUR = 60 * MS_PER_MINUTE;
const MS_PER_DAY = 24 * MS_PER_HOUR;

/**
 * How wide a nudge bubble can get (see .orb__nudge). Checked as if the orb
 * itself were this much bigger, so a nudge only ever shows where the bubble
 * beside it would also land clear of text — see `fireNudge`.
 */
const NUDGE_FOOTPRINT = 190;
const NUDGE_CHECK_RADIUS = ORB_RADIUS + NUDGE_FOOTPRINT + 12;

/** How long a nudge stays up before it fades itself back out. */
const NUDGE_VISIBLE_MS = 5_000;

/**
 * Escalating at first to catch a first-time visitor's eye, then settling into
 * an occasional reminder for as long as they stay anonymous. Read in order;
 * once exhausted, every later nudge waits the last, steady interval instead.
 */
const ANON_NUDGE_SCHEDULE_MS = [15_000, 25_000, 35_000, 60_000, 120_000, 90_000] as const;

/** Calmer once someone is already registered — a supportive tap, not a nag. */
const REGISTERED_NUDGE_MIN_MS = 5 * MS_PER_MINUTE;
const REGISTERED_NUDGE_MAX_MS = 10 * MS_PER_MINUTE;

const PLAYFUL_NUDGES = [
  'Click me!',
  'Psst, over here 👆',
  'Tap me!',
  "Don't ignore me 😄",
  'Right here! →',
] as const;

const SUPPORTIVE_NUDGES = [
  'You’ve got this! 💪',
  'Keep building!',
  'Rooting for your team!',
  'Almost there!',
] as const;

/** Never the same line twice in a row, so a short cadence doesn't feel canned. */
function pickNudge(pool: readonly string[], avoid: string | null): string {
  if (pool.length === 1) return pool[0];
  let choice: string;
  do {
    choice = pool[Math.floor(Math.random() * pool.length)];
  } while (choice === avoid);
  return choice;
}

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
 *
 * Easy to miss on a page with this much else going on, so it also nudges: a
 * short line beside it, gone a few seconds later, on a schedule that starts
 * eager for a first-time visitor and calms down once they are registered (see
 * `nextNudgeDelay`). A nudge only ever shows where the bubble itself would
 * also land clear of text — see `NUDGE_CHECK_RADIUS` — and never while the
 * real panel is open or the pointer is on the orb.
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

  /** True from the moment the pointer arrives until it has really gone. */
  private readonly hovered = signal(false);

  /**
   * While the pointer is on it, or its panel is open, the orb holds still.
   * A target that drifts out from under the cursor is not charming, it is a
   * thing you cannot click.
   */
  private readonly settled = computed(() => this.open() || this.hovered());

  /** Null until the first measurement, when the stylesheet's corner applies. */
  readonly spot = signal<Point | null>(null);

  /**
   * Which side the panel opens on. It sits left of the orb by default, which
   * would run off screen once the orb roams into the left half.
   */
  readonly panelOnRight = signal(false);

  private readonly anchor = viewChild<ElementRef<HTMLElement>>('anchor');

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

  /**
   * The periodic attention-getter: a short line beside the orb, gone again a
   * few seconds later. Null is hidden. Never opens alongside the real panel —
   * the `settled` effect below clears it the moment a hover or a click would
   * otherwise show both at once.
   */
  readonly nudgeMessage = signal<string | null>(null);

  private settleTimer: ReturnType<typeof setTimeout> | null = null;
  private leaveTimer: ReturnType<typeof setTimeout> | null = null;
  private nudgeTimer: ReturnType<typeof setTimeout> | null = null;
  private nudgeHideTimer: ReturnType<typeof setTimeout> | null = null;
  /** How far into the anonymous schedule the next nudge is; resets once signed in. */
  private nudgeStep = 0;
  private lastNudgeText: string | null = null;

  /** Null until the first placement; after that the loop owns it. */
  private spring: SpringState | null = null;
  private frame: number | null = null;
  private lastFrameMs = 0;
  private lastScrollY = 0;
  /** Scroll velocity owed to the orb, handed over on the next frame. */
  private pendingPull = 0;
  /**
   * Set on arrival at a new page. The browser's jump back to the top arrives
   * as a scroll event *after* NavigationEnd, so resyncing the position there
   * is too early to catch it; the first scroll after a navigation instead
   * resyncs and lends nothing. The cost is one swallowed impulse when a page
   * does not reset its scroll, which is a single frame nobody can see.
   */
  private resyncScroll = true;
  /**
   * Time the idle bob has been running. Advanced by the loop rather than read
   * off the clock, so holding still is simply declining to advance it — the
   * bob resumes from where it paused instead of jumping.
   */
  private driftMs = 0;

  /**
   * So a sign-in mid-visit is noticed by the effect below rather than only by
   * the next `fireNudge` — otherwise a nudge already scheduled on the eager
   * anonymous track still lands once more, right on the calmer schedule's
   * heels, before the switch takes effect.
   */
  private wasSignedIn: boolean;

  constructor() {
    this.wasSignedIn = this.signedIn();

    // One subscription does all the arrival jobs: retarget the URL, drop any
    // panel that would otherwise hang over the page you land on, and hop to a
    // clear spot on the new page. Plain rather than piped through rxjs
    // operators — this is the app shell, and everything imported here lands in
    // the initial bundle.
    const navigations = this.router.events.subscribe((event) => {
      if (!(event instanceof NavigationEnd)) return;
      this.url.set(event.urlAfterRedirects);
      // Landing on a new page resets the scroll position. That jump is not the
      // reader moving, so it must not be handed to the orb as a pull.
      this.lastScrollY = typeof window === 'undefined' ? 0 : window.scrollY;
      this.pendingPull = 0;
      this.resyncScroll = true;
      this.cancelLeave();
      this.hovered.set(false);
      this.open.set(false);
      // The incoming page has not laid out yet, so measuring now would read the
      // outgoing one. A frame's delay is enough for the new DOM to exist.
      this.afterLayout(() => this.hop());
    });

    inject(DestroyRef).onDestroy(() => {
      navigations.unsubscribe();
      this.stopLoop();
      this.cancelLeave();
      if (this.settleTimer !== null) clearTimeout(this.settleTimer);
      if (this.nudgeTimer !== null) clearTimeout(this.nudgeTimer);
      if (this.nudgeHideTimer !== null) clearTimeout(this.nudgeHideTimer);
    });

    this.afterLayout(() => this.hop());
    this.scheduleNudge();

    // The anchor only exists while the orb is visible, so the loop follows the
    // element rather than the component: it starts when the orb appears on a
    // public route and stops again on the admin or judge trees.
    effect(() => {
      const element = this.anchor();
      if (element && !prefersReducedMotion()) this.startLoop();
      else this.stopLoop();
    });

    // A hover or a click always wins: nothing should still be showing a nudge
    // once the real panel is up, or beside it if the pointer is just passing.
    effect(() => {
      if (this.settled()) this.nudgeMessage.set(null);
    });

    // Registering mid-visit should be felt immediately, not just on whichever
    // nudge happens to fire next — see `wasSignedIn`.
    effect(() => {
      const isSignedIn = this.signedIn();
      if (isSignedIn === this.wasSignedIn) return;
      this.wasSignedIn = isSignedIn;
      this.scheduleNudge();
    });
  }

  toggle(): void {
    this.open.update((wasOpen) => !wasOpen);
  }

  close(): void {
    this.open.set(false);
  }

  onPointerEnter(): void {
    this.cancelLeave();
    this.hovered.set(true);
    this.open.set(true);
  }

  /**
   * Closing is deferred a moment. The pointer crossing a corner of the panel,
   * or clipping the edge of the orb on its way in, should not dismiss it.
   */
  onPointerLeave(): void {
    this.cancelLeave();
    this.leaveTimer = setTimeout(() => {
      this.hovered.set(false);
      this.close();
    }, LEAVE_GRACE_MS);
  }

  private cancelLeave(): void {
    if (this.leaveTimer === null) return;
    clearTimeout(this.leaveTimer);
    this.leaveTimer = null;
  }

  private scheduleNudge(): void {
    if (this.nudgeTimer !== null) clearTimeout(this.nudgeTimer);
    this.nudgeTimer = setTimeout(() => this.fireNudge(), this.nextNudgeDelay());
  }

  /** Escalates while anonymous; a slow random cadence once registered — see the class doc. */
  private nextNudgeDelay(): number {
    if (this.signedIn()) {
      this.nudgeStep = 0;
      const span = REGISTERED_NUDGE_MAX_MS - REGISTERED_NUDGE_MIN_MS;
      return REGISTERED_NUDGE_MIN_MS + Math.random() * span;
    }
    const step = ANON_NUDGE_SCHEDULE_MS[Math.min(this.nudgeStep, ANON_NUDGE_SCHEDULE_MS.length - 1)];
    this.nudgeStep++;
    return step;
  }

  /**
   * Whether or not this tick actually shows a bubble, the next one is always
   * scheduled first — a skipped tick (hovered, hidden tab, no clear spot)
   * must not silently end the whole sequence.
   */
  private fireNudge(): void {
    this.scheduleNudge();

    if (!this.visible() || this.settled() || prefersReducedMotion()) return;
    if (typeof document !== 'undefined' && document.hidden) return;

    // Only where a bubble this size would also land clear of text — the same
    // standard the orb itself is held to, not just a smaller circle around it.
    const spot = this.spot();
    if (!spot || !isComfortable(spot, NUDGE_CHECK_RADIUS, this.textRects())) return;

    const pool = this.signedIn() ? SUPPORTIVE_NUDGES : PLAYFUL_NUDGES;
    const message = pickNudge(pool, this.lastNudgeText);
    this.lastNudgeText = message;
    this.nudgeMessage.set(message);

    if (this.nudgeHideTimer !== null) clearTimeout(this.nudgeHideTimer);
    this.nudgeHideTimer = setTimeout(() => this.nudgeMessage.set(null), NUDGE_VISIBLE_MS);
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.close();
  }

  /**
   * Scrolling tows the orb: it takes on some of the page's motion and the
   * spring reels it back, so it trails and catches up rather than sitting
   * inert while everything else races past.
   *
   * It only *relocates* once text has actually scrolled underneath it. Picking
   * a new spot on every scroll would be motion in the corner of the eye while
   * reading, which is tiring; being towed is the page's own movement and reads
   * as weight instead.
   */
  @HostListener('window:scroll')
  onScroll(): void {
    const y = window.scrollY;
    // Under the pointer it holds still, so it does not squirm out of reach.
    if (this.resyncScroll) this.resyncScroll = false;
    else if (!this.settled()) this.pendingPull += scrollPull(y - this.lastScrollY);
    this.lastScrollY = y;

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
    // Moving out from under a pointer that is reaching for it would be the
    // worst possible moment; the next scroll or navigation will pick it up.
    if (this.settled()) return;

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
   * Writes the transform straight to the element rather than through a signal:
   * a bound style would run change detection sixty times a second for a value
   * only this one node cares about.
   */
  private startLoop(): void {
    if (this.frame !== null || typeof requestAnimationFrame !== 'function') return;

    this.lastFrameMs = now();

    const tick = () => {
      const at = now();
      const dt = (at - this.lastFrameMs) / 1000;
      this.lastFrameMs = at;

      const target = this.spot();
      if (target) {
        let state = this.spring ?? { at: target, velocity: { x: 0, y: 0 } };

        if (this.pendingPull !== 0) {
          state = {
            at: state.at,
            velocity: { x: state.velocity.x, y: state.velocity.y + this.pendingPull },
          };
          this.pendingPull = 0;
        }

        this.spring = stepSpring(state, target, dt);
        // Held still under the pointer: the spring still settles onto its
        // target, but the bob stops advancing so the orb stays put.
        if (!this.settled()) this.driftMs += dt * 1000;
        this.paint(this.spring, this.driftMs);
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

  /** Put the current position on screen: the spring, plus the idle bob. */
  private paint(spring: SpringState, elapsedMs: number): void {
    const anchor = this.anchor()?.nativeElement;
    if (!anchor) return;

    const drift = idleOffset(elapsedMs);

    // A backstop, not the mechanism: chooseSpot already holds its targets well
    // inside the viewport. This only bites if a long hop's overshoot and the
    // bob happen to stack up, and clamping is better than letting the orb
    // hang off the edge of the screen.
    const x = clamp(spring.at.x + drift.x, ORB_RADIUS + 4, window.innerWidth - ORB_RADIUS - 4);
    const y = clamp(spring.at.y + drift.y, ORB_RADIUS + 4, window.innerHeight - ORB_RADIUS - 4);

    anchor.style.transform = `translate(${x.toFixed(2)}px, ${y.toFixed(2)}px)`;
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

function clamp(value: number, low: number, high: number): number {
  return Math.min(Math.max(value, low), Math.max(low, high));
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
