import { Injectable, inject } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs';

interface PageMetadata {
  readonly title: string;
  readonly description: string;
}

const ROUTE_META: Record<string, PageMetadata> = {
  '/': {
    title: 'Monash Hackathon 2026 | Averis Industry Innovation Challenge',
    description:
      'Monash Hackathon 2026: One industry problem, eight days to solve it. Compete for RM 9,000 in prizes. Open to all university students.',
  },
  '/timeline': {
    title: 'Event Schedule & Timeline | Monash Hackathon 2026',
    description:
      'Explore the official key milestones, registration windows, kickoff briefings, submission deadlines, and final pitch dates for Monash Hackathon 2026.',
  },
  '/results': {
    title: 'Leaderboard & Competition Results | Monash Hackathon 2026',
    description:
      'Official competition rankings, finalist awards, and judge evaluations for Monash Hackathon 2026.',
  },
  '/organizers': {
    title: 'Organizing Committee & Mentors | Monash Hackathon 2026',
    description:
      'Meet the Monash University Malaysia faculty leads, student executive committee, and Averis industry mentors behind Monash Hackathon 2026.',
  },
  '/sign-in': {
    title: 'Sign In | Monash Hackathon 2026 Portal',
    description:
      'Access your squad workspace, manage submissions, or review evaluations with your registered Google account.',
  },
  '/participant/team': {
    title: 'My Squad | Monash Hackathon 2026',
    description: 'Manage your team members, share join codes, and coordinate your project submission.',
  },
  '/participant/submission': {
    title: 'Project Submission | Monash Hackathon 2026',
    description: 'Submit your GitHub repository, deployed preview URL, slide deck, and video demo.',
  },
  '/participant/progress': {
    title: 'Submission Progress | Monash Hackathon 2026',
    description: 'Track your submission milestones and evaluation progress in real-time.',
  },
  '/judge/portal': {
    title: 'Judge Evaluation Portal | Monash Hackathon 2026',
    description: 'Review assigned hackathon submissions against the official 7-pillar rubric.',
  },
  '/admin/dashboard': {
    title: 'Administration Dashboard | Monash Hackathon 2026',
    description: 'Event operations, team oversight, judge assignment allocation, and results publication.',
  },
};

@Injectable({ providedIn: 'root' })
export class SeoService {
  private readonly titleService = inject(Title);
  private readonly metaService = inject(Meta);
  private readonly router = inject(Router);

  init(): void {
    this.router.events
      .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
      .subscribe((event) => {
        const url = event.urlAfterRedirects.split('?')[0].split('#')[0] || '/';
        const meta = ROUTE_META[url] ?? {
          title: 'Monash Hackathon 2026',
          description: 'Monash Hackathon 2026. One industry problem, eight days to solve it.',
        };

        this.titleService.setTitle(meta.title);
        this.metaService.updateTag({ name: 'description', content: meta.description });
        this.metaService.updateTag({ property: 'og:title', content: meta.title });
        this.metaService.updateTag({ property: 'og:description', content: meta.description });
        this.metaService.updateTag({ name: 'twitter:title', content: meta.title });
        this.metaService.updateTag({ name: 'twitter:description', content: meta.description });
      });
  }
}
