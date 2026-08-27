import { ChangeDetectionStrategy, Component } from '@angular/core';

/**
 * The page's background: a fixed, static hexagon/circuit/wave motif from the
 * Averis design guideline, over the plain Averis cream page canvas
 * (--color-page-bg in styles.scss). Kept entirely in the Averis palette —
 * an earlier version also drifted four large colour wells in the Google
 * palette behind it, but that read as busy blur competing with the line art
 * rather than as canvas texture, so it was dropped in favour of this single,
 * calmer, static motif.
 *
 * Presentation only. It has no state, no inputs and no behaviour, and it
 * renders from `app.html` outside `<router-outlet>` so no page template refers
 * to it. Deleting it is one line and this folder.
 *
 * It is what the page's translucent section backgrounds are translucent *for*.
 * A section that paints an opaque colour hides this, which is sometimes right
 * — a card should sit on the canvas, not dissolve into it. Rendering it once
 * here, rather than per-page, is also why every route — admin and judge
 * screens included — gets the same canvas without each page having to ask.
 */
@Component({
  selector: 'app-backdrop',
  templateUrl: './backdrop.html',
  styleUrl: './backdrop.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Backdrop {}
