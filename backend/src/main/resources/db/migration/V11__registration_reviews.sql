-- V11__registration_reviews.sql
--
-- Replaces the importer's old silent REJECTED/PENDING outcomes with an admin-visible
-- review queue. Every row the importer used to auto-reject or auto-pend (and discard,
-- keeping no record beyond console output) now lands here instead, and an admin decides
-- per team: approve (import for real, editing the submitted data first if needed), send
-- back as needing a fix, or reject outright.
--
-- One row per team NAME, not per import attempt: a resync of the same sheet updates the
-- existing row rather than creating a duplicate. That is what unique(team_name) buys.
-- The importer's upsert only touches a row while its status is 'awaiting_review' or
-- 'needs_fix' - an 'approved' or 'rejected' decision is never silently reopened by a
-- later sync.

create table registration_reviews (
    id            bigint generated always as identity primary key,
    team_name     text        not null,
    -- The team name plus every member's raw submitted field, verbatim - exactly what was
    -- typed into the form, including whatever made it a problem ('N/A' in a URL box,
    -- a blank major, and so on). Nothing here has been validated or normalised.
    raw_payload   jsonb       not null,
    -- Every reason this row needs a human, as human-readable strings - the same messages
    -- TeamRow and EligibilityScreening already produce for the console report.
    issues        jsonb       not null,
    status        text        not null default 'awaiting_review',
    -- The importer's line number at the time of the run that created this row. Purely
    -- informational - a re-sync can move a team to a different line without changing
    -- anything else about it.
    source_line   integer,
    admin_note    text,
    reviewed_by   bigint,
    reviewed_at   timestamptz,
    created_at    timestamptz not null default now(),
    updated_at    timestamptz not null default now(),

    constraint registration_reviews_team_name_key unique (team_name),
    constraint registration_reviews_status_check
        check (status in ('awaiting_review', 'needs_fix', 'approved', 'rejected')),
    constraint registration_reviews_team_name_length_check
        check (length(team_name) between 1 and 120),
    constraint registration_reviews_reviewed_by_fkey
        foreign key (reviewed_by) references users (id) on delete set null
);

create index registration_reviews_status_idx on registration_reviews (status);

comment on table registration_reviews is
    'A queue of team registrations the importer could not accept unattended, waiting on an admin decision. Rows are never auto-imported and never auto-discarded.';
