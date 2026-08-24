import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AssignmentStatus, AssignmentView } from '../../../core/judge/judge';
import { AssignmentTable } from './assignment-table';

function row(
  id: number,
  status: AssignmentStatus,
  over: Partial<AssignmentView> = {},
): AssignmentView {
  return {
    id,
    teamId: 100 + id,
    teamName: `Team ${id}`,
    projectTitle: `Project ${id}`,
    trackLabel: 'Open Innovation',
    summary: 'A summary.',
    githubUrl: 'https://github.com/example/repo',
    deployedUrl: 'https://example.com',
    slideDeckUrl: '',
    videoDemoUrl: '',
    memberCount: 4,
    status,
    assignedAt: new Date('2026-10-10T09:00:00+08:00'),
    completedAt: null,
    overallFeedback: '',
    scores: [],
    scoredCount: 0,
    criteriaCount: 4,
    weightedTotal: 0,
    allScored: false,
    locked: false,
    ...over,
  };
}

const ROWS: readonly AssignmentView[] = [
  row(1, 'pending'),
  row(2, 'in_progress', { scoredCount: 2 }),
  row(3, 'completed', { scoredCount: 4, allScored: true, locked: true }),
  row(4, 'declined'),
];

describe('AssignmentTable', () => {
  let fixture: ComponentFixture<AssignmentTable>;

  function host(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function bodyRows(): HTMLTableRowElement[] {
    return Array.from(host().querySelectorAll<HTMLTableRowElement>('tbody tr'));
  }

  function openLink(index: number): HTMLAnchorElement | null {
    return bodyRows()[index].querySelector<HTMLAnchorElement>('.assignments__open');
  }

  function declineButton(index: number): HTMLButtonElement | null {
    return bodyRows()[index].querySelector<HTMLButtonElement>('.link-button--danger');
  }

  async function render(rows: readonly AssignmentView[] = ROWS, busy = false) {
    fixture.componentRef.setInput('rows', rows);
    fixture.componentRef.setInput('busy', busy);
    await fixture.whenStable();
  }

  beforeEach(async () => {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [AssignmentTable],
      providers: [provideRouter([])],
    }).compileComponents();
    fixture = TestBed.createComponent(AssignmentTable);
  });

  it('renders one row per assignment', async () => {
    await render();

    expect(bodyRows().length).toBe(ROWS.length);
    expect(bodyRows()[0].querySelector('.assignments__team')!.textContent?.trim()).toBe('Team 1');
    expect(bodyRows()[0].querySelector('.assignments__project')!.textContent?.trim()).toBe(
      'Project 1',
    );
  });

  it('renders nothing but the header when there are no assignments', async () => {
    await render([]);

    expect(bodyRows().length).toBe(0);
    expect(host().querySelectorAll('thead th').length).toBe(5);
  });

  it('shows each row’s status as a pill', async () => {
    await render();

    expect(bodyRows()[0].querySelector('.status-pill--pending')).toBeTruthy();
    expect(bodyRows()[2].querySelector('.status-pill--completed')).toBeTruthy();
  });

  it('counts the scored criteria against the total', async () => {
    await render();

    expect(bodyRows()[1].querySelector('.assignments__progress')!.textContent?.trim()).toBe(
      '2/4 scored',
    );
  });

  // A declined assignment was never going to be scored, so a 0/4 there would
  // read as work outstanding rather than work handed back.
  it('shows a dash instead of a count on a declined row', async () => {
    await render();

    expect(bodyRows()[3].querySelector('.assignments__progress')!.textContent?.trim()).toBe('—');
  });

  describe('the action column', () => {
    it('labels the action by how far the review has got', async () => {
      await render();

      expect(openLink(0)!.textContent?.trim()).toBe('Start review');
      expect(openLink(1)!.textContent?.trim()).toBe('Continue');
      expect(openLink(2)!.textContent?.trim()).toBe('View');
    });

    // Declined is the one status with no review behind it, so there is nothing
    // for a link to open.
    it('offers no way in to a declined assignment', async () => {
      await render();

      expect(openLink(3)).toBeNull();
    });

    it('links each action at that assignment’s review', async () => {
      await render();

      expect(openLink(0)!.getAttribute('href')).toBe('/judge/reviews/1');
      expect(openLink(2)!.getAttribute('href')).toBe('/judge/reviews/3');
    });
  });

  describe('declining', () => {
    /*
     * Only a review that has not been started can be handed back. Offering it on
     * an in-progress or completed row would invite discarding work already done.
     */
    it('offers to decline only what has not been started', async () => {
      await render();

      expect(declineButton(0)).toBeTruthy();
      expect(declineButton(1)).toBeNull();
      expect(declineButton(2)).toBeNull();
      expect(declineButton(3)).toBeNull();
    });

    it('emits the assignment id the judge stepped back from', async () => {
      await render();
      const emitted: number[] = [];
      fixture.componentInstance.declined.subscribe((id) => emitted.push(id));

      declineButton(0)!.click();
      await fixture.whenStable();

      expect(emitted).toEqual([1]);
    });

    // The portal owns the mutation; the table only has to stop a second click
    // reaching it while the first is in flight.
    it('disables declining while a mutation is in flight', async () => {
      await render(ROWS, true);

      expect(declineButton(0)!.disabled).toBe(true);
    });

    it('re-enables it once the mutation settles', async () => {
      await render(ROWS, true);
      await render(ROWS, false);

      expect(declineButton(0)!.disabled).toBe(false);
    });
  });

  // The table scrolls inside its own wrapper rather than widening the page —
  // a body that scrolls sideways is the failure this guards.
  it('keeps its own horizontal scroll', async () => {
    await render();

    expect(host().querySelector('.table-scroll > table')).toBeTruthy();
  });

  it('captions the table for screen readers', async () => {
    await render();

    expect(host().querySelector('caption')!.textContent?.trim()).toBe(
      'Teams assigned to you for judging',
    );
  });
});
