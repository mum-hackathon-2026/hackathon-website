import { TestBed } from '@angular/core/testing';
import { AuthService, SESSION_STORAGE } from '../auth/auth';
import { TeamService } from './team';

describe('TeamService', () => {
  let teams: TeamService;
  let auth: AuthService;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [{ provide: SESSION_STORAGE, useValue: null }],
    });
    auth = TestBed.inject(AuthService);
    teams = TestBed.inject(TeamService);
    auth.signIn('participant');
  });

  it('starts with no team', () => {
    expect(teams.myTeam()).toBeNull();
    expect(teams.myTeamMembers()).toEqual([]);
  });

  it('creates a team and makes the creator its leader', () => {
    expect(teams.createTeam('Late Night Commits')).toEqual({ ok: true });

    const team = teams.myTeam()!;
    expect(team.name).toBe('Late Night Commits');
    expect(team.status).toBe('forming');
    expect(team.createdBy).toBe(auth.user()!.id);
    // Leadership is derived from created_by, never stored on the membership.
    expect(teams.isLeader()).toBe(true);
    expect(teams.myTeamMembers().map((m) => m.isYou)).toEqual([true]);
  });

  it('issues a join code within the length the schema allows', () => {
    teams.createTeam('Codegeist');
    const code = teams.myTeam()!.joinCode;
    expect(code.length).toBeGreaterThanOrEqual(4);
    expect(code.length).toBeLessThanOrEqual(32);
  });

  it('rejects a duplicate team name, as the unique constraint would', () => {
    // 'Quantum Leap' is one of the seeded teams.
    const result = teams.createTeam('quantum leap');
    expect(result).toEqual({ ok: false, error: 'That team name is taken.' });
    expect(teams.myTeam()).toBeNull();
  });

  it('refuses a second team, since a user may hold only one membership', () => {
    teams.createTeam('First');
    const result = teams.createTeam('Second');

    expect(result.ok).toBe(false);
    expect(teams.myTeam()!.name).toBe('First');
  });

  it('joins an existing team by code, case-insensitively', () => {
    expect(teams.joinTeam('npe404')).toEqual({ ok: true });
    expect(teams.myTeam()!.name).toBe('Null Pointer Exception');
    // Joining does not make you the leader.
    expect(teams.isLeader()).toBe(false);
  });

  it('rejects an unknown join code', () => {
    expect(teams.joinTeam('NOPE99')).toEqual({ ok: false, error: 'No team has that join code.' });
    expect(teams.myTeam()).toBeNull();
  });

  it('refuses to join a team that is already at max size', () => {
    // 'Full House' is seeded with maxTeamSize (4) members.
    const result = teams.joinTeam('FULL44');

    expect(result).toEqual({ ok: false, error: 'Full House is already full.' });
    expect(teams.myTeam()).toBeNull();
  });

  it('renames only for the leader, and rejects a taken name', () => {
    teams.createTeam('Rename Me');

    expect(teams.renameTeam('Renamed')).toEqual({ ok: true });
    expect(teams.myTeam()!.name).toBe('Renamed');

    expect(teams.renameTeam('Quantum Leap')).toEqual({
      ok: false,
      error: 'That team name is taken.',
    });
  });

  it('bumps version on every edit, as the @Version column would', () => {
    teams.createTeam('Versioned');
    expect(teams.myTeam()!.version).toBe(0);

    teams.renameTeam('Versioned Twice');
    expect(teams.myTeam()!.version).toBe(1);

    teams.regenerateJoinCode();
    expect(teams.myTeam()!.version).toBe(2);
  });

  it('regenerates the join code to a different value', () => {
    teams.createTeam('Rotators');
    const before = teams.myTeam()!.joinCode;

    teams.regenerateJoinCode();

    expect(teams.myTeam()!.joinCode).not.toBe(before);
  });

  it('refuses leader-only actions from a non-leader', () => {
    teams.joinTeam('QLEAP7');

    expect(teams.transferLeadership(101).ok).toBe(false);
    expect(teams.renameTeam('Hostile Takeover').ok).toBe(false);
    expect(teams.regenerateJoinCode().ok).toBe(false);
    expect(teams.removeMember(101).ok).toBe(false);
    expect(teams.myTeam()!.name).toBe('Quantum Leap');
  });

  it('refuses to transfer leadership to someone outside the team', () => {
    teams.createTeam('Closed Shop');

    expect(teams.transferLeadership(999)).toEqual({
      ok: false,
      error: 'That person is not on your team.',
    });
    expect(teams.isLeader()).toBe(true);
  });

  it('refuses to remove yourself, pointing at leave instead', () => {
    teams.createTeam('Solo');
    const me = auth.user()!.id;

    const result = teams.removeMember(me);

    expect(result.ok).toBe(false);
    expect(teams.myTeamMembers().length).toBe(1);
  });

  it('disbands the team when the last member leaves', () => {
    teams.createTeam('Briefly');
    const id = teams.myTeam()!.id;

    teams.leaveTeam();

    expect(teams.myTeam()).toBeNull();
    // Gone entirely, so the name frees up again.
    expect(teams.createTeam('Briefly')).toEqual({ ok: true });
    expect(teams.myTeam()!.id).not.toBe(id);
  });

  it('hands leadership on when the leader leaves a team with members left', () => {
    // Two accounts, because leadership only moves when somebody is left behind.
    teams.createTeam('Succession');
    const code = teams.myTeam()!.joinCode;
    const leaderId = auth.user()!.id;

    auth.signIn('judge');
    const successorId = auth.user()!.id;
    expect(teams.joinTeam(code)).toEqual({ ok: true });
    expect(teams.isLeader()).toBe(false);

    auth.signIn('participant');
    teams.leaveTeam();

    auth.signIn('judge');
    expect(teams.myTeam()).not.toBeNull();
    expect(teams.myTeam()!.createdBy).toBe(successorId);
    expect(teams.myTeam()!.createdBy).not.toBe(leaderId);
    expect(teams.isLeader()).toBe(true);
  });

  it('transfers leadership to another member and nothing else', () => {
    teams.createTeam('Handover');
    const code = teams.myTeam()!.joinCode;
    const before = teams.myTeam()!;

    auth.signIn('judge');
    teams.joinTeam(code);
    const otherId = auth.user()!.id;

    auth.signIn('participant');
    expect(teams.transferLeadership(otherId)).toEqual({ ok: true });

    const after = teams.myTeam()!;
    expect(after.createdBy).toBe(otherId);
    expect(teams.isLeader()).toBe(false);
    // Everything but created_by and version is untouched.
    expect(after.name).toBe(before.name);
    expect(after.joinCode).toBe(before.joinCode);
    expect(after.status).toBe(before.status);
    // Membership is unaffected — there is no role column to move.
    expect(teams.myTeamMembers().length).toBe(2);
  });

  it('removes a member at the leader’s request', () => {
    teams.createTeam('Trim');
    const code = teams.myTeam()!.joinCode;

    auth.signIn('judge');
    teams.joinTeam(code);
    const otherId = auth.user()!.id;

    auth.signIn('participant');
    expect(teams.removeMember(otherId)).toEqual({ ok: true });
    expect(teams.myTeamMembers().length).toBe(1);

    // The removed member is genuinely out, not just hidden.
    auth.signIn('judge');
    expect(teams.myTeam()).toBeNull();
  });

  it('lists the leader first', () => {
    teams.joinTeam('QLEAP7');
    expect(teams.myTeamMembers()[0].isLeader).toBe(true);
  });
});
