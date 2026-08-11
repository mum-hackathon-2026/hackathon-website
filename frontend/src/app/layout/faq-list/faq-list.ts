import { ChangeDetectionStrategy, Component, input, signal } from '@angular/core';
import { Faq } from '../../core/event/event-content';

/**
 * Accordion of questions and answers.
 *
 * The homepage shows a short list and the organisers page shows the full one, so
 * the toggle behaviour and its aria wiring live here rather than in both.
 */
@Component({
  selector: 'app-faq-list',
  templateUrl: './faq-list.html',
  styleUrl: './faq-list.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FaqList {
  readonly faqs = input.required<readonly Faq[]>();

  /** Namespaces the answer ids, so two lists on one page cannot collide. */
  readonly idPrefix = input('faq-answer');

  /** Questions can be opened independently, so this holds every expanded index. */
  private readonly expanded = signal(new Set<number>());

  protected answerId(index: number): string {
    return `${this.idPrefix()}-${index}`;
  }

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
