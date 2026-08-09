import { ChangeDetectionStrategy, Component } from '@angular/core';
import { FaqSection } from './faq/faq';
import { Hero } from './hero/hero';
import { OrganizersSection } from './organizers/organizers';
import { SponsorsSection } from './sponsors/sponsors';
import { ThemeSection } from './theme/theme';

@Component({
  selector: 'app-home',
  imports: [Hero, ThemeSection, FaqSection, SponsorsSection, OrganizersSection],
  templateUrl: './home.html',
  styleUrl: './home.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Home {}
