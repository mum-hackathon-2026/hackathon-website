import { ChangeDetectionStrategy, Component } from '@angular/core';

export interface SocialClub {
  readonly name: string;
  readonly handle: string;
  readonly url: string;
  readonly logo: string;
  readonly description: string;
}

export const SOCIAL_CLUBS: readonly SocialClub[] = [
  {
    name: 'Monash University Malaysia Tech Club',
    handle: '@mumtec.monash',
    url: 'https://www.instagram.com/mumtec.monash/',
    logo: 'logos/mumtec.png',
    description:
      'Stay connected with MUMTEC for student tech initiatives, event highlights, networking meetups, and behind-the-scenes coverage.',
  },
  {
    name: 'GDG on Campus Monash University Malaysia',
    handle: '@gdg.mum',
    url: 'https://www.instagram.com/gdg.mum/',
    logo: 'logos/gdgoc.png',
    description:
      'Follow GDG MUM for live hackathon announcements, tech workshops, coding mentorship sessions, and developer community updates.',
  },
];

@Component({
  selector: 'app-home-connect',
  imports: [],
  templateUrl: './connect.html',
  styleUrl: './connect.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConnectSection {
  protected readonly clubs = SOCIAL_CLUBS;
}
