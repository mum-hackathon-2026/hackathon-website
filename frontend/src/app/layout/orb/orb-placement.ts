/**
 * Where the orb is allowed to land.
 *
 * Split out from the component and kept free of the DOM on purpose: the choice
 * is pure geometry, so it can be tested against synthetic rectangles rather
 * than against a rendered page. `orb.ts` does the measuring; this decides.
 */

export interface Rect {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface PlacementRequest {
  /** Visible area to place within, in CSS pixels. */
  readonly viewport: { readonly width: number; readonly height: number };
  /** Boxes the orb must stay clear of: every run of text on screen. */
  readonly obstacles: readonly Rect[];
  /** Half the orb's width, so clearance is measured from its edge. */
  readonly radius: number;
  /** Keep-out band at the top, for the fixed nav bar. */
  readonly topInset: number;
  /** Where it is now, so a hop can be required to actually go somewhere. */
  readonly current: Point | null;
  /** Injected so specs get a deterministic choice. */
  readonly random?: () => number;
}

/**
 * Candidate points per axis.
 *
 * 13 rather than 9 because the viable band outside a text column is narrow —
 * far enough out to clear the text, not so far as to leave the page — and a
 * coarse grid can step straight over it. The cost is 169 points against the
 * text on screen, which happens only on a navigation or once scrolling stops.
 */
const GRID = 13;

/** Breathing room between the orb's edge and any text, in pixels. */
const COMFORT = 24;

/**
 * A hop shorter than this does not read as movement, so among equally clear
 * spots the further ones are preferred.
 */
const MIN_TRAVEL = 120;

/**
 * Held back from every edge on top of COMFORT, because the target is not where
 * the orb actually gets to: the spring oversteps by a couple of percent and the
 * idle bob wanders several pixels further. Without this a spot on the boundary
 * is reached by going briefly past it, and the orb clips the viewport.
 */
const MOTION_SLACK = 22;

/**
 * How far outside the text it may stray.
 *
 * The page is a centred column, so on a wide screen the emptiest points by far
 * are the middles of the two gutters. Scoring alone sends the orb out there and
 * strands it against the edge of the display, away from anything being read.
 * This keeps it in orbit around the content instead.
 */
const ROAM_MARGIN = 80;

/**
 * The share of comfortable spots kept, nearest the middle of the page first.
 *
 * Clearance alone always favours the outermost point of the emptiest region,
 * which on a zoomed-out browser is the far edge of the window. Ranking what is
 * left by distance from the centre of the content and keeping only the inner
 * portion pulls the orb back in, while still leaving enough candidates that
 * where it goes next is not predictable.
 */
const CENTRE_BIAS = 0.4;

/**
 * The box the text on screen occupies, or null when there is none.
 *
 * Used as the region the orb orbits, rather than the viewport, so that empty
 * gutters on a wide display do not read as the best place to be.
 */
export function contentBounds(obstacles: readonly Rect[]): Rect | null {
  if (obstacles.length === 0) return null;
  return {
    left: Math.min(...obstacles.map((rect) => rect.left)),
    top: Math.min(...obstacles.map((rect) => rect.top)),
    right: Math.max(...obstacles.map((rect) => rect.right)),
    bottom: Math.max(...obstacles.map((rect) => rect.bottom)),
  };
}

/** Distance from a point to the nearest edge of a rect; 0 when inside it. */
export function distanceToRect(point: Point, rect: Rect): number {
  const dx = Math.max(rect.left - point.x, 0, point.x - rect.right);
  const dy = Math.max(rect.top - point.y, 0, point.y - rect.bottom);
  return Math.hypot(dx, dy);
}

/**
 * How much empty space surrounds a point, measured from the orb's edge.
 * Negative means the orb would overlap text there.
 */
export function clearanceAt(point: Point, radius: number, obstacles: readonly Rect[]): number {
  if (obstacles.length === 0) return Number.POSITIVE_INFINITY;
  let nearest = Number.POSITIVE_INFINITY;
  for (const rect of obstacles) {
    nearest = Math.min(nearest, distanceToRect(point, rect));
    if (nearest <= 0) break;
  }
  return nearest - radius;
}

/** Whether the orb sitting here would be comfortably clear of every obstacle. */
export function isComfortable(point: Point, radius: number, obstacles: readonly Rect[]): boolean {
  return clearanceAt(point, radius, obstacles) >= COMFORT;
}

export interface BubbleRequest {
  /** Where the orb is. */
  readonly at: Point;
  /** Half the orb's width — the same radius it was placed with. */
  readonly orbRadius: number;
  /** The gap the stylesheet leaves between the orb and whatever hangs beside it. */
  readonly gap: number;
  /** The bubble's own footprint, matching its stylesheet exactly. */
  readonly width: number;
  readonly height: number;
  /** Which side of the orb it opens on. */
  readonly onRight: boolean;
}

/**
 * The box something hanging off the orb — a panel, a nudge — would occupy.
 *
 * Deliberately not a radius around the orb: a bubble extends a fixed width to
 * one side and barely at all vertically, so treating it as a circle would
 * demand clearance in directions it never actually reaches, and refuse spots
 * that are genuinely fine. This is the same shape `.orb__panel` and
 * `.orb__nudge` already draw in CSS, just measured instead of painted.
 */
export function bubbleRect(request: BubbleRequest): Rect {
  const { at, orbRadius, gap, width, height, onRight } = request;
  const top = at.y - height / 2;
  const bottom = at.y + height / 2;
  if (onRight) {
    const left = at.x + orbRadius + gap;
    return { left, top, right: left + width, bottom };
  }
  const right = at.x - orbRadius - gap;
  return { left: right - width, top, right, bottom };
}

/** Whether a box this size would land clear of every obstacle, with `buffer` px to spare. */
export function isBubbleClear(rect: Rect, obstacles: readonly Rect[], buffer = 0): boolean {
  return obstacles.every(
    (obstacle) =>
      rect.right + buffer <= obstacle.left ||
      rect.left - buffer >= obstacle.right ||
      rect.bottom + buffer <= obstacle.top ||
      rect.top - buffer >= obstacle.bottom,
  );
}

/**
 * Pick somewhere clear to land.
 *
 * Scores a grid of candidates by surrounding empty space, keeps the ones with
 * real clearance, then narrows those to the portion nearest the middle of the
 * page and picks at random among them. Random rather than best, because the
 * orb should not be predictable; narrowed by centre first, because clearance
 * on its own always points at the outermost empty pixel, which is the edge of
 * the window. A spot far enough from the current one is preferred, so the hop
 * reads as movement.
 *
 * When nothing is comfortable — a dense page with text everywhere — it still
 * returns the roomiest point rather than giving up, so the orb is never left
 * sitting on a paragraph.
 */
export function chooseSpot(request: PlacementRequest): Point {
  const { viewport, obstacles, radius, topInset, current } = request;
  const random = request.random ?? Math.random;

  // The hard limits: inside the viewport, below the nav, with room to spare for
  // the overshoot and the bob.
  const edge = radius + COMFORT + MOTION_SLACK;
  let minX = edge;
  let maxX = Math.max(minX, viewport.width - edge);
  let minY = topInset + radius + COMFORT;
  let maxY = Math.max(minY, viewport.height - edge);

  // Then pulled in around the content, so the orb stays near what is being read
  // rather than drifting into a gutter. Only ever narrows the area, and only
  // while that leaves somewhere to stand.
  const content = contentBounds(obstacles);
  if (content) {
    const nearLeft = Math.max(minX, Math.min(maxX, content.left - ROAM_MARGIN));
    const nearRight = Math.max(minX, Math.min(maxX, content.right + ROAM_MARGIN));
    if (nearRight > nearLeft) {
      minX = nearLeft;
      maxX = nearRight;
    }

    const nearTop = Math.max(minY, Math.min(maxY, content.top - ROAM_MARGIN));
    const nearBottom = Math.max(minY, Math.min(maxY, content.bottom + ROAM_MARGIN));
    if (nearBottom > nearTop) {
      minY = nearTop;
      maxY = nearBottom;
    }
  }

  const scored: { point: Point; clearance: number }[] = [];
  for (let ix = 0; ix < GRID; ix++) {
    for (let iy = 0; iy < GRID; iy++) {
      const point = {
        x: minX + ((maxX - minX) * ix) / (GRID - 1),
        y: minY + ((maxY - minY) * iy) / (GRID - 1),
      };
      scored.push({ point, clearance: clearanceAt(point, radius, obstacles) });
    }
  }

  // Every comfortable spot is an equally valid answer, so all of them are in
  // play and the choice among them is random — that is what stops the orb
  // being predictable. Only when nothing is comfortable does "best" matter,
  // and then the roomiest points are the whole pool. Scaling `best` by a
  // fraction would not work here: on a page with no gap at all every clearance
  // is negative, and scaling a negative number raises the bar instead of
  // lowering it, which leaves nothing to choose from.
  const comfortable = scored.filter((entry) => entry.clearance >= COMFORT);
  let band = comfortable;
  if (band.length === 0) {
    const best = Math.max(...scored.map((entry) => entry.clearance));
    band = scored.filter((entry) => entry.clearance >= best - 1);
  }

  // Of the spots that are clear, favour those nearest the middle of the page.
  // Without this the orb drifts to whichever clear point is furthest out, which
  // is the edge of the window rather than anywhere near what is being read.
  const centre = content
    ? { x: (content.left + content.right) / 2, y: (content.top + content.bottom) / 2 }
    : { x: viewport.width / 2, y: viewport.height / 2 };

  const inward = [...band].sort(
    (a, b) =>
      Math.hypot(a.point.x - centre.x, a.point.y - centre.y) -
      Math.hypot(b.point.x - centre.x, b.point.y - centre.y),
  );
  const central = inward.slice(0, Math.max(1, Math.round(inward.length * CENTRE_BIAS)));

  // Prefer a visible hop, but never at the cost of landing on text.
  const travelled = current
    ? central.filter(
        (entry) => Math.hypot(entry.point.x - current.x, entry.point.y - current.y) >= MIN_TRAVEL,
      )
    : central;
  const pool = travelled.length > 0 ? travelled : central;

  return pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))].point;
}
