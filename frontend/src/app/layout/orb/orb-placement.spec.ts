import {
  Rect,
  bubbleRect,
  chooseSpot,
  clearanceAt,
  contentBounds,
  distanceToRect,
  isBubbleClear,
  isComfortable,
} from './orb-placement';

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

describe('bubbleRect', () => {
  const at = { x: 500, y: 300 };
  const orbRadius = 28;
  const gap = 12;
  const width = 190;
  const height = 36;

  it('opens to the left by default', () => {
    const box = bubbleRect({ at, orbRadius, gap, width, height, onRight: false });

    expect(box.right).toBe(at.x - orbRadius - gap);
    expect(box.left).toBe(box.right - width);
  });

  it('opens to the right when flipped', () => {
    const box = bubbleRect({ at, orbRadius, gap, width, height, onRight: true });

    expect(box.left).toBe(at.x + orbRadius + gap);
    expect(box.right).toBe(box.left + width);
  });

  it('centres on the orb vertically either way', () => {
    const box = bubbleRect({ at, orbRadius, gap, width, height, onRight: false });

    expect(box.top).toBe(at.y - height / 2);
    expect(box.bottom).toBe(at.y + height / 2);
  });
});

describe('isBubbleClear', () => {
  it('accepts a box with nothing nearby', () => {
    expect(isBubbleClear(rect(200, 280, 390, 316), [])).toBe(true);
  });

  it('rejects a box that overlaps an obstacle', () => {
    const box = rect(200, 280, 390, 316);
    expect(isBubbleClear(box, [rect(350, 200, 450, 400)])).toBe(false);
  });

  it('rejects a box within the buffer even when it does not overlap', () => {
    const box = rect(200, 280, 390, 316);
    // 5px of daylight between the box and the obstacle.
    expect(isBubbleClear(box, [rect(395, 200, 450, 400)], 8)).toBe(false);
  });

  it('accepts a box clear by more than the buffer', () => {
    const box = rect(200, 280, 390, 316);
    // 20px of daylight — comfortably past an 8px buffer.
    expect(isBubbleClear(box, [rect(410, 200, 450, 400)], 8)).toBe(true);
  });

  // Only the boxes actually in the way should count against it.
  it('ignores an obstacle nowhere near the box', () => {
    const box = rect(200, 280, 390, 316);
    expect(isBubbleClear(box, [rect(0, 0, 50, 50)])).toBe(true);
  });
});

describe('contentBounds', () => {
  it('is null when there is no text', () => {
    expect(contentBounds([])).toBeNull();
  });

  it('encloses every box', () => {
    expect(contentBounds([rect(100, 50, 200, 150), rect(400, 20, 500, 300)])).toEqual({
      left: 100,
      top: 20,
      right: 500,
      bottom: 300,
    });
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

  // The page is a centred column, so a wide display has large empty gutters.
  // Scoring alone would send the orb into one and strand it at the screen edge.
  describe('on a wide display', () => {
    // A 1120px column centred on 1920px leaves 400px of empty gutter each side.
    const wide = { width: 1920, height: 900 };
    const column = [rect(400, 80, 1520, 860)];

    function spots() {
      return Array.from({ length: 20 }, (_unused, i) =>
        chooseSpot({
          viewport: wide,
          obstacles: column,
          radius: RADIUS,
          topInset: TOP_INSET,
          current: null,
          random: () => i / 20,
        }),
      );
    }

    it('never strays far outside the content', () => {
      for (const spot of spots()) {
        expect(spot.x).toBeGreaterThan(400 - 81);
        expect(spot.x).toBeLessThan(1520 + 81);
      }
    });

    // Someone zoomed out has a wide window and a narrow column. Clearance alone
    // points at the far edge of the window every time; the orb should hug the
    // page instead.
    it('hugs the column rather than the window edge', () => {
      const windowEdge = Math.min(...spots().map((spot) => Math.min(spot.x, wide.width - spot.x)));
      const columnEdge = Math.min(
        ...spots().map((spot) => Math.min(Math.abs(spot.x - 400), Math.abs(spot.x - 1520))),
      );

      expect(columnEdge).toBeLessThan(windowEdge);
    });

    it('stays within the middle band of the window', () => {
      for (const spot of spots()) {
        expect(spot.x).toBeGreaterThan(wide.width * 0.15);
        expect(spot.x).toBeLessThan(wide.width * 0.85);
      }
    });
  });

  // A real page is many separate boxes with gaps between sections and cards,
  // not one solid block. The orb should use those gaps rather than shuttling
  // between the same two points in the side margins.
  it('finds varied places to sit on a realistic page', () => {
    const wide = { width: 1680, height: 900 };
    const sections = [
      rect(340, 100, 1340, 260), // hero
      rect(340, 360, 1340, 470), // a section
      rect(340, 560, 1340, 700), // another
      rect(340, 790, 1340, 870), // footer
    ];

    const seen = new Set(
      Array.from({ length: 24 }, (_unused, i) =>
        chooseSpot({
          viewport: wide,
          obstacles: sections,
          radius: RADIUS,
          topInset: TOP_INSET,
          current: null,
          random: () => i / 24,
        }),
      ).map((spot) => `${Math.round(spot.x)},${Math.round(spot.y)}`),
    );

    expect(seen.size).toBeGreaterThan(3);
  });

  // The target is not where the orb ends up: the spring oversteps and the bob
  // wanders. A spot flush against the boundary would be reached by leaving it.
  it('leaves room at the edges for overshoot and bob', () => {
    const spot = chooseSpot({
      viewport: VIEWPORT,
      obstacles: [],
      radius: RADIUS,
      topInset: TOP_INSET,
      current: null,
      random: () => 0.999,
    });

    expect(spot.x).toBeLessThanOrEqual(VIEWPORT.width - RADIUS - 20);
    expect(spot.y).toBeLessThanOrEqual(VIEWPORT.height - RADIUS - 20);
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
