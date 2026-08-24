import { ChangeDetectionStrategy, Component } from '@angular/core';

/**
 * The page's background: a fixed dot grid lit by four drifting colour wells in
 * the Google palette.
 *
 * The grid never moves and the wells do, so a dot brightens and fades as
 * colour passes beneath it — the page reads as a display waking up rather than
 * as shapes sliding around behind the text. That is also why the wells are
 * separate elements: moving them as one sheet would give away the trick.
 *
 * Presentation only. It has no state, no inputs and no behaviour, and it
 * renders from `app.html` outside `<router-outlet>` so no page template refers
 * to it. Deleting it is one line and this folder.
 *
 * It is what the page's translucent section backgrounds are translucent *for*.
 * A section that paints an opaque colour hides this, which is sometimes right
 * — a card should sit on the grid, not dissolve into it.
 */
@Component({
  selector: 'app-backdrop',
  templateUrl: './backdrop.html',
  styleUrl: './backdrop.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Backdrop {}
