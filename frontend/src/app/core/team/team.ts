import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { API_BASE_URL, AuthService } from '../auth/auth';
import { EventSettingsService } from '../event/event-settings';

export type TeamStatus = 'forming' | 'complete' | 'disqualified' | 'withdrawn';

export interface Team {
  readonly id: number;
  readonly name: string;
  readonly joinCode: string;
  readonly status: TeamStatus;
  readonly shortlisted: boolean;
  /** users.id of the creator. The nearest thing the schema has to a leader. */
  readonly createdBy: number;
  readonly version: number;
  readonly createdAt: Date;
}

export interface TeamMember {
  /** Primary key in V1, so a person belongs to at most one team. */
  readonly userId: number;
  readonly teamId: number;
  readonly joinedAt: Date;
}

/** Someone on a team, joined to the info we know about them. */
export interface TeamMemberView extends TeamMember {
  readonly name: string;
  readonly email: string;
  readonly initials: string;
  readonly phone?: string;
  readonly resumeUrl?: string;
  readonly linkedinUrl?: string;
  readonly githubUrl?: string;
  readonly isLeader: boolean;
  readonly isYou: boolean;
}

export interface BackendTeamMemberDto {
  readonly userId: number;
  readonly name: string;
  readonly email: string;
  readonly initials: string;
  readonly phone?: string;
  readonly resumeUrl?: string;
  readonly linkedinUrl?: string;
  readonly githubUrl?: string;
  readonly isLeader: boolean;
  readonly isYou: boolean;
  readonly joinedAt: string;
}

export interface BackendMyTeamResponse {
  readonly id: number;
  readonly name: string;
  readonly joinCode: string;
  readonly status: string;
  readonly shortlisted: boolean;
  readonly createdBy: number;
  readonly createdAt: string;
  readonly members: readonly BackendTeamMemberDto[];
}

export type TeamActionResult = { ok: true } | { ok: false; error: string };

const NAME_MIN = 1;
const NAME_MAX = 120;
const CODE_LENGTH = 6;
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

const DIRECTORY: Record<number, { name: string; email: string; initials: string }> = {
  1: { name: 'Priya Menon', email: 'pmenon@student.monash.edu', initials: 'PM' },
  2: { name: 'Dr. Sofia Lindqvist', email: 's.lindqvist@monash.edu', initials: 'SL' },
  3: { name: 'Mei-Lin Zhao', email: 'mzhao@monash.edu', initials: 'MZ' },
  101: { name: 'Arjun Rao', email: 'arao@student.monash.edu', initials: 'AR' },
  102: { name: 'Nurul Aisyah', email: 'naisyah@student.monash.edu', initials: 'NA' },
  103: { name: 'Wei Jie Tan', email: 'wtan@student.monash.edu', initials: 'WT' },
  104: { name: 'Chloe Baptiste', email: 'cbaptiste@student.monash.edu', initials: 'CB' },
  105: { name: 'Daniyal Hakim', email: 'dhakim@student.monash.edu', initials: 'DH' },
  106: { name: 'Elena Petrova', email: 'epetrova@student.monash.edu', initials: 'EP' },
  107: { name: 'Farid Yusof', email: 'fyusof@student.monash.edu', initials: 'FY' },
  108: { name: 'Grace Okoro', email: 'gokoro@student.monash.edu', initials: 'GO' },
};

function seedTeams(): Team[] {
  const createdAt = new Date('2026-09-22T10:00:00+08:00');
  return [
    {
      id: 101,
      name: 'Quantum Leap',
      joinCode: 'QLEAP7',
      status: 'forming',
      shortlisted: false,
      createdBy: 101,
      version: 0,
      createdAt,
    },
    {
      id: 102,
      name: 'Null Pointer Exception',
      joinCode: 'NPE404',
      status: 'forming',
      shortlisted: false,
      createdBy: 103,
      version: 0,
      createdAt,
    },
    {
      id: 103,
      name: 'Full House',
      joinCode: 'FULL44',
      status: 'complete',
      shortlisted: false,
      createdBy: 105,
      version: 0,
      createdAt,
    },
  ];
}

function seedMembers(): TeamMember[] {
  const joinedAt = new Date('2026-09-22T10:00:00+08:00');
  return [
    { userId: 101, teamId: 101, joinedAt },
    { userId: 102, teamId: 101, joinedAt },
    { userId: 103, teamId: 102, joinedAt },
    { userId: 104, teamId: 102, joinedAt },
    { userId: 105, teamId: 103, joinedAt },
    { userId: 106, teamId: 103, joinedAt },
    { userId: 107, teamId: 103, joinedAt },
    { userId: 108, teamId: 103, joinedAt },
  ];
}

@Injectable({ providedIn: 'root' })
export class TeamService {
  private readonly auth = inject(AuthService);
  private readonly settings = inject(EventSettingsService);
  private readonly http = inject(HttpClient);
  private readonly apiBaseUrl = inject(API_BASE_URL);

  private readonly teams = signal<readonly Team[]>(seedTeams());
  private readonly members = signal<readonly TeamMember[]>(seedMembers());
  private readonly apiMembers = signal<readonly TeamMemberView[]>([]);
  private readonly apiTeam = signal<Team | null>(null);
  private nextTeamId = 200;

  /** The signed-in user's membership, if they have one. */
  readonly myMembership = computed<TeamMember | null>(() => {
    const apiT = this.apiTeam();
    const me = this.auth.user();
    if (apiT && me) {
      return { userId: me.id, teamId: apiT.id, joinedAt: apiT.createdAt };
    }
    if (!me) return null;
    return this.members().find((m) => m.userId === me.id) ?? null;
  });

  readonly myTeam = computed<Team | null>(() => {
    const apiT = this.apiTeam();
    if (apiT) return apiT;
    const membership = this.myMembership();
    if (!membership) return null;
    return this.teams().find((t) => t.id === membership.teamId) ?? null;
  });

  readonly isLeader = computed(() => {
    const me = this.auth.user();
    const team = this.myTeam();
    return !!me && !!team && team.createdBy === me.id;
  });

  readonly myTeamMembers = computed<readonly TeamMemberView[]>(() => {
    const apiList = this.apiMembers();
    if (apiList.length > 0) {
      return apiList;
    }

    const team = this.myTeam();
    const me = this.auth.user();
    if (!team) return [];

    return this.members()
      .filter((m) => m.teamId === team.id)
      .map((m) => {
        const person = DIRECTORY[m.userId] ?? {
          name: `User ${m.userId}`,
          email: '',
          initials: '??',
        };
        return {
          ...m,
          ...person,
          isLeader: team.createdBy === m.userId,
          isYou: m.userId === me?.id,
        };
      })
      .sort((a, b) => Number(b.isLeader) - Number(a.isLeader) || a.name.localeCompare(b.name));
  });

  readonly isFull = computed(() => this.myTeamMembers().length >= this.settings.maxTeamSize());

  /** Counted, not a flag, so overlapping calls don't clear each other's state. */
  private readonly inFlight = signal(0);
  readonly pending = computed(() => this.inFlight() > 0);

  constructor() {
    effect(() => {
      const user = this.auth.user();
      if (user?.token && user?.role === 'participant') {
        this.refreshMyTeam();
      } else {
        this.apiTeam.set(null);
        this.apiMembers.set([]);
      }
    });
  }

  async refreshMyTeam(): Promise<void> {
    const token = this.auth.token();
    if (!token || this.auth.user()?.role !== 'participant') return;

    try {
      const res = await firstValueFrom(
        this.http.get<BackendMyTeamResponse | null>(`${this.apiBaseUrl}/api/teams/my`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      );

      if (res) {
        const statusVal: TeamStatus =
          res.status === 'complete' || res.status === 'disqualified' || res.status === 'withdrawn'
            ? res.status
            : 'forming';

        const team: Team = {
          id: res.id,
          name: res.name,
          joinCode: res.joinCode,
          status: statusVal,
          shortlisted: res.shortlisted,
          createdBy: res.createdBy,
          version: 0,
          createdAt: new Date(res.createdAt),
        };

        const memberViews: TeamMemberView[] = res.members.map((m) => ({
          userId: m.userId,
          teamId: res.id,
          name: m.name,
          email: m.email,
          initials: m.initials,
          phone: m.phone,
          resumeUrl: m.resumeUrl,
          linkedinUrl: m.linkedinUrl,
          githubUrl: m.githubUrl,
          isLeader: m.isLeader,
          isYou: m.isYou,
          joinedAt: new Date(m.joinedAt),
        }));

        this.apiTeam.set(team);
        this.apiMembers.set(memberViews);
      }
    } catch (err) {
      if (err instanceof HttpErrorResponse && err.status === 404) {
        this.apiTeam.set(null);
        this.apiMembers.set([]);
      }
    }
  }

  private async run(operation: () => TeamActionResult): Promise<TeamActionResult> {
    this.inFlight.update((n) => n + 1);
    try {
      await Promise.resolve();
      return operation();
    } finally {
      this.inFlight.update((n) => n - 1);
    }
  }

  createTeam(name: string): Promise<TeamActionResult> {
    return this.run(() => {
      const me = this.auth.user();
      if (!me) return { ok: false, error: 'You need to be signed in.' };
      if (this.myMembership()) return { ok: false, error: "You're already in a team." };

      const nameCheck = this.validateName(name);
      if (!nameCheck.ok) return nameCheck;

      const team: Team = {
        id: this.nextTeamId++,
        name: name.trim(),
        joinCode: this.uniqueJoinCode(),
        status: 'forming',
        shortlisted: false,
        createdBy: me.id,
        version: 0,
        createdAt: new Date(),
      };

      this.teams.update((teams) => [...teams, team]);
      this.members.update((members) => [
        ...members,
        { userId: me.id, teamId: team.id, joinedAt: new Date() },
      ]);
      return { ok: true };
    });
  }

  joinTeam(code: string): Promise<TeamActionResult> {
    return this.run(() => {
      const me = this.auth.user();
      if (!me) return { ok: false, error: 'You need to be signed in.' };
      if (this.myMembership()) return { ok: false, error: "You're already in a team." };

      const team = this.teams().find((t) => t.joinCode.toLowerCase() === code.trim().toLowerCase());
      if (!team) return { ok: false, error: 'No team has that join code.' };

      const size = this.members().filter((m) => m.teamId === team.id).length;
      if (size >= this.settings.maxTeamSize()) {
        return { ok: false, error: `${team.name} is already full.` };
      }

      this.members.update((members) => [
        ...members,
        { userId: me.id, teamId: team.id, joinedAt: new Date() },
      ]);
      return { ok: true };
    });
  }

  renameTeam(name: string): Promise<TeamActionResult> {
    return this.run(() => {
      const team = this.myTeam();
      if (!team || !this.isLeader())
        return { ok: false, error: 'Only the team leader can do that.' };

      const nameCheck = this.validateName(name, team.id);
      if (!nameCheck.ok) return nameCheck;

      this.patchMyTeam({ name: name.trim() });
      return { ok: true };
    });
  }

  regenerateJoinCode(): Promise<TeamActionResult> {
    return this.run(() => {
      if (!this.myTeam() || !this.isLeader()) {
        return { ok: false, error: 'Only the team leader can do that.' };
      }
      this.patchMyTeam({ joinCode: this.uniqueJoinCode() });
      return { ok: true };
    });
  }

  removeMember(userId: number): Promise<TeamActionResult> {
    return this.run(() => {
      const team = this.myTeam();
      const me = this.auth.user();
      if (!team || !this.isLeader())
        return { ok: false, error: 'Only the team leader can do that.' };
      if (userId === me?.id)
        return { ok: false, error: 'Leave the team instead of removing yourself.' };

      this.members.update((members) =>
        members.filter((m) => !(m.userId === userId && m.teamId === team.id)),
      );
      return { ok: true };
    });
  }

  transferLeadership(userId: number): Promise<TeamActionResult> {
    return this.run(() => {
      const team = this.myTeam();
      if (!team || !this.isLeader())
        return { ok: false, error: 'Only the team leader can do that.' };

      const isMember = this.members().some((m) => m.teamId === team.id && m.userId === userId);
      if (!isMember) return { ok: false, error: 'That person is not on your team.' };

      this.patchMyTeam({ createdBy: userId });
      return { ok: true };
    });
  }

  leaveTeam(): Promise<TeamActionResult> {
    return this.run(() => {
      const me = this.auth.user();
      const team = this.myTeam();
      if (!me || !team) return { ok: false, error: "You're not in a team." };

      const remaining = this.members().filter((m) => m.teamId === team.id && m.userId !== me.id);

      this.members.update((members) => members.filter((m) => m.userId !== me.id));

      if (remaining.length === 0) {
        this.teams.update((teams) => teams.filter((t) => t.id !== team.id));
      } else if (team.createdBy === me.id) {
        const next = [...remaining].sort((a, b) => a.joinedAt.getTime() - b.joinedAt.getTime())[0];
        this.teams.update((teams) =>
          teams.map((t) => (t.id === team.id ? { ...t, createdBy: next.userId } : t)),
        );
      }
      return { ok: true };
    });
  }

  private validateName(name: string, ignoreTeamId?: number): TeamActionResult {
    const trimmed = name.trim();
    if (trimmed.length < NAME_MIN || trimmed.length > NAME_MAX) {
      return { ok: false, error: `Team name must be 1 to ${NAME_MAX} characters.` };
    }
    const taken = this.teams().some(
      (t) => t.id !== ignoreTeamId && t.name.toLowerCase() === trimmed.toLowerCase(),
    );
    return taken ? { ok: false, error: 'That team name is taken.' } : { ok: true };
  }

  private uniqueJoinCode(): string {
    const existing = new Set(this.teams().map((t) => t.joinCode));
    let code: string;
    do {
      code = Array.from(
        { length: CODE_LENGTH },
        () => CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)],
      ).join('');
    } while (existing.has(code));
    return code;
  }

  private patchMyTeam(patch: Partial<Team>): void {
    const team = this.myTeam();
    if (!team) return;
    this.teams.update((teams) =>
      teams.map((t) => (t.id === team.id ? { ...t, ...patch, version: t.version + 1 } : t)),
    );
  }
}
