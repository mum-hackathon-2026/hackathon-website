import { ChangeDetectionStrategy, Component } from '@angular/core';
import { FaqSection } from './faq/faq';
import { Hero } from './hero/hero';
import { ThemeSection } from './theme/theme';

@Component({
  selector: 'app-home',
  imports: [Hero, ThemeSection, FaqSection],
  templateUrl: './home.html',
  styleUrl: './home.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Home {}
