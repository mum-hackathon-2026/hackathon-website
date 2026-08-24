import { ChangeDetectionStrategy, Component } from '@angular/core';

export interface RubricRow {
  readonly no: number;
  readonly criterion: string;
  readonly maxScore: number;
  readonly assess: string;
  readonly weak: string;
  readonly developing: string;
  readonly strong: string;
  readonly excellent: string;
}

export interface RubricCategoryBand {
  readonly category: string;
  readonly weak: string;
  readonly developing: string;
  readonly strong: string;
  readonly excellent: string;
}

@Component({
  selector: 'app-judging-rubric',
  imports: [],
  templateUrl: './judging-rubric.html',
  styleUrl: './judging-rubric.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class JudgingRubric {
  protected readonly scoreBands: readonly RubricCategoryBand[] = [
    { category: '10-point criterion', weak: '0–2', developing: '3–5', strong: '6–7', excellent: '8–10' },
    { category: '15-point criterion', weak: '0–3', developing: '4–7', strong: '8–11', excellent: '12–15' },
    { category: '25-point criterion', weak: '0–6', developing: '7–12', strong: '13–18', excellent: '19–25' },
  ];

  protected readonly technicalCriteria: readonly RubricRow[] = [
    {
      no: 1,
      criterion: 'System Design & Architecture',
      maxScore: 15,
      assess: 'How well the solution is structured, including its main components, data flow, interfaces and dependencies.',
      weak: 'Architecture is unclear or key components are missing.',
      developing: 'A basic architecture is shown, but important links or decisions are unclear.',
      strong: 'Architecture and data flow are clear, with sensible component choices.',
      excellent: 'Architecture is coherent, well justified and supported by the prototype or other technical evidence.',
    },
    {
      no: 2,
      criterion: 'Working Core Prototype',
      maxScore: 25,
      assess: 'How much of the core solution is working at the preliminary stage.',
      weak: 'The core function does not work or is only shown through slides or mock-ups.',
      developing: 'Part of the core works, but key steps rely on placeholders, manual workarounds or unstable connections.',
      strong: 'The main flow works end-to-end with only minor gaps.',
      excellent: 'The core flow works reliably end-to-end and clearly shows that the main technical idea has been built.',
    },
    {
      no: 3,
      criterion: 'Technology Integration (TBC)',
      maxScore: 15,
      assess: 'Placeholder criterion pending sponsor alignment. It will assess how well the agreed technology or platform is used in the solution.',
      weak: 'Integration is missing, superficial or disconnected from the solution.',
      developing: 'Technology is used, but its role is limited or weakly justified.',
      strong: 'Technology supports an important part of the solution and is integrated clearly.',
      excellent: 'Technology is integrated deeply and adds clear technical value to the solution.',
    },
    {
      no: 4,
      criterion: 'Technical Feasibility & Validation',
      maxScore: 15,
      assess: 'Whether key technical assumptions have been tested and the team has a realistic path to a complete solution.',
      weak: 'Major technical risks are untested or ignored.',
      developing: 'Some risks are tested, but important questions remain.',
      strong: 'Key risks are tested and important limitations are understood.',
      excellent: 'Critical assumptions are validated with clear evidence and there is a credible path to completion.',
    },
  ];

  protected readonly productCriteria: readonly RubricRow[] = [
    {
      no: 5,
      criterion: 'Problem Statement Understanding',
      maxScore: 10,
      assess: 'How clearly the team understands the given problem statement, affected users or stakeholders, and the need being addressed.',
      weak: 'Limited understanding of the problem or who it affects.',
      developing: 'The problem is understood at a basic level, but context or needs are unclear.',
      strong: 'Clear understanding of the problem and relevant users or stakeholders.',
      excellent: 'Strong, well-supported understanding of the problem, its context and why it matters.',
    },
    {
      no: 6,
      criterion: 'Innovation & Solution Approach',
      maxScore: 10,
      assess: 'How original and suitable the proposed solution is for the problem statement.',
      weak: 'The idea is generic or poorly suited to the problem.',
      developing: 'The approach is workable but familiar, with limited differentiation.',
      strong: 'The approach is thoughtful, relevant and meaningfully differentiated.',
      excellent: 'The approach is original, well justified and offers a clear advantage.',
    },
    {
      no: 7,
      criterion: 'Practical Value & Potential',
      maxScore: 10,
      assess: 'Whether the solution could provide useful value and has a realistic path beyond the preliminary round.',
      weak: 'Value is unclear or the idea is not realistically usable.',
      developing: 'Some value is visible, but next steps or adoption potential are vague.',
      strong: 'Clear practical value with realistic next steps.',
      excellent: 'Strong practical value with a credible path to wider use or impact.',
    },
  ];
}
