import { ChangeDetectionStrategy, Component } from '@angular/core';

interface Pillar {
  readonly name: string;
  readonly description: string;
  /** Modifier suffix for the coloured top border, see theme.scss. */
  readonly accent: 'blue' | 'green' | 'red' | 'yellow';
}

/** Placeholder copy from the design — judging criteria come from the API later. */
const PILLARS: readonly Pillar[] = [
  { accent: 'blue', name: 'Technical depth', description: "How well it's engineered." },
  { accent: 'green', name: 'Real-world impact', description: 'Whether it solves something.' },
  { accent: 'red', name: 'Creative ambition', description: 'How bold the idea is.' },
  { accent: 'yellow', name: 'Working demo', description: 'That it actually runs.' },
];

@Component({
  selector: 'app-home-theme',
  templateUrl: './theme.html',
  styleUrl: './theme.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ThemeSection {
  protected readonly pillars = PILLARS;
}
