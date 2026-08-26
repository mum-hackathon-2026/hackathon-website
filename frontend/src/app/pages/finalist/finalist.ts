import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  ViewChild,
  computed,
  inject,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { ResultsService } from '../../core/results/results';
import { TeamService } from '../../core/team/team';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  rotation: number;
  vRot: number;
  opacity: number;
  shape: 'rect' | 'circle';
}

@Component({
  selector: 'app-finalist',
  imports: [RouterLink],
  templateUrl: './finalist.html',
  styleUrl: './finalist.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Finalist implements AfterViewInit, OnDestroy {
  @ViewChild('confettiCanvas') private canvasRef?: ElementRef<HTMLCanvasElement>;

  private readonly results = inject(ResultsService);
  private readonly teams = inject(TeamService);

  /** Configured Google Form URL for finalist squad onboarding */
  protected readonly finalistFormUrl =
    'https://docs.google.com/forms/d/e/1FAIpQLSe9oEyyvjOTli1A7su7lXpIlJKCMy861rFHSReNaGwus8w3KQ/viewform';

  protected readonly myTeam = this.teams.myTeam;
  protected readonly myResult = this.results.myResult;

  protected readonly teamName = computed(() => {
    return this.myResult()?.teamName ?? this.myTeam()?.name ?? 'Finalist Squad';
  });

  protected readonly projectTitle = computed(() => {
    return this.myResult()?.projectTitle ?? 'Preliminary Submission';
  });

  protected readonly trackLabel = computed(() => {
    return this.myResult()?.trackLabel ?? 'General Track';
  });

  protected readonly scoreText = computed(() => {
    const score = this.myResult()?.finalScore;
    return score !== null && score !== undefined ? score.toFixed(1) : '--';
  });

  private animFrameId: number | null = null;
  private particles: Particle[] = [];

  ngAfterViewInit(): void {
    if (typeof window !== 'undefined') {
      this.initConfetti();
    }
  }

  ngOnDestroy(): void {
    if (this.animFrameId !== null && typeof cancelAnimationFrame !== 'undefined') {
      cancelAnimationFrame(this.animFrameId);
    }
  }

  private initConfetti(): void {
    const canvas = this.canvasRef?.nativeElement;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = (canvas.width = window.innerWidth);
    const height = (canvas.height = window.innerHeight);

    const colors = [
      '#f59e0b', // Amber
      '#10b981', // Emerald
      '#3b82f6', // Blue
      '#ec4899', // Pink
      '#8b5cf6', // Violet
      '#fbbf24', // Gold
      '#ef4444', // Red
    ];

    const particleCount = 140;
    this.particles = [];

    // Create dual bursts from left and right corners
    for (let i = 0; i < particleCount; i++) {
      const isLeft = i % 2 === 0;
      const originX = isLeft ? width * 0.15 : width * 0.85;
      const originY = height * 0.45;
      const angle = isLeft
        ? (Math.random() * 0.5 - 0.25) * Math.PI - 0.2
        : (Math.PI - (Math.random() * 0.5 - 0.25) * Math.PI) + 0.2;
      const speed = 7 + Math.random() * 14;

      this.particles.push({
        x: originX,
        y: originY,
        vx: Math.cos(angle) * speed,
        vy: -Math.abs(Math.sin(angle) * speed) - 3,
        size: 6 + Math.random() * 8,
        color: colors[Math.floor(Math.random() * colors.length)] ?? '#f59e0b',
        rotation: Math.random() * 360,
        vRot: (Math.random() - 0.5) * 12,
        opacity: 1,
        shape: Math.random() > 0.4 ? 'rect' : 'circle',
      });
    }

    let start = performance.now();

    const loop = (now: number) => {
      const elapsed = now - start;
      ctx.clearRect(0, 0, width, height);

      let alive = false;
      for (const p of this.particles) {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.35; // gravity
        p.vx *= 0.985; // air drag
        p.rotation += p.vRot;

        if (elapsed > 2000) {
          p.opacity = Math.max(0, p.opacity - 0.015);
        }

        if (p.opacity > 0 && p.y < height + 40) {
          alive = true;
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate((p.rotation * Math.PI) / 180);
          ctx.globalAlpha = p.opacity;
          ctx.fillStyle = p.color;

          if (p.shape === 'rect') {
            ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
          } else {
            ctx.beginPath();
            ctx.arc(0, 0, p.size / 2, 0, 2 * Math.PI);
            ctx.fill();
          }
          ctx.restore();
        }
      }

      if (alive && elapsed < 6000) {
        this.animFrameId = requestAnimationFrame(loop);
      } else {
        ctx.clearRect(0, 0, width, height);
      }
    };

    this.animFrameId = requestAnimationFrame(loop);
  }
}
