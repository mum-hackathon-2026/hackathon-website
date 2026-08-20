import { ComponentFixture, TestBed } from '@angular/core/testing';
import { EVENT_PURPOSE, EVENT_SCALE } from '../../../core/event/event-content';
import { PurposeSection } from './purpose';

/** Walks the exported lists rather than restating them. */
describe('PurposeSection', () => {
  let fixture: ComponentFixture<PurposeSection>;

  function host(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function textsOf(selector: string): string[] {
    return Array.from(host().querySelectorAll(selector)).map((el) => el.textContent?.trim() ?? '');
  }

  beforeEach(async () => {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({ imports: [PurposeSection] }).compileComponents();
    fixture = TestBed.createComponent(PurposeSection);
    await fixture.whenStable();
  });

  it('gives every reason the event exists', () => {
    expect(textsOf('.purpose__item')).toEqual([...EVENT_PURPOSE]);
  });

  it('pairs each figure with what it counts', () => {
    expect(textsOf('.purpose__value')).toEqual(EVENT_SCALE.map((f) => f.value));
    expect(textsOf('.purpose__label')).toEqual(EVENT_SCALE.map((f) => f.label));
  });

  /**
   * The 500-student target is 100 teams of five, and the site caps teams at
   * four. Until that conflict is settled the figure must not appear, or the
   * page quotes a total its own team limit cannot reach.
   */
  it('does not quote a participant total the team limit cannot reach', () => {
    expect(host().textContent).not.toContain('500');
  });
});
