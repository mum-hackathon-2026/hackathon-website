import { ChangeDetectionStrategy, Component } from '@angular/core';
import { FormLinkCard } from '../../../layout/form-link-card/form-link-card';

@Component({
  selector: 'app-judging-rubric',
  imports: [FormLinkCard],
  templateUrl: './judging-rubric.html',
  styleUrl: './judging-rubric.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class JudgingRubric {
  protected readonly rubricDocUrl =
    'https://docs.google.com/spreadsheets/d/1T2XZwJ7bipItuTROb_CIhwrXtUUrfB1jNEkqZiobJYE/edit?usp=drivesdk';
}
