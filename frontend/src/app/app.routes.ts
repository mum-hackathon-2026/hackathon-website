import { Routes } from '@angular/router';
import { participantGuard } from './core/auth/role-guard';
import { Home } from './pages/home/home';
import { MySubmission } from './pages/my-submission/my-submission';
import { MyTeam } from './pages/my-team/my-team';
import { Organizers } from './pages/organizers/organizers';
import { Progress } from './pages/progress/progress';
import { SignIn } from './pages/sign-in/sign-in';
import { Timeline } from './pages/timeline/timeline';

export const routes: Routes = [
  { path: '', component: Home, title: 'Monash Hackathon 2026' },
  { path: 'timeline', component: Timeline, title: 'Timeline · Monash Hackathon 2026' },
  { path: 'organizers', component: Organizers, title: 'Organisers · Monash Hackathon 2026' },
  {
    path: 'participant/team',
    component: MyTeam,
    canActivate: [participantGuard],
    title: 'My team · Monash Hackathon 2026',
  },
  {
    path: 'participant/submission',
    component: MySubmission,
    canActivate: [participantGuard],
    title: 'My submission · Monash Hackathon 2026',
  },
  // Two paths, one component: `tab` picks the view so each is linkable.
  {
    path: 'participant/progress/team',
    component: Progress,
    canActivate: [participantGuard],
    data: { tab: 'team' },
    title: 'Progress · Monash Hackathon 2026',
  },
  {
    path: 'participant/progress/event',
    component: Progress,
    canActivate: [participantGuard],
    data: { tab: 'event' },
    title: 'Progress · Monash Hackathon 2026',
  },
  { path: 'sign-in', component: SignIn, title: 'Sign in · Monash Hackathon 2026' },
];
