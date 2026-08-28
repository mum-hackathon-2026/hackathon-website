import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ConnectSection, SOCIAL_CLUBS } from './connect';

describe('ConnectSection', () => {
  let fixture: ComponentFixture<ConnectSection>;

  function host(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  beforeEach(async () => {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [ConnectSection],
    }).compileComponents();

    fixture = TestBed.createComponent(ConnectSection);
    fixture.detectChanges();
    await fixture.whenStable();
  });

  it('renders section title and subtitle', () => {
    expect(host().querySelector('.connect__title')?.textContent).toContain('Connect with us');
    expect(host().querySelector('.connect__subtitle')).toBeTruthy();
  });

  it('renders both GDG MUM and MUMTEC Instagram cards', () => {
    const cards = host().querySelectorAll('.connect-card');
    expect(cards.length).toBe(SOCIAL_CLUBS.length);

    const links = Array.from(host().querySelectorAll<HTMLAnchorElement>('.btn-instagram')).map(
      (a) => a.href,
    );

    expect(links).toContain('https://www.instagram.com/gdg.mum/');
    expect(links).toContain('https://www.instagram.com/mumtec.monash/');
  });

  it('displays handles and names for the clubs', () => {
    const text = host().textContent ?? '';
    expect(text).toContain('@gdg.mum');
    expect(text).toContain('@mumtec.monash');
  });
});
