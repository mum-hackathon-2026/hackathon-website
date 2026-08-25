import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ScrollWorldComponent } from './scroll-world';

describe('ScrollWorldComponent', () => {
  let component: ScrollWorldComponent;
  let fixture: ComponentFixture<ScrollWorldComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ScrollWorldComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(ScrollWorldComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create successfully', () => {
    expect(component).toBeTruthy();
  });

  it('should render container with scroll-world class', () => {
    const host = fixture.nativeElement as HTMLElement;
    const container = host.querySelector('.scroll-world');
    expect(container).not.toBeNull();
  });
});
