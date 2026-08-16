import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TeamResult } from '../../../core/results/results';
import { RankingsTable } from './rankings-table';

function result(over: Partial<TeamResult> & Pick<TeamResult, 'teamId' | 'teamName'>): TeamResult {
  return {
    projectTitle: `Project ${over.teamId}`,
    trackLabel: 'Open Innovation',
    finalScore: 80,
    rank: 1,
    outcome: 'finalist',
    judgeCount: 3,
    tied: false,
    isMine: false,
    ...over,
  };
}

const ROWS: readonly TeamResult[] = [
  result({ teamId: 1, teamName: 'NeuralNest', rank: 1, finalScore: 87.3, outcome: 'winner' }),
  result({ teamId: 2, teamName: 'Quantum Leap', rank: 2, finalScore: 84.6, isMine: true }),
  result({ teamId: 3, teamName: 'HealthHive', rank: 3, finalScore: 77.2, tied: true }),
  result({ teamId: 4, teamName: 'CipherCraft', rank: 3, finalScore: 77.2, tied: true }),
  result({ teamId: 5, teamName: 'MapMind', rank: 5, finalScore: 67.9 }),
];

describe('RankingsTable', () => {
  let fixture: ComponentFixture<RankingsTable>;

  function host(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function rows(): HTMLTableRowElement[] {
    return Array.from(host().querySelectorAll<HTMLTableRowElement>('tbody tr'));
  }

  function cell(index: number, selector: string): string | null {
    return rows()[index].querySelector(selector)?.textContent?.trim() ?? null;
  }

  async function render(data: readonly TeamResult[] = ROWS) {
    fixture.componentRef.setInput('rows', data);
    await fixture.whenStable();
  }

  beforeEach(async () => {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({ imports: [RankingsTable] }).compileComponents();
    fixture = TestBed.createComponent(RankingsTable);
  });

  it('renders one row per team, in the order given', async () => {
    await render();

    expect(rows().length).toBe(ROWS.length);
    expect(rows().map((r) => r.querySelector('.rankings__team')!.textContent!.trim())).toEqual([
      'NeuralNest',
      'Quantum Leap',
      'HealthHive',
      'CipherCraft',
      'MapMind',
    ]);
  });

  it('shows each team’s rank, track and project', async () => {
    await render();

    expect(cell(0, '.rankings__rank')).toBe('1');
    expect(cell(0, '.rankings__track')).toBe('Open Innovation');
    expect(cell(0, '.rankings__project')).toBe('Project 1');
  });

  /*
   * The leading "=" is what tells a reader that two teams share a place and the
   * next number is not a mistake. Without it a table jumping 3, 3, 5 reads as
   * a bug in the ranking.
   */
  it('marks a shared rank with an equals sign', async () => {
    await render();

    expect(cell(2, '.rankings__rank')).toBe('=3');
    expect(cell(3, '.rankings__rank')).toBe('=3');
    expect(cell(4, '.rankings__rank')).toBe('5');
  });

  it('shows scores to one decimal, so the column lines up', async () => {
    await render();

    expect(cell(0, '.rankings__score')).toBe('87.3');
    expect(cell(4, '.rankings__score')).toBe('67.9');
  });

  it('formats a whole score to one decimal too', async () => {
    await render([result({ teamId: 9, teamName: 'Round', finalScore: 80 })]);

    expect(cell(0, '.rankings__score')).toBe('80.0');
  });

  describe('the reader’s own team', () => {
    it('picks it out by name as well as by highlight', async () => {
      await render();

      expect(cell(1, '.rankings__you')).toBe('You');
      expect(rows()[1].classList.contains('rankings__row--mine')).toBe(true);
    });

    // The colour alone would say nothing to a reader who cannot see it, so the
    // marker is a word too — and only on the one row.
    it('marks exactly one row', async () => {
      await render();

      expect(host().querySelectorAll('.rankings__you').length).toBe(1);
      expect(host().querySelectorAll('.rankings__row--mine').length).toBe(1);
    });

    it('marks none when the reader has no team in the table', async () => {
      await render(ROWS.map((row) => ({ ...row, isMine: false })));

      expect(host().querySelector('.rankings__you')).toBeNull();
      expect(host().querySelector('.rankings__row--mine')).toBeNull();
    });
  });

  it('captions the table with how many teams it covers', async () => {
    await render();

    expect(host().querySelector('caption')!.textContent?.replace(/\s+/g, ' ').trim()).toBe(
      `Final standings for all ${ROWS.length} teams`,
    );
  });

  it('heads every column', async () => {
    await render();
    const headers = Array.from(host().querySelectorAll('thead th'));

    expect(headers.map((h) => h.textContent!.trim())).toEqual(['Rank', 'Team', 'Track', 'Score']);
    for (const header of headers) {
      expect(header.getAttribute('scope')).toBe('col');
    }
  });

  // Scrolls inside its own wrapper rather than widening the page.
  it('keeps its own horizontal scroll', async () => {
    await render();

    expect(host().querySelector('.table-scroll > table')).toBeTruthy();
  });

  it('renders just the header when there are no results', async () => {
    await render([]);

    expect(rows().length).toBe(0);
    expect(host().querySelector('thead')).toBeTruthy();
  });
});
