import { ChangeDetectionStrategy, Component } from '@angular/core';
import { FAQS } from '../../../core/event/event-content';
import { FaqList } from '../../../layout/faq-list/faq-list';

@Component({
  selector: 'app-home-faq',
  imports: [FaqList],
  templateUrl: './faq.html',
  styleUrl: './faq.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FaqSection {
  /** The short list. The organisers page carries the full set. */
  protected readonly faqs = FAQS;
}
