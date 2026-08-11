import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { DatePipe } from '@angular/common';
import { MYT_OFFSET } from '../../../core/event/event-config';
import { ProgressStage } from '../progress-stage';

/** The team's route through the event, as a vertical spine of stages. */
@Component({
  selector: 'app-stage-list',
  imports: [DatePipe],
  templateUrl: './stage-list.html',
  styleUrl: './stage-list.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StageList {
  readonly stages = input.required<readonly ProgressStage[]>();

  protected readonly myt = MYT_OFFSET;
}
