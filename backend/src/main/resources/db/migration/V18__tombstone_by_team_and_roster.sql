-- V18__tombstone_by_team_and_roster.sql
--
-- Updates tombstoned_registrations so that a tombstone uniquely targets the specific deleted
-- registration row (exact team name + exact member roster) rather than blocking email addresses
-- or team names globally.

alter table tombstoned_registrations
    add column if not exists member_emails text;

-- Truncate existing single-column records from initial rollout
truncate table tombstoned_registrations;

create index if not exists tombstoned_registrations_team_roster_idx
    on tombstoned_registrations (lower(trim(team_name)), member_emails);
