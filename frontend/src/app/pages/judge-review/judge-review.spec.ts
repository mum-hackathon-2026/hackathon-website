import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { AuthService, Role, SESSION_STORAGE } from '../../core/auth/auth';
import { DEFAULT_EVENT_CONFIG, EVENT_CONFIG } from '../../core/event/event-config';
import { JudgeService, ReviewDraft } from '../../core/judge/judge';
import { JudgeReview } from './judge-review';

/** Seeded assignment ids, by the state they start in. */
const COMPLETED = 1;
const IN_PROGRESS = 2;
const PENDING = 3;
const DECLINED = 5;

interface Options {
  readonly assignmentId?: number | string;
  readonly judgingOpen?: boolean;
  readonly role?: Role;
}

let fixture: ComponentFixture<JudgeReview>;

async function render({
  assignmentId = PENDING,
  judgingOpen = true,
  role = 'judge' as Role,
}: Options = {}) {
  TestBed.resetTestingModule();
  await TestBed.configureTestingModule({
    imports: [JudgeReview],
    providers: [
      provideRouter([]),
      { provide: SESSION_STORAGE, useValue: null },
      {
        provide: EVENT_CONFIG,
        useValue: {
          ...DEFAULT_EVENT_CONFIG,
          settings: { ...DEFAULT_EVENT_CONFIG.settings, judgingOpen },
        },
      },
      {
        provide: ActivatedRoute,
        useValue: {
          paramMap: of(convertToParamMap({ assignmentId: String(assignmentId) })),
        },
      },
    ],
  }).compileComponents();

  TestBed.inject(AuthService).signIn(role);

  fixture = TestBed.createComponent(JudgeReview);
  await fixture.whenStable();
  return fixture.nativeElement as HTMLElement;
}

function host(): HTMLElement {
  return fixture.nativeElement as HTMLElement;
}

function scoreInputs(): HTMLInputElement[] {
  return Array.from(host().querySelectorAll<HTMLInputElement>('input[type="number"]'));
}

async function typeScore(index: number, value: string) {
  const input = scoreInputs()[index];
  input.value = value;
  input.dispatchEvent(new Event('input'));
  await fixture.whenStable();
}

/** Fills every criterion at the same fraction of its maximum. */
async function scoreAll(fraction: number) {
  const inputs = scoreInputs();
  const criteria = TestBed.inject(JudgeService).criteria();
  for (let i = 0; i < inputs.length; i++) {
    await typeScore(i, String(criteria[i].maxScore * fraction));
  }
}

function total(): string {
  return host().querySelector('.actions__total strong')?.textContent?.trim() ?? '';
}

function submitButton(): HTMLButtonElement | null {
  return host().querySelector<HTMLButtonElement>('.actions__buttons .button--primary');
}

async function clickConfirm() {
  const confirm = host().querySelector<HTMLButtonElement>(
    '.confirm__actions .button--primary, .confirm__actions .button--danger-solid',
  );
  confirm!.click();
  await fixture.whenStable();
}

describe('JudgeReview', () => {
  describe('finding the assignment', () => {
    it('says so when the id is not in the judge’s list', async () => {
      const el = await render({ assignmentId: 9999 });

      expect(el.querySelector('.empty')).toBeTruthy();
      expect(scoreInputs().length).toBe(0);
    });

    it('treats a non-numeric id the same way', async () => {
      const el = await render({ assignmentId: 'not-a-number' });

      expect(el.querySelector('.empty')).toBeTruthy();
    });

    it('shows nothing to a role that is not a judge', async () => {
      const el = await render({ role: 'participant' });

      expect(el.querySelector('.empty')).toBeTruthy();
      expect(scoreInputs().length).toBe(0);
    });

    it('leads with the team and its submission', async () => {
      const el = await render();

      expect(el.querySelector('.review__team')?.textContent?.trim()).toBe('EcoTrace');
      expect(el.querySelector('.summary__text')?.textContent).toContain('carbon ledger');
    });
  });

  describe('scoring', () => {
    it('offers one card per criterion, starting empty', async () => {
      const el = await render();

      expect(scoreInputs().length).toBe(7);
      expect(el.querySelector('.actions__scored')?.textContent).toContain('0/7');
      expect(total()).toBe('0.0');
    });

    it('adds up to 100 when every criterion is maxed', async () => {
      await render();
      await scoreAll(1);

      expect(total()).toBe('100.0');
      expect(host().querySelector('.actions__scored')?.textContent).toContain('7/7');
    });

    it('weights each criterion as it is typed', async () => {
      await render();

      // System Design & Architecture alone at full marks is worth its own 15.
      await typeScore(0, '15');
      expect(total()).toBe('15.0');

      // 12/15·15 + 20/25·25 + 12/15·15 + 12/15·15 + 8/10·10 + 8/10·10 + 8/10·10 = 12 + 20 + 12 + 12 + 8 + 8 + 8 = 80
      await typeScore(0, '12');
      await typeScore(1, '20');
      await typeScore(2, '12');
      await typeScore(3, '12');
      await typeScore(4, '8');
      await typeScore(5, '8');
      await typeScore(6, '8');
      expect(total()).toBe('80.0');
    });

    it('treats a cleared box as unscored rather than zero', async () => {
      await render();
      await scoreAll(1);
      expect(total()).toBe('100.0');

      await typeScore(0, '');

      expect(total()).toBe('85.0');
      expect(host().querySelector('.actions__scored')?.textContent).toContain('6/7');
    });
  });

  describe('submitting', () => {
    it('is blocked until every criterion is scored', async () => {
      await render();
      expect(submitButton()?.disabled).toBe(true);

      await scoreAll(0.9);
      expect(submitButton()?.disabled).toBe(false);
    });

    it('asks first, and changes nothing until confirmed', async () => {
      await render();
      await scoreAll(0.9);

      submitButton()!.click();
      await fixture.whenStable();

      expect(host().querySelector('app-confirm-dialog')).toBeTruthy();
      expect(TestBed.inject(JudgeService).viewFor(PENDING)?.status).toBe('pending');
    });

    it('locks the review and returns to the portal once confirmed', async () => {
      await render();
      const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl');
      await scoreAll(0.9);

      submitButton()!.click();
      await fixture.whenStable();
      await clickConfirm();

      expect(TestBed.inject(JudgeService).viewFor(PENDING)?.status).toBe('completed');
      expect(navigate).toHaveBeenCalledWith('/judge/portal');
    });
  });

  describe('saving progress', () => {
    it('keeps a partial review and marks it in progress', async () => {
      await render();
      await typeScore(0, '7');

      host().querySelector<HTMLButtonElement>('.actions__buttons .button')!.click();
      await fixture.whenStable();

      const stored = TestBed.inject(JudgeService).viewFor(PENDING)!;
      expect(stored.status).toBe('in_progress');
      expect(stored.scoredCount).toBe(1);
      expect(stored.scores[0].score).toBe(7);
    });

    it('flags unsaved edits, and clears the flag once saved', async () => {
      await render();
      expect(host().querySelector('.actions__dirty')).toBeNull();

      await typeScore(0, '7');
      expect(host().querySelector('.actions__dirty')).toBeTruthy();

      host().querySelector<HTMLButtonElement>('.actions__buttons .button')!.click();
      await fixture.whenStable();

      expect(host().querySelector('.actions__dirty')).toBeNull();
      expect(host().querySelector('.actions__saved')).toBeTruthy();
    });

    it('surfaces a refusal from the service', async () => {
      await render();
      // Two decimal places is the numeric(5, 2) limit.
      await typeScore(0, '8.255');

      host().querySelector<HTMLButtonElement>('.actions__buttons .button')!.click();
      await fixture.whenStable();

      expect(host().querySelector('[role="alert"]')?.textContent).toContain('two decimal places');
    });
  });

  describe('leaving with unsaved edits', () => {
    it('asks before discarding them', async () => {
      await render();
      const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl');
      await typeScore(0, '7');

      host().querySelector<HTMLButtonElement>('.back')!.click();
      await fixture.whenStable();

      expect(host().querySelector('.confirm__heading')?.textContent).toContain('Leave without');
      expect(navigate).not.toHaveBeenCalled();
    });

    it('leaves straight away when nothing has changed', async () => {
      await render();
      const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl');

      host().querySelector<HTMLButtonElement>('.back')!.click();
      await fixture.whenStable();

      expect(host().querySelector('app-confirm-dialog')).toBeNull();
      expect(navigate).toHaveBeenCalledWith('/judge/portal');
    });
  });

  describe('a submitted review', () => {
    it('is read-only, with the marks shown as values', async () => {
      const el = await render({ assignmentId: COMPLETED });

      expect(scoreInputs().length).toBe(0);
      expect(el.querySelector('app-review-actions')).toBeNull();
      expect(el.querySelector('.review__banner--locked')).toBeTruthy();
      expect(
        Array.from(el.querySelectorAll('.criterion__mark-value')).map((node) =>
          node.textContent?.trim(),
        ),
      ).toEqual(['13.5', '22.5', '12.8', '13.5', '9.0', '8.5', '9.0']);
    });

    it('shows the feedback the judge wrote', async () => {
      const el = await render({ assignmentId: COMPLETED });

      expect(el.querySelector('.feedback__read')?.textContent).toContain('strongest submission');
    });

    it('stays readable after judging closes', async () => {
      const el = await render({ assignmentId: COMPLETED, judgingOpen: false });

      expect(el.querySelector('.review__banner--locked')?.textContent).toContain(
        'Judging has since closed',
      );
      expect(el.querySelector('.criterion__mark-value')).toBeTruthy();
      expect(el.querySelector('app-state-locked')).toBeNull();
    });
  });

  describe('gating', () => {
    it('cannot be scored while judging is closed', async () => {
      const el = await render({ judgingOpen: false });

      expect(el.querySelector('app-state-locked')).toBeTruthy();
      expect(scoreInputs().length).toBe(0);
      expect(el.querySelector('app-review-actions')).toBeNull();
      // The submission itself stays visible so the judge can still read it.
      expect(el.querySelector('.summary__text')).toBeTruthy();
    });

    it('cannot be scored once declined', async () => {
      const el = await render({ assignmentId: DECLINED });

      expect(el.querySelector('.review__banner--declined')).toBeTruthy();
      expect(scoreInputs().length).toBe(0);
      expect(el.querySelector('app-review-actions')).toBeNull();
    });
  });

  describe('an in-progress review', () => {
    it('loads the marks already saved', async () => {
      await render({ assignmentId: IN_PROGRESS });

      expect(scoreInputs()[0].value).toBe('12');
      expect(total()).toBe('12.0');
      expect(host().querySelector('.actions__dirty')).toBeNull();
    });
  });
});
