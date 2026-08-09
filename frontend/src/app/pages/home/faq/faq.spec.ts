import { TestBed } from '@angular/core/testing';
import { FaqSection } from './faq';

describe('FaqSection', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [FaqSection] }).compileComponents();
  });

  it('starts with every answer collapsed', async () => {
    const fixture = TestBed.createComponent(FaqSection);
    await fixture.whenStable();
    const host = fixture.nativeElement as HTMLElement;

    const triggers = host.querySelectorAll<HTMLButtonElement>('.faq__trigger');
    expect(triggers.length).toBeGreaterThan(0);
    for (const trigger of triggers) {
      expect(trigger.getAttribute('aria-expanded')).toBe('false');
    }
  });

  it('toggles one answer without affecting the others', async () => {
    const fixture = TestBed.createComponent(FaqSection);
    await fixture.whenStable();
    const host = fixture.nativeElement as HTMLElement;

    const triggers = host.querySelectorAll<HTMLButtonElement>('.faq__trigger');
    const answers = host.querySelectorAll<HTMLElement>('.faq__answer');

    triggers[1].click();
    await fixture.whenStable();

    expect(triggers[1].getAttribute('aria-expanded')).toBe('true');
    expect(answers[1].hidden).toBe(false);
    expect(triggers[0].getAttribute('aria-expanded')).toBe('false');
    expect(answers[0].hidden).toBe(true);

    triggers[1].click();
    await fixture.whenStable();

    expect(triggers[1].getAttribute('aria-expanded')).toBe('false');
    expect(answers[1].hidden).toBe(true);
  });

  it('links each trigger to the answer it controls', async () => {
    const fixture = TestBed.createComponent(FaqSection);
    await fixture.whenStable();
    const host = fixture.nativeElement as HTMLElement;

    for (const trigger of host.querySelectorAll<HTMLButtonElement>('.faq__trigger')) {
      const controlled = trigger.getAttribute('aria-controls');
      expect(controlled).toBeTruthy();
      expect(host.querySelector(`#${controlled}`)).toBeTruthy();
    }
  });
});
