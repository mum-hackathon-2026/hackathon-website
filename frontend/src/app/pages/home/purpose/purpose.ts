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
import { EVENT_PURPOSE, EVENT_SCALE } from '../../../core/event/event-content';

/**
 * What the event is for, and how big it is.
 *
 * Sits between the theme and the FAQ: the theme says what you would build, this
 * says why it is worth your eight days, and the FAQ answers the rest.
 */
@Component({
  selector: 'app-home-purpose',
  templateUrl: './purpose.html',
  styleUrl: './purpose.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PurposeSection implements OnDestroy {
  protected readonly purpose = EVENT_PURPOSE;
  protected readonly scale = EVENT_SCALE;

  private readonly sectionRef = viewChild<ElementRef<HTMLElement>>('sectionRef');
  private readonly ngZone = inject(NgZone);
  private observer: IntersectionObserver | null = null;

  constructor() {
    afterNextRender(() => {
      const el = this.sectionRef()?.nativeElement;
      if (!el || typeof window === 'undefined' || typeof IntersectionObserver === 'undefined') {
        return;
      }

      this.ngZone.runOutsideAngular(() => {
        const reduceMotion =
          typeof window.matchMedia === 'function' &&
          window.matchMedia('(prefers-reduced-motion: reduce)').matches;

        if (reduceMotion) return;

        const valueEls = el.querySelectorAll<HTMLElement>('.purpose__value');
        if (!valueEls.length) return;

        this.observer = new IntersectionObserver(
          (entries) => {
            const entry = entries[0];
            if (entry && entry.isIntersecting) {
              this.animateNumbers(valueEls);
              this.observer?.disconnect();
              this.observer = null;
            }
          },
          { threshold: 0.25 },
        );

        this.observer.observe(el);
      });
    });
  }

  ngOnDestroy(): void {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
  }

  private animateNumbers(elements: NodeListOf<HTMLElement>): void {
    const targets = Array.from(elements).map((el) => {
      const num = parseInt(el.textContent?.trim() || '0', 10);
      return { el, target: isNaN(num) ? 0 : num };
    });

    const duration = 1200; // ms
    const startTime = performance.now();

    const frame = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(1, elapsed / duration);
      // Ease out cubic
      const ease = 1 - Math.pow(1 - progress, 3);

      for (const item of targets) {
        const current = Math.round(item.target * ease);
        item.el.textContent = String(current);
      }

      if (progress < 1) {
        requestAnimationFrame(frame);
      } else {
        for (const item of targets) {
          item.el.textContent = String(item.target);
        }
      }
    };

    requestAnimationFrame(frame);
  }
}
