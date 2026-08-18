import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  ViewChild,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
  AuthService,
  DEMO_USERS,
  GOOGLE_CLIENT_ID,
  ROLES,
  ROLE_HOME,
  ROLE_LABELS,
  Role,
} from '../../core/auth/auth';

declare global {
  interface Window {
    __googleGisInitialized?: boolean;
    google?: {
      accounts?: {
        id?: {
          initialize(config: {
            client_id: string;
            callback: (response: { credential: string }) => void;
            auto_select?: boolean;
            itp_support?: boolean;
            use_fedcm_for_prompt?: boolean;
          }): void;
          renderButton(parent: HTMLElement, options: Record<string, unknown>): void;
          cancel?(): void;
        };
      };
    };
  }
}

@Component({
  selector: 'app-sign-in',
  imports: [RouterLink, FormsModule],
  templateUrl: './sign-in.html',
  styleUrl: './sign-in.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SignIn implements AfterViewInit, OnDestroy {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly googleClientId = inject(GOOGLE_CLIENT_ID);

  @ViewChild('googleBtnContainer') private googleBtnContainer?: ElementRef<HTMLDivElement>;

  protected readonly roles = ROLES;
  protected readonly roleLabels = ROLE_LABELS;
  protected readonly accounts = DEMO_USERS;

  protected readonly isLoading = signal<boolean>(false);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly manualToken = signal<string>('');
  protected readonly showManualInput = signal<boolean>(false);

  ngAfterViewInit(): void {
    this.loadGoogleGisScript();
  }

  ngOnDestroy(): void {
    try {
      window.google?.accounts?.id?.cancel?.();
    } catch {
      // Ignored
    }
  }

  private loadGoogleGisScript(): void {
    if (window.google?.accounts?.id) {
      this.initGoogleButton();
      return;
    }

    const existingScript = document.getElementById('google-gis-script');
    if (existingScript) {
      existingScript.addEventListener('load', () => this.initGoogleButton());
      return;
    }

    const script = document.createElement('script');
    script.id = 'google-gis-script';
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => this.initGoogleButton();
    document.head.appendChild(script);
  }

  private initGoogleButton(): void {
    if (!window.google?.accounts?.id || !this.googleBtnContainer?.nativeElement) {
      return;
    }

    try {
      if (!window.__googleGisInitialized) {
        window.google.accounts.id.initialize({
          client_id: this.googleClientId,
          callback: (res: { credential: string }) => this.handleGoogleCredential(res.credential),
          auto_select: false,
          use_fedcm_for_prompt: true,
          itp_support: false,
        });
        window.__googleGisInitialized = true;
      }

      this.googleBtnContainer.nativeElement.innerHTML = '';
      window.google.accounts.id.renderButton(this.googleBtnContainer.nativeElement, {
        theme: 'outline',
        size: 'large',
        width: '320',
        text: 'signin_with',
      });
    } catch {
      // GIS failed to initialize (e.g. invalid client ID placeholder)
    }
  }

  protected async handleGoogleCredential(credential: string): Promise<void> {
    if (!credential || this.isLoading()) return;

    this.isLoading.set(true);
    this.errorMessage.set(null);

    const result = await this.auth.signInWithGoogle(credential);
    this.isLoading.set(false);

    if (result.ok) {
      const returnUrl =
        this.route.snapshot.queryParamMap.get('returnUrl') ?? ROLE_HOME[result.role];
      void this.router.navigateByUrl(returnUrl);
    } else {
      this.errorMessage.set(result.error);
    }
  }

  protected async submitManualToken(): Promise<void> {
    const token = this.manualToken().trim();
    if (token) {
      await this.handleGoogleCredential(token);
    }
  }

  protected signIn(account: Role): void {
    this.errorMessage.set(null);
    this.auth.signIn(account);
    const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl') ?? ROLE_HOME[account];
    void this.router.navigateByUrl(returnUrl);
  }

  protected toggleManualInput(): void {
    this.showManualInput.update((v) => !v);
  }
}
