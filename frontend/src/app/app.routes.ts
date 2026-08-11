import { Routes } from '@angular/router';
import { Home } from './pages/home/home';
import { SignIn } from './pages/sign-in/sign-in';
import { Timeline } from './pages/timeline/timeline';

export const routes: Routes = [
  { path: '', component: Home, title: 'Monash Hackathon 2026' },
  { path: 'timeline', component: Timeline, title: 'Timeline · Monash Hackathon 2026' },
  { path: 'sign-in', component: SignIn, title: 'Sign in · Monash Hackathon 2026' },
];
