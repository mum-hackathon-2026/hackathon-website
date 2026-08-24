import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Backdrop } from './layout/backdrop/backdrop';
import { NavBar } from './layout/nav-bar/nav-bar';
import { Orb } from './layout/orb/orb';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, Backdrop, NavBar, Orb],
  templateUrl: './app.html',
  styleUrl: './app.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {}
