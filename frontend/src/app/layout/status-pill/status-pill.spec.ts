import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ASSIGNMENT_STATUS_LABELS, AssignmentStatus } from '../../core/judge/judge';
import { StatusPill } from './status-pill';

describe('StatusPill', () => {
  let fixture: ComponentFixture<StatusPill>;

  function pill(): HTMLElement {
    return (fixture.nativeElement as HTMLElement).querySelector('.status-pill')!;
  }

  async function render(status: AssignmentStatus) {
    fixture.componentRef.setInput('status', status);
    await fixture.whenStable();
  }

  beforeEach(async () => {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({ imports: [StatusPill] }).compileComponents();
    fixture = TestBed.createComponent(StatusPill);
  });

  /*
   * Against the exported map rather than literals: the four labels are the
   * `assignments.status` vocabulary, and a rename there should surface here as
   * a template that stopped reading the map, not as a stale expectation.
   */
  it('labels every status the vocabulary allows', async () => {
    for (const [status, label] of Object.entries(ASSIGNMENT_STATUS_LABELS)) {
      await render(status as AssignmentStatus);
      expect(pill().textContent?.trim()).toBe(label);
    }
  });

  it('carries a modifier class per status so each gets its own treatment', async () => {
    await render('completed');
    expect(pill().classList.contains('status-pill--completed')).toBe(true);

    await render('declined');
    expect(pill().classList.contains('status-pill--declined')).toBe(true);
    expect(pill().classList.contains('status-pill--completed')).toBe(false);
  });

  // The dot is the same information as the label, in colour. Announcing it
  // would read the status twice.
  it('hides the colour dot from assistive technology', async () => {
    await render('pending');

    expect(pill().querySelector('.status-pill__dot')!.getAttribute('aria-hidden')).toBe('true');
  });
});
