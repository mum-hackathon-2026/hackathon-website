import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { FAQS } from '../../../core/event/event-content';

@Component({
  selector: 'app-home-faq',
  templateUrl: './faq.html',
  styleUrl: './faq.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FaqSection {
  protected readonly faqs = FAQS;

  /** Questions can be opened independently, so this holds every expanded index. */
  private readonly expanded = signal(new Set<number>());

  protected isOpen(index: number): boolean {
    return this.expanded().has(index);
  }

  protected toggle(index: number): void {
    this.expanded.update((current) => {
      const next = new Set(current);
      if (!next.delete(index)) {
        next.add(index);
      }
      return next;
    });
  }
}
