-- V1__baseline_schema.sql
--
-- Baseline schema for the hackathon website.
--
-- Applied by Flyway as hackathon_migrator (owns the schema and holds DDL rights).
-- The application connects as hackathon_app, which has DML rights only; the grant
-- block at the foot of this file wires that up for the tables created here.
--
-- Conventions enforced throughout:
--   * surrogate keys are BIGINT GENERATED ALWAYS AS IDENTITY (never bigserial)
--   * every timestamp is timestamptz
--   * text over varchar(n); CHECK constraints only where a real limit exists
--   * enum-like columns are text + CHECK, never Postgres ENUM types
--   * scored values are numeric, never floating point
--   * every foreign key column is index-backed
--
-- Tables are created in dependency order so every foreign key resolves on first pass.

--------------------------------------------------------------------------------
-- users
--------------------------------------------------------------------------------

create table users (
    id             bigint generated always as identity primary key,
    google_sub     text        not null,
    email          text        not null,
    full_name      text        not null,
    role           text        not null default 'participant',
    status         text        not null default 'active',
    email_verified boolean     not null default false,
    last_login_at  timestamptz,
    created_at     timestamptz not null default now(),

    constraint users_google_sub_key unique (google_sub),
    constraint users_email_key unique (email),
    -- email is stored lowercase so the unique constraint is genuinely case-insensitive
    constraint users_email_lowercase_check check (email = lower(email)),
    constraint users_email_length_check check (length(email) between 3 and 320),
    constraint users_full_name_length_check check (length(full_name) between 1 and 200),
    constraint users_role_check check (role in ('participant', 'judge', 'admin')),
    constraint users_status_check check (status in ('active', 'suspended', 'deleted'))
);

--------------------------------------------------------------------------------
-- event_settings  (singleton: exactly one row, id = 1)
--------------------------------------------------------------------------------

create table event_settings (
    id                     bigint  primary key,
    event_name             text    not null,
    registration_opens_at  timestamptz,
    registration_closes_at timestamptz,
    submission_deadline_at timestamptz,
    judging_open           boolean not null default false,
    results_published_at   timestamptz,
    min_team_size          integer not null default 1,
    max_team_size          integer not null default 4,
    screening_enabled      boolean not null default false,
    updated_by             bigint,

    constraint event_settings_singleton_check check (id = 1),
    constraint event_settings_event_name_length_check check (length(event_name) between 1 and 200),
    constraint event_settings_team_size_check
        check (min_team_size >= 1 and min_team_size <= max_team_size),
    constraint event_settings_registration_window_check
        check (registration_opens_at is null
            or registration_closes_at is null
            or registration_closes_at > registration_opens_at),
    constraint event_settings_updated_by_fkey
        foreign key (updated_by) references users (id) on delete set null
);

create index event_settings_updated_by_idx on event_settings (updated_by);

--------------------------------------------------------------------------------
-- teams
--------------------------------------------------------------------------------

create table teams (
    id          bigint generated always as identity primary key,
    name        text        not null,
    join_code   text        not null,
    status      text        not null default 'forming',
    shortlisted boolean     not null default false,
    created_by  bigint,
    version     integer     not null default 0,
    created_at  timestamptz not null default now(),

    constraint teams_name_key unique (name),
    constraint teams_join_code_key unique (join_code),
    constraint teams_name_length_check check (length(name) between 1 and 120),
    constraint teams_join_code_length_check check (length(join_code) between 4 and 32),
    constraint teams_status_check
        check (status in ('forming', 'complete', 'submitted', 'disqualified', 'withdrawn')),
    constraint teams_version_check check (version >= 0),
    constraint teams_created_by_fkey
        foreign key (created_by) references users (id) on delete set null
);

create index teams_created_by_idx on teams (created_by);

--------------------------------------------------------------------------------
-- team_members  (user_id is the sole PK: one team per person)
--------------------------------------------------------------------------------

create table team_members (
    user_id   bigint      primary key,
    team_id   bigint      not null,
    joined_at timestamptz not null default now(),

    constraint team_members_user_id_fkey
        foreign key (user_id) references users (id) on delete cascade,
    constraint team_members_team_id_fkey
        foreign key (team_id) references teams (id) on delete cascade
);

-- user_id is already index-backed by the primary key
create index team_members_team_id_idx on team_members (team_id);

--------------------------------------------------------------------------------
-- submissions  (team_id is both PK and FK: at most one submission per team)
--------------------------------------------------------------------------------

create table submissions (
    team_id       bigint  primary key,
    project_title text    not null,
    description   text,
    github_url    text,
    deployed_url  text,
    track_label   text,
    status        text    not null default 'draft',
    submitted_at  timestamptz,
    version       integer not null default 0,

    constraint submissions_project_title_length_check
        check (length(project_title) between 1 and 200),
    constraint submissions_status_check
        check (status in ('draft', 'submitted', 'withdrawn', 'disqualified')),
    -- a submitted row must record when it was submitted
    constraint submissions_submitted_at_check
        check (status <> 'submitted' or submitted_at is not null),
    constraint submissions_github_url_check
        check (github_url is null or github_url ~ '^https?://'),
    constraint submissions_deployed_url_check
        check (deployed_url is null or deployed_url ~ '^https?://'),
    constraint submissions_version_check check (version >= 0),
    constraint submissions_team_id_fkey
        foreign key (team_id) references teams (id) on delete cascade
);

-- team_id is already index-backed by the primary key

--------------------------------------------------------------------------------
-- judging_criteria
--------------------------------------------------------------------------------

create table judging_criteria (
    id            bigint generated always as identity primary key,
    title         text         not null,
    description   text,
    max_score     numeric(5, 2) not null,
    weight        numeric(5, 2) not null default 1.00,
    display_order integer      not null default 0,
    is_active     boolean      not null default true,
    created_at    timestamptz  not null default now(),

    constraint judging_criteria_title_key unique (title),
    constraint judging_criteria_title_length_check check (length(title) between 1 and 200),
    constraint judging_criteria_max_score_check check (max_score > 0),
    constraint judging_criteria_weight_check check (weight > 0)
);

--------------------------------------------------------------------------------
-- assignments  (one judge assigned to one team, at most once)
--------------------------------------------------------------------------------

create table assignments (
    id               bigint generated always as identity primary key,
    team_id          bigint      not null,
    judge_id         bigint      not null,
    status           text        not null default 'pending',
    overall_feedback text,
    assigned_by      bigint,
    assigned_at      timestamptz not null default now(),
    completed_at     timestamptz,

    constraint assignments_team_id_judge_id_key unique (team_id, judge_id),
    constraint assignments_status_check
        check (status in ('pending', 'in_progress', 'completed', 'declined')),
    constraint assignments_completed_at_check
        check (status <> 'completed' or completed_at is not null),
    constraint assignments_team_id_fkey
        foreign key (team_id) references teams (id) on delete cascade,
    constraint assignments_judge_id_fkey
        foreign key (judge_id) references users (id) on delete restrict,
    constraint assignments_assigned_by_fkey
        foreign key (assigned_by) references users (id) on delete set null
);

-- team_id is index-backed as the leading column of assignments_team_id_judge_id_key
create index assignments_judge_id_idx on assignments (judge_id);
create index assignments_assigned_by_idx on assignments (assigned_by);

--------------------------------------------------------------------------------
-- scores  (one score per criterion per assignment)
--------------------------------------------------------------------------------

create table scores (
    id                          bigint generated always as identity primary key,
    assignment_id               bigint        not null,
    criteria_id                 bigint        not null,
    score                       numeric(5, 2) not null,
    comment                     text,
    -- criteria max/weight are frozen at scoring time so published results stay
    -- reproducible even if the criteria are edited afterwards
    criteria_max_score_snapshot numeric(5, 2) not null,
    criteria_weight_snapshot    numeric(5, 2) not null,

    constraint scores_assignment_id_criteria_id_key unique (assignment_id, criteria_id),
    constraint scores_snapshot_check
        check (criteria_max_score_snapshot > 0 and criteria_weight_snapshot > 0),
    constraint scores_score_range_check
        check (score >= 0 and score <= criteria_max_score_snapshot),
    constraint scores_assignment_id_fkey
        foreign key (assignment_id) references assignments (id) on delete cascade,
    constraint scores_criteria_id_fkey
        foreign key (criteria_id) references judging_criteria (id) on delete restrict
);

-- assignment_id is index-backed as the leading column of scores_assignment_id_criteria_id_key
create index scores_criteria_id_idx on scores (criteria_id);

--------------------------------------------------------------------------------
-- team_results
--------------------------------------------------------------------------------

create table team_results (
    team_id      bigint primary key,
    final_score  numeric(6, 2),
    rank         integer,
    outcome      text,
    judge_count  integer not null default 0,
    published_at timestamptz,

    constraint team_results_outcome_check
        check (outcome is null
            or outcome in ('winner', 'runner_up', 'finalist', 'participant', 'disqualified')),
    constraint team_results_rank_check check (rank is null or rank >= 1),
    constraint team_results_final_score_check check (final_score is null or final_score >= 0),
    constraint team_results_judge_count_check check (judge_count >= 0),
    constraint team_results_team_id_fkey
        foreign key (team_id) references teams (id) on delete cascade
);

-- team_id is already index-backed by the primary key

--------------------------------------------------------------------------------
-- notifications_log
--------------------------------------------------------------------------------

create table notifications_log (
    id              bigint generated always as identity primary key,
    team_id         bigint,
    user_id         bigint,
    type            text    not null,
    recipient_email text    not null,
    status          text    not null default 'pending',
    error_message   text,
    attempt_count   integer not null default 0,
    sent_at         timestamptz,

    constraint notifications_log_type_check
        check (type in ('team_invite', 'team_joined', 'submission_receipt',
                        'deadline_reminder', 'judge_assignment', 'results_published')),
    constraint notifications_log_status_check
        check (status in ('pending', 'sent', 'failed', 'bounced')),
    constraint notifications_log_recipient_email_check
        check (recipient_email = lower(recipient_email)
           and length(recipient_email) between 3 and 320),
    constraint notifications_log_attempt_count_check check (attempt_count >= 0),
    constraint notifications_log_sent_at_check
        check (status <> 'sent' or sent_at is not null),
    constraint notifications_log_team_id_fkey
        foreign key (team_id) references teams (id) on delete set null,
    constraint notifications_log_user_id_fkey
        foreign key (user_id) references users (id) on delete set null
);

create index notifications_log_team_id_idx on notifications_log (team_id);
create index notifications_log_user_id_idx on notifications_log (user_id);

--------------------------------------------------------------------------------
-- audit_log
--------------------------------------------------------------------------------

create table audit_log (
    id            bigint generated always as identity primary key,
    actor_user_id bigint,
    action        text        not null,
    entity_type   text        not null,
    entity_id     bigint,
    details       jsonb,
    created_at    timestamptz not null default now(),

    constraint audit_log_action_length_check check (length(action) between 1 and 100),
    constraint audit_log_entity_type_length_check check (length(entity_type) between 1 and 100),
    constraint audit_log_actor_user_id_fkey
        foreign key (actor_user_id) references users (id) on delete set null
);

create index audit_log_actor_user_id_idx on audit_log (actor_user_id);
-- audit trails are read newest-first
create index audit_log_created_at_idx on audit_log (created_at desc);

--------------------------------------------------------------------------------
-- seed data
--------------------------------------------------------------------------------
-- event_settings is a singleton (id = 1). Seeding it here means the application
-- never has to cope with the row being absent.
--
-- Every value below is deliberately inert: registration is neither open nor closed,
-- judging is shut, and nothing is published. An admin sets the real dates before the
-- event. Nothing here can accidentally expose an unfinished site.
--
-- NOTE: min_team_size 1 / max_team_size 4 could not be confirmed against any
-- document — docs/ contains no schema or proposal. These are the values specified in
-- the task brief and need team confirmation.

insert into event_settings (
    id,
    event_name,
    registration_opens_at,
    registration_closes_at,
    submission_deadline_at,
    judging_open,
    results_published_at,
    min_team_size,
    max_team_size,
    screening_enabled,
    updated_by
) values (
    1,
    'Monash University Malaysia Hackathon',
    null,
    null,
    null,
    false,
    null,
    1,
    4,
    false,
    null
);

-- Privileges are deliberately NOT granted here. They live only in
-- scripts/bootstrap.sql, so that every environment executes byte-identical
-- migration SQL. A database whose roles were provisioned differently should fail
-- loudly rather than be silently patched up by the migration.
