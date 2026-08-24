import { SpringState, Vec, idleOffset, isAtRest, stepSpring } from './orb-motion';

const FRAME_S = 1 / 60;

function at(x: number, y: number): SpringState {
  return { at: { x, y }, velocity: { x: 0, y: 0 } };
}

/** Run the spring to rest, returning the path it took and how long it needed. */
function settle(from: SpringState, target: Vec, limitFrames = 600) {
  const path: Vec[] = [from.at];
  let state = from;
  let frames = 0;
  while (!isAtRest(state, target) && frames < limitFrames) {
    state = stepSpring(state, target, FRAME_S);
    path.push(state.at);
    frames++;
  }
  return { state, path, seconds: frames * FRAME_S, settled: frames < limitFrames };
}

describe('stepSpring', () => {
  it('moves toward the target', () => {
    const next = stepSpring(at(0, 0), { x: 500, y: 0 }, FRAME_S);
    expect(next.at.x).toBeGreaterThan(0);
    expect(next.at.x).toBeLessThan(500);
  });

  it('starts slowly rather than jumping', () => {
    // The first frame should cover a tiny fraction of the distance. This is
    // the whole difference between gliding and snapping.
    const next = stepSpring(at(0, 0), { x: 1000, y: 0 }, FRAME_S);
    expect(next.at.x).toBeLessThan(10);
  });

  it('builds speed before it slows again', () => {
    const { path } = settle(at(0, 0), { x: 800, y: 0 });

    const steps = path.slice(1).map((point, i) => point.x - path[i].x);
    const fastest = steps.indexOf(Math.max(...steps));
    // Peak speed belongs in the middle of the journey, not at either end.
    expect(fastest).toBeGreaterThan(2);
    expect(fastest).toBeLessThan(steps.length - 2);
  });

  // What matters is when the orb has visibly got there, not when the last
  // sub-pixel of the tail is spent. The eye reads the journey as over once
  // almost all the distance is behind it.
  it('covers its distance in under two seconds', () => {
    const target = { x: 800, y: 400 };
    const total = Math.hypot(target.x, target.y);
    const { path } = settle(at(0, 0), target);

    const covered = path.findIndex(
      (point) => Math.hypot(target.x - point.x, target.y - point.y) < total * 0.05,
    );

    expect(covered).toBeGreaterThan(0);
    expect(covered * FRAME_S).toBeGreaterThan(1);
    expect(covered * FRAME_S).toBeLessThan(2);
  });

  it('comes fully to rest eventually', () => {
    const { settled, seconds } = settle(at(0, 0), { x: 800, y: 400 });

    expect(settled).toBe(true);
    expect(seconds).toBeLessThan(8);
  });

  it('oversteps slightly, then comes back', () => {
    const { path } = settle(at(0, 0), { x: 600, y: 0 });

    expect(Math.max(...path.map((point) => point.x))).toBeGreaterThan(600);
  });

  it('settles on the target and stays there', () => {
    const target = { x: 600, y: 300 };
    const { state } = settle(at(0, 0), target);

    // Within the rest tolerance, which is the tightest claim the spring makes.
    expect(Math.hypot(target.x - state.at.x, target.y - state.at.y)).toBeLessThan(1);
    expect(Math.hypot(state.velocity.x, state.velocity.y)).toBeLessThan(4);
  });

  // A backgrounded tab hands back an enormous gap; integrating it whole would
  // send the spring to infinity.
  it('survives a huge frame gap without exploding', () => {
    const next = stepSpring(at(0, 0), { x: 500, y: 0 }, 45);

    expect(Number.isFinite(next.at.x)).toBe(true);
    expect(Math.abs(next.at.x)).toBeLessThan(5000);
  });

  it('does nothing on a zero-length step', () => {
    const state = at(10, 10);
    expect(stepSpring(state, { x: 500, y: 0 }, 0)).toBe(state);
  });
});

describe('isAtRest', () => {
  it('is false while still travelling', () => {
    expect(isAtRest(at(0, 0), { x: 500, y: 0 })).toBe(false);
  });

  it('is true once stopped on the target', () => {
    expect(isAtRest(at(500, 0), { x: 500, y: 0 })).toBe(true);
  });

  it('is false when sitting on the target but still moving', () => {
    const moving = { at: { x: 500, y: 0 }, velocity: { x: 200, y: 0 } };
    expect(isAtRest(moving, { x: 500, y: 0 })).toBe(false);
  });
});

describe('idleOffset', () => {
  it('stays within its amplitude', () => {
    for (let ms = 0; ms < 60_000; ms += 250) {
      const offset = idleOffset(ms);
      expect(Math.abs(offset.x)).toBeLessThanOrEqual(5);
      expect(Math.abs(offset.y)).toBeLessThanOrEqual(8);
    }
  });

  it('keeps moving, so the orb is never perfectly still', () => {
    expect(idleOffset(0)).not.toEqual(idleOffset(1200));
  });

  // Unrelated periods, so the wander does not visibly loop.
  it('does not retrace itself on a short cycle', () => {
    const start = idleOffset(0);
    const oneXPeriodLater = idleOffset(9_000);
    expect(Math.abs(oneXPeriodLater.y - start.y)).toBeGreaterThan(0.5);
  });
});
