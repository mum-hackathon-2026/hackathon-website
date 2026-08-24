import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CriterionScoreView } from '../../../core/judge/judge';

export interface GuideBand {
  readonly label: string;
  readonly range: string;
  readonly type: 'weak' | 'dev' | 'strong' | 'exc';
  readonly description: string;
}

const RUBRIC_DESCRIPTIONS: Record<
  string,
  { weak: string; developing: string; strong: string; excellent: string }
> = {
  'System Design & Architecture': {
    weak: 'Architecture is unclear or key components are missing.',
    developing: 'A basic architecture is shown, but important links or decisions are unclear.',
    strong: 'Architecture and data flow are clear, with sensible component choices.',
    excellent:
      'Architecture is coherent, well justified and supported by the prototype or other technical evidence.',
  },
  'Working Core Prototype': {
    weak: 'The core function does not work or is only shown through slides or mock-ups.',
    developing:
      'Part of the core works, but key steps rely on placeholders, manual workarounds or unstable connections.',
    strong: 'The main flow works end-to-end with only minor gaps.',
    excellent:
      'The core flow works reliably end-to-end and clearly shows that the main technical idea has been built.',
  },
  'Technology Integration (TBC)': {
    weak: 'Integration is missing, superficial or disconnected from the solution.',
    developing: 'Technology is used, but its role is limited or weakly justified.',
    strong: 'Technology supports an important part of the solution and is integrated clearly.',
    excellent: 'Technology is integrated deeply and adds clear technical value to the solution.',
  },
  'Technical Feasibility & Validation': {
    weak: 'Major technical risks are untested or ignored.',
    developing: 'Some risks are tested, but important questions remain.',
    strong: 'Key risks are tested and important limitations are understood.',
    excellent:
      'Critical assumptions are validated with clear evidence and there is a credible path to completion.',
  },
  'Problem Statement Understanding': {
    weak: 'Limited understanding of the problem or who it affects.',
    developing: 'The problem is understood at a basic level, but context or needs are unclear.',
    strong: 'Clear understanding of the problem and relevant users or stakeholders.',
    excellent:
      'Strong, well-supported understanding of the problem, its context and why it matters.',
  },
  'Innovation & Solution Approach': {
    weak: 'The idea is generic or poorly suited to the problem.',
    developing: 'The approach is workable but familiar, with limited differentiation.',
    strong: 'The approach is thoughtful, relevant and meaningfully differentiated.',
    excellent: 'The approach is original, well justified and offers a clear advantage.',
  },
  'Practical Value & Potential': {
    weak: 'Value is unclear or the idea is not realistically usable.',
    developing: 'Some value is visible, but next steps or adoption potential are vague.',
    strong: 'Clear practical value with realistic next steps.',
    excellent: 'Strong practical value with a credible path to wider use or impact.',
  },
};

function findRubricDescription(title: string) {
  const normalized = title.trim().toLowerCase();
  for (const [key, val] of Object.entries(RUBRIC_DESCRIPTIONS)) {
    if (normalized.includes(key.toLowerCase()) || key.toLowerCase().includes(normalized)) {
      return val;
    }
  }
  return null;
}

/**
 * One rubric line: the mark, an optional private note, and what the mark is
 * currently worth towards the total.
 */
@Component({
  selector: 'app-criterion-card',
  imports: [DecimalPipe, FormsModule],
  templateUrl: './criterion-card.html',
  styleUrl: './criterion-card.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CriterionCard {
  readonly criterion = input.required<CriterionScoreView>();
  readonly readOnly = input(false);
  readonly disabled = input(false);

  /** null when the judge clears the box — that deletes the row rather than storing a zero. */
  readonly scoreChange = output<number | null>();
  readonly commentChange = output<string>();

  /** How full the bar sits, as a share of this criterion's maximum. */
  protected readonly percent = computed(() => {
    const { score, maxScore } = this.criterion();
    if (score === null || maxScore <= 0) return 0;
    return Math.min(100, Math.max(0, (score / maxScore) * 100));
  });

  protected readonly guideBands = computed<readonly GuideBand[]>(() => {
    const c = this.criterion();
    const desc = findRubricDescription(c.title);

    if (c.maxScore === 25) {
      return [
        {
          label: 'Weak',
          range: '0–6',
          type: 'weak',
          description:
            desc?.weak ??
            'The core function does not work or is only shown through slides or mock-ups.',
        },
        {
          label: 'Developing',
          range: '7–12',
          type: 'dev',
          description:
            desc?.developing ??
            'Part of the core works, but key steps rely on placeholders or manual workarounds.',
        },
        {
          label: 'Strong',
          range: '13–18',
          type: 'strong',
          description: desc?.strong ?? 'The main flow works end-to-end with only minor gaps.',
        },
        {
          label: 'Excellent',
          range: '19–25',
          type: 'exc',
          description:
            desc?.excellent ??
            'The core flow works reliably end-to-end and proves the main technical idea.',
        },
      ];
    }

    if (c.maxScore === 15) {
      return [
        {
          label: 'Weak',
          range: '0–3',
          type: 'weak',
          description:
            desc?.weak ?? 'Architecture/integration is unclear or key components are missing.',
        },
        {
          label: 'Developing',
          range: '4–7',
          type: 'dev',
          description:
            desc?.developing ?? 'Basic setup is shown, but important links or questions remain.',
        },
        {
          label: 'Strong',
          range: '8–11',
          type: 'strong',
          description:
            desc?.strong ?? 'Clear structure and data flow, with sensible component choices.',
        },
        {
          label: 'Excellent',
          range: '12–15',
          type: 'exc',
          description:
            desc?.excellent ?? 'Coherent, well justified and validated with clear evidence.',
        },
      ];
    }

    return [
      {
        label: 'Weak',
        range: '0–2',
        type: 'weak',
        description:
          desc?.weak ?? 'Limited understanding of the problem or generic idea with unclear value.',
      },
      {
        label: 'Developing',
        range: '3–5',
        type: 'dev',
        description:
          desc?.developing ??
          'Basic understanding and workable approach, but limited differentiation.',
      },
      {
        label: 'Strong',
        range: '6–7',
        type: 'strong',
        description:
          desc?.strong ?? 'Clear understanding, thoughtful approach, and realistic next steps.',
      },
      {
        label: 'Excellent',
        range: '8–10',
        type: 'exc',
        description:
          desc?.excellent ??
          'Strong understanding, highly original approach, and strong practical value.',
      },
    ];
  });

  protected onScore(value: string): void {
    const trimmed = value.trim();
    if (trimmed === '') {
      this.scoreChange.emit(null);
      return;
    }
    const parsed = Number(trimmed);
    // Number('') is 0 and Number('5abc') is NaN — neither should reach the service
    // as a score, so an unparseable box reads as cleared.
    this.scoreChange.emit(Number.isNaN(parsed) ? null : parsed);
  }
}
