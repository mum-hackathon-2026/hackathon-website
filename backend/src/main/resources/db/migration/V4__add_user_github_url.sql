-- V4__add_user_github_url.sql
--
-- Adds the third of the three links the registration form collects per person.
--
-- V3 added resume_url and linkedin_url and missed this one. The form asks every
-- participant for a resume (Google Drive), a GitHub ACCOUNT and a LinkedIn profile, so an
-- admin can screen applicants before accepting them. Two of the three landed; this is the
-- third.
--
-- Applied by Flyway as hackathon_migrator, on top of an existing V3 database.
-- V1, V2 and V3 are immutable and are not touched here — Flyway has recorded a checksum
-- for each, and editing any of them would break every teammate's database on next startup.

--------------------------------------------------------------------------------
-- users.github_url
--------------------------------------------------------------------------------
-- NULLABLE, for exactly the reason V3 gives for phone, resume_url and linkedin_url, and
-- the same warning applies: DO NOT "FIX" THIS TO NOT NULL.
--
-- The form requires it of every participant, but `users` is the accounts table, not the
-- participants table. Judges and admins are rows in it too, are created by hand rather
-- than by the form, and have no GitHub profile to give. NOT NULL would make adding a judge
-- impossible without inventing a value for a column that does not apply to them.
--
-- The requirement is real; it belongs to the form, which is the only thing that knows it
-- is talking to a participant. The CSV importer re-checks it and rejects a row whose
-- GitHub value is not a URL, so bad data still does not reach the table — enforcement just
-- happens one layer up from the database.
--
-- No CHECK constraint, again matching V3: the importer validates the value and can report
-- a readable reason to a human, which a constraint violation cannot.

alter table users add column github_url text;

--------------------------------------------------------------------------------
-- the two github_url columns are DIFFERENT THINGS
--------------------------------------------------------------------------------
-- There are now two columns called github_url in this schema, and confusing them would be
-- easy and quiet:
--
--   users.github_url        the PERSON. Their GitHub account, collected at registration
--                           so an admin can screen them before accepting. Set once, by
--                           the form importer, and never by the participant afterwards.
--
--   submissions.github_url  the PROJECT. The repository for the thing the team built
--                           during the hackathon. Written by the team while they work,
--                           and read by judges when scoring.
--
-- One is an identity, the other is an artefact. A query joining users to submissions can
-- select both and get a profile URL where it wanted a repo, with nothing to catch it.
-- Both are commented below so the distinction is readable from the database itself
-- (\d+ users) rather than only from this file.
--
-- submissions.github_url is only being COMMENTED here, not altered. Its
-- submissions_github_url_check from V1 is untouched.

comment on column users.github_url is
    'THE PERSON, not a project. The participant''s own GitHub profile URL, collected by '
    'the registration form so admins can screen applicants before accepting them. '
    'Nullable: judges and admins are rows in users too and have no GitHub link, and the '
    'form enforces the requirement rather than the database. NOT the repository for a '
    'hackathon project — that is submissions.github_url.';

comment on column submissions.github_url is
    'THE PROJECT, not a person. The repository URL for what the team built during the '
    'hackathon, written by the team and read by judges. NOT a participant''s personal '
    'GitHub account — that is users.github_url.';
