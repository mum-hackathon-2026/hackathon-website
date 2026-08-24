import { Rect, chooseSpot, clearanceAt, distanceToRect, isComfortable } from './orb-placement';

function rect(left: number, top: number, right: number, bottom: number): Rect {
  return { left, top, right, bottom };
}

const VIEWPORT = { width: 1000, height: 800 };
const RADIUS = 28;
const TOP_INSET = 64;

/** Deterministic "random" so a spec asserts a placement, not a coin flip. */
const first = () => 0;

describe('distanceToRect', () => {
  it('is zero inside the rect', () => {
    expect(distanceToRect({ x: 50, y: 50 }, rect(0, 0, 100, 100))).toBe(0);
  });

  it('measures straight out from an edge', () => {
    expect(distanceToRect({ x: 150, y: 50 }, rect(0, 0, 100, 100))).toBe(50);
  });

  it('measures diagonally from a corner', () => {
    expect(distanceToRect({ x: 130, y: 140 }, rect(0, 0, 100, 100))).toBeCloseTo(50, 5);
  });
});

describe('clearanceAt', () => {
  it('is unbounded when there is nothing to avoid', () => {
    expect(clearanceAt({ x: 10, y: 10 }, RADIUS, [])).toBe(Number.POSITIVE_INFINITY);
  });

  // The orb has width, so clearance is measured from its edge and not its centre.
  it('subtracts the orb radius from the gap', () => {
    expect(clearanceAt({ x: 200, y: 50 }, RADIUS, [rect(0, 0, 100, 100)])).toBe(100 - RADIUS);
  });

  it('goes negative where the orb would overlap text', () => {
    expect(clearanceAt({ x: 110, y: 50 }, RADIUS, [rect(0, 0, 100, 100)])).toBe(10 - RADIUS);
  });

  it('reports the nearest obstacle, not the first', () => {
    const far = rect(0, 0, 100, 100);
    const near = rect(400, 0, 500, 100);
    expect(clearanceAt({ x: 520, y: 50 }, RADIUS, [far, near])).toBe(20 - RADIUS);
  });
});

describe('isComfortable', () => {
  it('rejects a point sitting right against text', () => {
    expect(isComfortable({ x: 105, y: 50 }, RADIUS, [rect(0, 0, 100, 100)])).toBe(false);
  });

  it('accepts a point well away from it', () => {
    expect(isComfortable({ x: 400, y: 400 }, RADIUS, [rect(0, 0, 100, 100)])).toBe(true);
  });
});

describe('chooseSpot', () => {
  it('stays inside the viewport and below the nav bar', () => {
    const spot = chooseSpot({
      viewport: VIEWPORT,
      obstacles: [],
      radius: RADIUS,
      topInset: TOP_INSET,
      current: null,
      random: first,
    });

    expect(spot.x).toBeGreaterThanOrEqual(RADIUS);
    expect(spot.x).toBeLessThanOrEqual(VIEWPORT.width - RADIUS);
    expect(spot.y).toBeGreaterThanOrEqual(TOP_INSET + RADIUS);
    expect(spot.y).toBeLessThanOrEqual(VIEWPORT.height - RADIUS);
  });

  it('never lands on text when a clear spot exists', () => {
    // A column of text down the left half, leaving the right half free.
    const obstacles = [rect(0, 0, 500, 800)];

    for (let i = 0; i < 20; i++) {
      const spot = chooseSpot({
        viewport: VIEWPORT,
        obstacles,
        radius: RADIUS,
        topInset: TOP_INSET,
        current: null,
        random: () => i / 20,
      });

      expect(clearanceAt(spot, RADIUS, obstacles)).toBeGreaterThan(0);
    }
  });

  it('finds the gap between two blocks of text', () => {
    // Text top and bottom, a clear band across the middle.
    const obstacles = [rect(0, 0, 1000, 300), rect(0, 500, 1000, 800)];

    const spot = chooseSpot({
      viewport: VIEWPORT,
      obstacles,
      radius: RADIUS,
      topInset: TOP_INSET,
      current: null,
      random: first,
    });

    expect(spot.y).toBeGreaterThan(300);
    expect(spot.y).toBeLessThan(500);
  });

  it('moves far enough to read as a hop', () => {
    const current = { x: 60, y: 100 };

    const spot = chooseSpot({
      viewport: VIEWPORT,
      obstacles: [],
      radius: RADIUS,
      topInset: TOP_INSET,
      current,
      random: first,
    });

    expect(Math.hypot(spot.x - current.x, spot.y - current.y)).toBeGreaterThanOrEqual(120);
  });

  // A page with no gap anywhere must still get an answer; the orb has to be
  // somewhere, and the roomiest spot beats leaving it on a paragraph.
  it('falls back to the roomiest point when nothing is comfortable', () => {
    const obstacles = [rect(0, 0, 1000, 800)];

    const spot = chooseSpot({
      viewport: VIEWPORT,
      obstacles,
      radius: RADIUS,
      topInset: TOP_INSET,
      current: null,
      random: first,
    });

    expect(Number.isFinite(spot.x)).toBe(true);
    expect(Number.isFinite(spot.y)).toBe(true);
  });

  it('survives a viewport smaller than its own margins', () => {
    const spot = chooseSpot({
      viewport: { width: 40, height: 40 },
      obstacles: [],
      radius: RADIUS,
      topInset: TOP_INSET,
      current: null,
      random: first,
    });

    expect(Number.isNaN(spot.x)).toBe(false);
    expect(Number.isNaN(spot.y)).toBe(false);
  });
});
