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

  it('should create and render the 7 criteria and scoring bands', () => {
    expect(component).toBeTruthy();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.textContent).toContain('System Design & Architecture');
    expect(compiled.textContent).toContain('Working Core Prototype');
    expect(compiled.textContent).toContain('Problem Statement Understanding');
    expect(compiled.textContent).toContain('Performance Scoring Bands');
  });
});
