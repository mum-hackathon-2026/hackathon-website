import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-home-footer',
  templateUrl: './footer.html',
  styleUrl: './footer.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomeFooter {}
