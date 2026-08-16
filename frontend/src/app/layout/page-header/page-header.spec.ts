import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { PageHeader } from './page-header';

@Component({
  imports: [PageHeader],
  template: `<app-page-header title="Hosted title"
    ><button type="button">Act</button></app-page-header
  >`,
})
class Hosted {}

describe('PageHeader', () => {
  let fixture: ComponentFixture<PageHeader>;

  function host(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function text(selector: string): string | null {
    return host().querySelector(selector)?.textContent?.trim() ?? null;
  }

  beforeEach(async () => {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({ imports: [PageHeader] }).compileComponents();
    fixture = TestBed.createComponent(PageHeader);
    fixture.componentRef.setInput('title', 'My submission');
    await fixture.whenStable();
  });

  it('renders the title as the page heading', () => {
    const heading = host().querySelector('.page-header__title')!;
    expect(heading.tagName).toBe('H1');
    expect(heading.textContent?.trim()).toBe('My submission');
  });

  // Both are optional inputs, so an undefined one must leave no empty element
  // behind — an empty <p> still occupies the layout's gap.
  it('omits the eyebrow and subtitle when neither is given', () => {
    expect(host().querySelector('.page-header__eyebrow')).toBeNull();
    expect(host().querySelector('.page-header__subtitle')).toBeNull();
  });

  it('shows the eyebrow and subtitle when they are given', async () => {
    fixture.componentRef.setInput('eyebrow', 'Participant');
    fixture.componentRef.setInput('subtitle', 'One submission per team.');
    await fixture.whenStable();

    expect(text('.page-header__eyebrow')).toBe('Participant');
    expect(text('.page-header__subtitle')).toBe('One submission per team.');
  });

  it('drops each optional line again when it is cleared', async () => {
    fixture.componentRef.setInput('eyebrow', 'Participant');
    await fixture.whenStable();
    expect(host().querySelector('.page-header__eyebrow')).toBeTruthy();

    fixture.componentRef.setInput('eyebrow', undefined);
    await fixture.whenStable();
    expect(host().querySelector('.page-header__eyebrow')).toBeNull();
  });

  it('projects page actions beside the title', async () => {
    const hosted = TestBed.createComponent(Hosted);
    await hosted.whenStable();

    const actions = (hosted.nativeElement as HTMLElement).querySelector('.page-header__actions')!;
    expect(actions.querySelector('button')?.textContent?.trim()).toBe('Act');
  });
});
