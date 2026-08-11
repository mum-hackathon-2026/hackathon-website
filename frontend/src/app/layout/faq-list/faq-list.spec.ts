import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Faq } from '../../core/event/event-content';
import { FaqList } from './faq-list';

const FAQS: readonly Faq[] = [
  { question: 'First question?', answer: 'First answer.' },
  { question: 'Second question?', answer: 'Second answer.' },
  { question: 'Third question?', answer: 'Third answer.' },
];

describe('FaqList', () => {
  let fixture: ComponentFixture<FaqList>;

  function host(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function triggers(): HTMLButtonElement[] {
    return Array.from(host().querySelectorAll<HTMLButtonElement>('.faq__trigger'));
  }

  function answers(): HTMLElement[] {
    return Array.from(host().querySelectorAll<HTMLElement>('.faq__answer'));
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [FaqList] }).compileComponents();
    fixture = TestBed.createComponent(FaqList);
    fixture.componentRef.setInput('faqs', FAQS);
    await fixture.whenStable();
  });

  it('renders one entry per question', () => {
    expect(triggers().map((t) => t.textContent?.trim())).toEqual([
      'First question?',
      'Second question?',
      'Third question?',
    ]);
  });

  it('starts with every answer collapsed', () => {
    for (const trigger of triggers()) {
      expect(trigger.getAttribute('aria-expanded')).toBe('false');
    }
    for (const answer of answers()) {
      expect(answer.hidden).toBe(true);
    }
  });

  it('toggles one answer without affecting the others', async () => {
    triggers()[1].click();
    await fixture.whenStable();

    expect(triggers()[1].getAttribute('aria-expanded')).toBe('true');
    expect(answers()[1].hidden).toBe(false);
    expect(answers()[0].hidden).toBe(true);
    expect(answers()[2].hidden).toBe(true);

    triggers()[1].click();
    await fixture.whenStable();

    expect(triggers()[1].getAttribute('aria-expanded')).toBe('false');
    expect(answers()[1].hidden).toBe(true);
  });

  it('keeps several answers open at once', async () => {
    triggers()[0].click();
    triggers()[2].click();
    await fixture.whenStable();

    expect(answers().map((a) => a.hidden)).toEqual([false, true, false]);
  });

  it('links each trigger to the answer it controls', () => {
    for (const trigger of triggers()) {
      const controlled = trigger.getAttribute('aria-controls');
      expect(controlled).toBeTruthy();
      expect(host().querySelector(`#${controlled}`)).toBeTruthy();
    }
  });

  it('namespaces answer ids so two lists on a page cannot collide', async () => {
    fixture.componentRef.setInput('idPrefix', 'organisers-faq');
    await fixture.whenStable();

    expect(answers().map((a) => a.id)).toEqual([
      'organisers-faq-0',
      'organisers-faq-1',
      'organisers-faq-2',
    ]);
  });
});
