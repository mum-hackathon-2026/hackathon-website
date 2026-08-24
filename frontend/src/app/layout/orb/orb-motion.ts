/**
 * How the orb travels.
 *
 * A CSS transition gets from A to B; it does not glide. This integrates a
 * damped spring instead, so the orb eases out of its old spot, carries
 * momentum across and eases in with a small overshoot — and never fully
 * stops, because a slow idle drift is most of what makes it read as alive.
 *
 * Kept deliberately plain. There is no directional squash and no trail: a
 * smooth arc and a gentle bob are the whole effect.
 *
 * Pure, and free of both the DOM and the clock: every function takes its
 * inputs and returns a value, so the motion can be stepped in a test without
 * a browser or a running animation frame.
 */

export interface Vec {
  readonly x: number;
  readonly y: number;
}

export interface SpringState {
  /** Current position. */
  readonly at: Vec;
  /** Current velocity, in pixels per second. */
  readonly velocity: Vec;
}

/**
 * Damping ratio is `DAMPING / (2 * sqrt(STIFFNESS))`, here about 0.73. Under 1,
 * so it still overshoots by a few percent and eases back rather than stopping
 * dead, but high enough that the arc reads as smooth rather than springy.
 *
 * The long sub-pixel tail after the visible arrival costs nothing: the idle
 * drift means the orb is in motion regardless, so there is no loop to shut
 * down and nothing gained by snapping the last pixel.
 */
const STIFFNESS = 6.5;
const DAMPING = 3.7;

/**
 * Longest step the integrator will take, in seconds.
 *
 * A backgrounded tab can hand back a gap of many seconds. Integrating that in
 * one step sends the spring to infinity, so it is capped: the orb arrives a
 * little late rather than exploding.
 */
const MAX_STEP_S = 1 / 30;

/**
 * Below this speed and distance the spring counts as arrived. Both are well
 * under what an eye can pick out; this is a predicate rather than a brake:
 * nothing slows the spring down when it trips.
 */
const REST_SPEED = 4;
const REST_DISTANCE = 1;

/**
 * Idle drift. Mostly a vertical bob, with a little sway across it so the orb
 * does not look like it is on a rail. The two periods are deliberately not
 * multiples of each other, so the path does not visibly repeat.
 */
const FLOAT_X_PERIOD_MS = 9_000;
const FLOAT_Y_PERIOD_MS = 6_200;
const FLOAT_X_PX = 5;
const FLOAT_Y_PX = 8;

/** Advance the spring one step toward `target`. */
export function stepSpring(state: SpringState, target: Vec, elapsedSeconds: number): SpringState {
  const dt = Math.min(Math.max(elapsedSeconds, 0), MAX_STEP_S);
  if (dt === 0) return state;

  const ax = (target.x - state.at.x) * STIFFNESS - state.velocity.x * DAMPING;
  const ay = (target.y - state.at.y) * STIFFNESS - state.velocity.y * DAMPING;

  const vx = state.velocity.x + ax * dt;
  const vy = state.velocity.y + ay * dt;

  return {
    at: { x: state.at.x + vx * dt, y: state.at.y + vy * dt },
    velocity: { x: vx, y: vy },
  };
}

/** Whether the spring has effectively arrived and can stop being integrated. */
export function isAtRest(state: SpringState, target: Vec): boolean {
  const speed = Math.hypot(state.velocity.x, state.velocity.y);
  const distance = Math.hypot(target.x - state.at.x, target.y - state.at.y);
  return speed < REST_SPEED && distance < REST_DISTANCE;
}

/**
 * How much of a scroll step becomes orb velocity, and the ceiling on it.
 *
 * Read these as displacement, not speed: this spring turns an impulse of `v`
 * into a peak offset of roughly `v / 4`. The cap is therefore about 20px of
 * lean at the very most, whatever the reader does with the wheel — a nudge,
 * not a lurch. The first version of this used 850 and threw the orb a fifth of
 * the screen, which read as a glitch rather than as weight.
 */
const SCROLL_PULL = 0.3;
const MAX_SCROLL_PULL = 80;

/**
 * The velocity a scroll step lends the orb.
 *
 * The orb is fixed to the viewport, so scrolling does not move it and it can
 * look inert while the page races past. Lending it some of the scroll's motion
 * drags it along, and the spring then pulls it back to where it belongs — so
 * it reads as something with weight being towed, and catching up.
 */
export function scrollPull(deltaPx: number): number {
  const pull = deltaPx * SCROLL_PULL;
  return Math.min(Math.max(pull, -MAX_SCROLL_PULL), MAX_SCROLL_PULL);
}

/** The idle bob, added on top of the spring position. */
export function idleOffset(elapsedMs: number): Vec {
  return {
    x: Math.sin((elapsedMs / FLOAT_X_PERIOD_MS) * Math.PI * 2) * FLOAT_X_PX,
    y: Math.sin((elapsedMs / FLOAT_Y_PERIOD_MS) * Math.PI * 2 + 1.1) * FLOAT_Y_PX,
  };
}
