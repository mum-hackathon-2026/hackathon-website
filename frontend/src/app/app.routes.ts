import { Routes } from '@angular/router';
import { adminGuard, judgeGuard, participantGuard, signedInGuard } from './core/auth/role-guard';
import { Home } from './pages/home/home';
import { MySubmission } from './pages/my-submission/my-submission';
import { MyTeam } from './pages/my-team/my-team';
import { Organizers } from './pages/organizers/organizers';
import { JudgePortal } from './pages/judge-portal/judge-portal';
import { JudgeReview } from './pages/judge-review/judge-review';
import { Progress } from './pages/progress/progress';
import { Results } from './pages/results/results';
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
  {
    path: 'judge/portal',
    component: JudgePortal,
    canActivate: [judgeGuard],
    title: 'Judge portal · Monash Hackathon 2026',
  },
  {
    path: 'judge/reviews/:assignmentId',
    component: JudgeReview,
    canActivate: [judgeGuard],
    title: 'Review · Monash Hackathon 2026',
  },
  // Lazy, unlike every route above it. Eagerly importing this page took the
  // initial bundle past its 500 kB budget, and organisers are the rarest role —
  // nobody else ever needs this code. The budget is close enough now that the
  // next page added will face the same choice.
  {
    path: 'admin/dashboard',
    loadComponent: () =>
      import('./pages/admin-dashboard/admin-dashboard').then((m) => m.AdminDashboard),
    canActivate: [adminGuard],
    title: 'Dashboard · Monash Hackathon 2026',
  },
  // Every signed-in role sees results, so this is gated on sign-in, not a role.
  {
    path: 'results',
    component: Results,
    canActivate: [signedInGuard],
    title: 'Results · Monash Hackathon 2026',
  },
  { path: 'sign-in', component: SignIn, title: 'Sign in · Monash Hackathon 2026' },
];
