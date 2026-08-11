import { Routes } from '@angular/router';
import { participantGuard } from './core/auth/role-guard';
import { Home } from './pages/home/home';
import { MySubmission } from './pages/my-submission/my-submission';
import { MyTeam } from './pages/my-team/my-team';
import { SignIn } from './pages/sign-in/sign-in';
import { Timeline } from './pages/timeline/timeline';

export const routes: Routes = [
  { path: '', component: Home, title: 'Monash Hackathon 2026' },
  { path: 'timeline', component: Timeline, title: 'Timeline · Monash Hackathon 2026' },
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
  { path: 'sign-in', component: SignIn, title: 'Sign in · Monash Hackathon 2026' },
];
