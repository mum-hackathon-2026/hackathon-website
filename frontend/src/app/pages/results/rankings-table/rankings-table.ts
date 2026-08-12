import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { TeamResult } from '../../../core/results/results';

/** Final standings for every team, with the reader's own team picked out. */
@Component({
  selector: 'app-rankings-table',
  imports: [DecimalPipe],
  templateUrl: './rankings-table.html',
  styleUrl: './rankings-table.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RankingsTable {
  readonly rows = input.required<readonly TeamResult[]>();
}
