import { Routes } from '@angular/router';
import { adminGuard, judgeGuard, participantGuard, signedInGuard } from './core/auth/role-guard';
import { Home } from './pages/home/home';
import { NotFound } from './pages/not-found/not-found';
import { MySubmission } from './pages/my-submission/my-submission';
import { MyTeam } from './pages/my-team/my-team';
import { Organizers } from './pages/organizers/organizers';
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
  {
    path: 'participant/progress',
    component: Progress,
    canActivate: [participantGuard],
    title: 'Progress · Monash Hackathon 2026',
  },
  {
    path: 'participant/progress/team',
    redirectTo: 'participant/progress',
    pathMatch: 'full',
  },
  {
    path: 'participant/progress/event',
    redirectTo: 'participant/progress',
    pathMatch: 'full',
  },
  // Lazy for the same reason as the admin dashboard below: both pages are behind
  // a role guard, so every participant was downloading judging code they can
  // never reach. They share a chunk because JudgeService is common to both and
  // the portal is the only way into a review.
  {
    path: 'judge/portal',
    loadComponent: () => import('./pages/judge-portal/judge-portal').then((m) => m.JudgePortal),
    canActivate: [judgeGuard],
    title: 'Judge portal · Monash Hackathon 2026',
  },
  {
    path: 'judge/reviews/:assignmentId',
    loadComponent: () => import('./pages/judge-review/judge-review').then((m) => m.JudgeReview),
    canActivate: [judgeGuard],
    title: 'Review · Monash Hackathon 2026',
  },
  // Lazy for the same reason, and first to be so: eagerly importing this page
  // took the initial bundle past its 500 kB budget, and organisers are the
  // rarest role — nobody else ever needs this code.
  // Bare path redirects so a section is always named in the URL, which keeps the
  // sidebar's active state honest and makes every section linkable.
  {
    path: 'admin/dashboard',
    pathMatch: 'full',
    redirectTo: 'admin/dashboard/overview',
  },
  {
    path: 'admin/dashboard/:section',
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
  // Must stay last: the wildcard matches anything the routes above did not.
  { path: '**', component: NotFound, title: 'Page not found · Monash Hackathon 2026' },
];
