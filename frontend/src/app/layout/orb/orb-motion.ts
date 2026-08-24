/**
 * How the orb travels.
 *
 * A CSS transition gets from A to B; it does not glide. This integrates a
 * damped spring instead, so the orb eases out of its old spot, carries
 * momentum across, oversteps slightly and settles — and never fully stops,
 * because a slow idle drift is most of what makes it read as alive.
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
 * Tuned so the orb visibly covers its distance in under two seconds, then
 * keeps easing in for a while after.
 *
 * Damping ratio is `DAMPING / (2 * sqrt(STIFFNESS))`, here about 0.67 — under
 * 1, so it oversteps rather than crawling to a stop, but not so far under that
 * it visibly bounces. The long sub-pixel tail after that costs nothing: the
 * idle drift means the orb is in motion regardless, so there is no loop to
 * shut down and nothing gained by snapping the last pixel.
 */
const STIFFNESS = 6.5;
const DAMPING = 3.4;

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
 * under what an eye can pick out; this is a predicate for tests and for
 * deciding whether to bother stretching, not a brake.
 */
const REST_SPEED = 4;
const REST_DISTANCE = 1;

/** Idle drift: two sine waves at unrelated periods, tracing a slow figure-eight. */
const FLOAT_X_PERIOD_MS = 11_000;
const FLOAT_Y_PERIOD_MS = 7_300;
const FLOAT_X_PX = 15;
const FLOAT_Y_PX = 11;

/** Speed at which travel stretch reaches its maximum, in pixels per second. */
const STRETCH_FULL_SPEED = 620;
const STRETCH_MAX = 0.26;

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
 * The idle wander, added on top of the spring position.
 *
 * The two periods are deliberately not multiples of each other, so the path
 * does not visibly repeat on any comfortable timescale.
 */
export function idleOffset(elapsedMs: number): Vec {
  return {
    x: Math.sin((elapsedMs / FLOAT_X_PERIOD_MS) * Math.PI * 2) * FLOAT_X_PX,
    y: Math.sin((elapsedMs / FLOAT_Y_PERIOD_MS) * Math.PI * 2 + 1.1) * FLOAT_Y_PX,
  };
}

export interface Stretch {
  readonly scaleX: number;
  readonly scaleY: number;
  /** Radians, so the stretch lies along the direction of travel. */
  readonly angle: number;
}

/**
 * Squash along the axis of travel, like a drop of liquid being pulled.
 *
 * Volume is roughly preserved — the orb narrows across its path as it
 * lengthens along it — so it reads as stretched rather than simply bigger.
 */
export function stretchFor(velocity: Vec): Stretch {
  const speed = Math.hypot(velocity.x, velocity.y);
  const amount = Math.min(speed / STRETCH_FULL_SPEED, 1) * STRETCH_MAX;
  return {
    scaleX: 1 + amount,
    scaleY: 1 - amount * 0.75,
    angle: speed > 0 ? Math.atan2(velocity.y, velocity.x) : 0,
  };
}
