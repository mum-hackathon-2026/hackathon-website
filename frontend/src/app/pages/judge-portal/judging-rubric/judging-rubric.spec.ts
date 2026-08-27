import { ComponentFixture, TestBed } from '@angular/core/testing';
import { JudgingRubric } from './judging-rubric';

describe('JudgingRubric', () => {
  let component: JudgingRubric;
  let fixture: ComponentFixture<JudgingRubric>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [JudgingRubric],
    }).compileComponents();

    fixture = TestBed.createComponent(JudgingRubric);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create and link out to the judging criteria document', () => {
    expect(component).toBeTruthy();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.textContent).toContain('Judging Criteria Document');
    const link = compiled.querySelector<HTMLAnchorElement>('a');
    expect(link?.href).toBe(component['rubricDocUrl']);
  });
});
