import { TestBed } from '@angular/core/testing';
import { FAQS } from '../../../core/event/event-content';
import { FaqSection } from './faq';

// The accordion mechanics belong to FaqList and are tested there. What matters
// here is that the section hands it the homepage's short list.
describe('FaqSection', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [FaqSection] }).compileComponents();
  });

  it('renders the homepage FAQ list', async () => {
    const fixture = TestBed.createComponent(FaqSection);
    await fixture.whenStable();
    const host = fixture.nativeElement as HTMLElement;

    const questions = Array.from(host.querySelectorAll('.faq__question-text')).map((el) =>
      el.textContent?.trim(),
    );
    expect(questions).toEqual(FAQS.map((faq) => faq.question));
  });

  it('starts with every answer collapsed', async () => {
    const fixture = TestBed.createComponent(FaqSection);
    await fixture.whenStable();
    const host = fixture.nativeElement as HTMLElement;

    const triggers = host.querySelectorAll<HTMLButtonElement>('.faq__trigger');
    expect(triggers.length).toBe(FAQS.length);
    for (const trigger of triggers) {
      expect(trigger.getAttribute('aria-expanded')).toBe('false');
    }
  });
});
