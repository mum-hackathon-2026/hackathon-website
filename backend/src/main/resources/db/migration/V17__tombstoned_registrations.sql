-- V17__tombstoned_registrations.sql
--
-- Records deleted teams, participants, or rejected/deleted reviews so the background
-- Google Sheets sync will never re-import or re-queue them, even if their rows
-- remain in the Google Sheets spreadsheet.

create table tombstoned_registrations (
    id          bigint generated always as identity primary key,
    team_name   text,
    email       text,
    reason      text,
    created_by  bigint,
    created_at  timestamptz not null default now(),

    constraint tombstoned_registrations_created_by_fkey
        foreign key (created_by) references users (id) on delete set null
);

create index tombstoned_registrations_team_name_idx
    on tombstoned_registrations (lower(trim(team_name)))
    where team_name is not null;

create index tombstoned_registrations_email_idx
    on tombstoned_registrations (lower(trim(email)))
    where email is not null;

comment on table tombstoned_registrations is
    'Tombstone list of team names and emails that were explicitly deleted or rejected by an admin, skipped by automated form imports.';
