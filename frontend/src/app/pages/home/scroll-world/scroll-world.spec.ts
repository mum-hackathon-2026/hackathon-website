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

  describe('the judging criteria button', () => {
    function button(): HTMLAnchorElement {
      return (fixture.nativeElement as HTMLElement).querySelector<HTMLAnchorElement>(
        '.sw-cta-btn--ghost',
      )!;
    }

    /**
     * This is the bug it shipped with: the button pointed at `#theme`, and no
     * element on the page has that id. Nothing connected the two, so nothing
     * noticed. Asserting against the id the component publishes is what keeps
     * the link and its target from drifting apart again.
     */
    it('points at the section the component names, not a guess', () => {
      expect(button().getAttribute('href')).toBe('#criteria');
    });

    it('scrolls to that section instead of letting the browser jump', () => {
      const target = document.createElement('section');
      target.id = 'criteria';
      document.body.appendChild(target);
      const scrollIntoView = vi.fn();
      target.scrollIntoView = scrollIntoView;

      const event = new MouseEvent('click', { cancelable: true });
      button().dispatchEvent(event);

      expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' });
      expect(event.defaultPrevented).toBe(true);

      target.remove();
    });

    // Off the home page the section is not in the document. Swallowing the
    // click there would leave the button doing nothing at all; letting the
    // browser have it means the href still navigates.
    it('leaves the click alone when the section is not on the page', () => {
      const event = new MouseEvent('click', { cancelable: true });
      button().dispatchEvent(event);

      expect(event.defaultPrevented).toBe(false);
    });
  });
});
