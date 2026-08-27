import { ChangeDetectionStrategy, Component } from '@angular/core';
import { EventTrack } from '../../layout/event-track/event-track';
import { DirectorSection } from './director/director';
import { FaqSection } from './faq/faq';
import { HomeFooter } from './footer/footer';
import { Hero } from './hero/hero';
import { OrganizersSection } from './organizers/organizers';
import { PurposeSection } from './purpose/purpose';
import { SponsorsSection } from './sponsors/sponsors';
import { ThemeSection } from './theme/theme';

@Component({
  selector: 'app-home',
  imports: [
    Hero,
    EventTrack,
    ThemeSection,
    PurposeSection,
    FaqSection,
    SponsorsSection,
    OrganizersSection,
    DirectorSection,
    HomeFooter,
  ],
  templateUrl: './home.html',
  styleUrl: './home.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Home {}
