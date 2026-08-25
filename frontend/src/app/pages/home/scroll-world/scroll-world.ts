import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  NgZone,
  OnDestroy,
  afterNextRender,
  inject,
  viewChild,
} from '@angular/core';

@Component({
  selector: 'app-scroll-world',
  standalone: true,
  templateUrl: './scroll-world.html',
  styleUrl: './scroll-world.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ScrollWorldComponent implements OnDestroy {
  /**
   * The section the "Explore judging criteria" button jumps to.
   *
   * Named here rather than written into the template twice, because the id and
   * the link have to agree and nothing else checks that they do — the button
   * pointed at `#theme` for a while, which is not an id this page has.
   */
  protected readonly criteriaId = 'criteria';

  private readonly rootRef = viewChild<ElementRef<HTMLElement>>('scrollRoot');
  private readonly ngZone = inject(NgZone);
  private cleanupFn: (() => void) | null = null;

  constructor() {
    afterNextRender(() => {
      const root = this.rootRef()?.nativeElement;
      if (root) {
        this.ngZone.runOutsideAngular(() => {
          this.cleanupFn = this.initLocked60FpsEngine(root);
        });
      }
    });
  }

  /**
   * Scrolls to the criteria section.
   *
   * The button is a real anchor, so middle-click and right-click still work and
   * the target is in the status bar. This only takes over the plain click: the
   * section is on this same page, so letting the browser jump would leave the
   * reader at the section with no sense of having travelled, and the router's
   * anchor scrolling does not re-fire for a fragment on the route it is
   * already on.
   */
  protected scrollToCriteria(event: Event): void {
    if (typeof document === 'undefined') return;

    const target = document.getElementById(this.criteriaId);
    if (!target) return;

    event.preventDefault();
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  ngOnDestroy(): void {
    if (this.cleanupFn) {
      this.cleanupFn();
      this.cleanupFn = null;
    }
  }

  private initLocked60FpsEngine(root: HTMLElement): () => void {
    const hasMM = typeof window !== 'undefined' && typeof window.matchMedia === 'function';
    const reduceMotion = hasMM
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false;

    // Cached elements
    const scene1 = root.querySelector<HTMLElement>('#scene-spark');
    const scene2 = root.querySelector<HTMLElement>('#scene-build');
    const copy1 = root.querySelector<HTMLElement>('#copy-spark');
    const copy2 = root.querySelector<HTMLElement>('#copy-build');
    const dot1 = root.querySelector<HTMLElement>('#dot-spark');
    const dot2 = root.querySelector<HTMLElement>('#dot-build');
    const progressBar = root.querySelector<HTMLElement>('.sw-progress-fill');
    const hint = root.querySelector<HTMLElement>('.sw-hint');

    let rootTop = 0;
    let rootHeight = 0;
    let windowHeight = typeof window !== 'undefined' ? window.innerHeight : 800;
    let maxScroll = 1;

    function measure() {
      if (typeof window === 'undefined') return;
      windowHeight = window.innerHeight;
      const rect = root.getBoundingClientRect();
      const scrollY = window.scrollY || window.pageYOffset || 0;
      rootTop = rect.top + scrollY;
      rootHeight = root.offsetHeight;
      maxScroll = Math.max(1, rootHeight - windowHeight);
    }

    measure();

    let targetP = 0;
    let currentP = 0;
    let isRunning = false;
    let isDestroyed = false;
    let rafId: number | null = null;
    let lastRenderedP = -1;

    const clamp = (val: number, min = 0, max = 1) => (val < min ? min : val > max ? max : val);
    const smooth = (x: number) => {
      const c = clamp(x);
      return c * c * (3 - 2 * c);
    };

    function render(p: number) {
      if (!scene1 || !scene2 || !copy1 || !copy2) return;
      if (Math.abs(p - lastRenderedP) < 0.0002) return;
      lastRenderedP = p;

      const p1 = clamp(p / 0.4);
      const p2 = clamp((p - 0.3) / 0.4);

      // Fast hardware 3D transforms
      if (!reduceMotion) {
        if (p < 0.35) {
          const s1Scale = (1 + p1 * 0.12).toFixed(4);
          const s1X = (-p1 * 16).toFixed(2);
          const s1Y = (-p1 * 10).toFixed(2);
          scene1.style.transform = `translate3d(${s1X}px, ${s1Y}px, 0) scale3d(${s1Scale}, ${s1Scale}, 1)`;
          scene2.style.transform = `translate3d(24px, 12px, 0) scale3d(0.96, 0.96, 1)`;
        } else {
          const s2Scale = (0.97 + p2 * 0.1).toFixed(4);
          const s2X = ((1 - p2) * 16).toFixed(2);
          const s2Y = ((1 - p2) * 8).toFixed(2);
          scene1.style.transform = `translate3d(-18px, -12px, 0) scale3d(1.12, 1.12, 1)`;
          scene2.style.transform = `translate3d(${s2X}px, ${s2Y}px, 0) scale3d(${s2Scale}, ${s2Scale}, 1)`;
        }
      }

      // Snappy, quick scene crossfade with tight center transition
      const s1Op = p < 0.22 ? 1 : smooth(1 - (p - 0.22) / 0.18);
      const s2Op = p > 0.4 ? 1 : smooth((p - 0.22) / 0.18);
      scene1.style.opacity = s1Op.toFixed(3);
      scene2.style.opacity = s2Op.toFixed(3);
      scene1.style.visibility = s1Op > 0.01 ? 'visible' : 'hidden';
      scene2.style.visibility = s2Op > 0.01 ? 'visible' : 'hidden';

      // Snappy copy crossfade & parallax
      const copy1Op = p < 0.24 ? smooth(1 - p / 0.24) : 0;
      const copy2Op = p > 0.3 ? smooth((p - 0.3) / 0.26) : 0;
      copy1.style.opacity = copy1Op.toFixed(3);
      copy2.style.opacity = copy2Op.toFixed(3);
      if (!reduceMotion) {
        copy1.style.transform = `translate3d(0, ${((0.15 - p1) * 18).toFixed(2)}px, 0)`;
        copy2.style.transform = `translate3d(0, ${((0.6 - p) * 20).toFixed(2)}px, 0)`;
      }
      copy1.style.pointerEvents = copy1Op > 0.5 ? 'auto' : 'none';
      copy2.style.pointerEvents = copy2Op > 0.5 ? 'auto' : 'none';

      // Top progress bar
      if (progressBar) {
        progressBar.style.transform = `scaleX(${p.toFixed(4)})`;
      }
      if (dot1 && dot2) {
        const isDot1 = p < 0.32;
        if (dot1.classList.contains('is-active') !== isDot1) {
          dot1.classList.toggle('is-active', isDot1);
          dot2.classList.toggle('is-active', !isDot1);
        }
      }
      if (hint) {
        hint.style.opacity = clamp(1 - p * 6).toFixed(3);
      }
    }

    function computeScrollProgress() {
      const scrollY = window.scrollY || window.pageYOffset || 0;
      const scrolled = scrollY - rootTop;
      return clamp(scrolled / maxScroll);
    }

    let lastTime = 0;
    function tick(timestamp: number) {
      if (isDestroyed) return;

      if (!lastTime) lastTime = timestamp;
      const delta = Math.min(32, timestamp - lastTime);
      lastTime = timestamp;

      // Snappy, high-refresh 60-120fps tracking (0.48 factor = instantaneous responsiveness without drag)
      const diff = targetP - currentP;
      if (Math.abs(diff) < 0.0005) {
        currentP = targetP;
        render(currentP);
        isRunning = false;
        lastTime = 0;
        return;
      }

      // Smooth tight interpolation
      currentP += diff * (reduceMotion ? 1 : Math.min(1, 0.45 * (delta / 16.66)));
      render(currentP);
      rafId = requestAnimationFrame(tick);
    }

    function onScroll() {
      if (isDestroyed) return;
      targetP = computeScrollProgress();
      if (!isRunning) {
        isRunning = true;
        lastTime = 0;
        rafId = requestAnimationFrame(tick);
      }
    }

    function onResize() {
      if (isDestroyed) return;
      measure();
      targetP = computeScrollProgress();
      currentP = targetP;
      render(currentP);
    }

    if (dot1) {
      dot1.addEventListener('click', () => {
        window.scrollTo({ top: rootTop, behavior: reduceMotion ? 'auto' : 'smooth' });
      });
    }
    if (dot2) {
      dot2.addEventListener('click', () => {
        window.scrollTo({
          top: rootTop + rootHeight * 0.52,
          behavior: reduceMotion ? 'auto' : 'smooth',
        });
      });
    }

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onResize, { passive: true });
    window.addEventListener('orientationchange', onResize, { passive: true });

    targetP = computeScrollProgress();
    currentP = targetP;
    render(currentP);

    return () => {
      isDestroyed = true;
      if (rafId != null) cancelAnimationFrame(rafId);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
    };
  }
}
