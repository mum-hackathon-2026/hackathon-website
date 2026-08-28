import { Routes } from '@angular/router';
import { adminGuard, judgeGuard, participantGuard, signedInGuard } from './core/auth/role-guard';
import { Home } from './pages/home/home';

// Home is the only page imported eagerly. It is where most visits land, so
// making it lazy would put a round trip in front of the first paint. Every
// other page loads on demand: see the note above the admin dashboard for why
// this matters here specifically.

export const routes: Routes = [
  { path: '', component: Home, title: 'Averis X Monash Hackathon 2026' },
  {
    path: 'timeline',
    loadComponent: () => import('./pages/timeline/timeline').then((m) => m.Timeline),
    title: 'Timeline · Averis X Monash Hackathon 2026',
  },
  {
    path: 'organizers',
    loadComponent: () => import('./pages/organizers/organizers').then((m) => m.Organizers),
    title: 'Organisers · Averis X Monash Hackathon 2026',
  },
  {
    path: 'participant/team',
    loadComponent: () => import('./pages/my-team/my-team').then((m) => m.MyTeam),
    canActivate: [participantGuard],
    title: 'My team · Averis X Monash Hackathon 2026',
  },
  {
    path: 'participant/submission',
    loadComponent: () => import('./pages/my-submission/my-submission').then((m) => m.MySubmission),
    canActivate: [participantGuard],
    title: 'My submission · Averis X Monash Hackathon 2026',
  },
  {
    path: 'participant/progress',
    loadComponent: () => import('./pages/progress/progress').then((m) => m.Progress),
    canActivate: [participantGuard],
    title: 'Progress · Averis X Monash Hackathon 2026',
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
    title: 'Judge portal · Averis X Monash Hackathon 2026',
  },
  {
    path: 'judge/reviews/:assignmentId',
    loadComponent: () => import('./pages/judge-review/judge-review').then((m) => m.JudgeReview),
    canActivate: [judgeGuard],
    title: 'Review · Averis X Monash Hackathon 2026',
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
    title: 'Dashboard · Averis X Monash Hackathon 2026',
  },
  // Every signed-in role sees results, so this is gated on sign-in, not a role.
  {
    path: 'results',
    loadComponent: () => import('./pages/results/results').then((m) => m.Results),
    canActivate: [signedInGuard],
    title: 'Results · Averis X Monash Hackathon 2026',
  },
  {
    path: 'finalist',
    loadComponent: () => import('./pages/finalist/finalist').then((m) => m.Finalist),
    canActivate: [signedInGuard],
    title: 'Finalist Portal · Averis X Monash Hackathon 2026',
  },
  {
    path: 'sign-in',
    loadComponent: () => import('./pages/sign-in/sign-in').then((m) => m.SignIn),
    title: 'Sign in · Averis X Monash Hackathon 2026',
  },
  // Must stay last: the wildcard matches anything the routes above did not.
  {
    path: '**',
    loadComponent: () => import('./pages/not-found/not-found').then((m) => m.NotFound),
    title: 'Page not found · Averis X Monash Hackathon 2026',
  },
];
