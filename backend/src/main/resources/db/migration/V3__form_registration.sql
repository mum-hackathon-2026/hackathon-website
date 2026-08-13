-- V3__form_registration.sql
--
-- Registration moved off the site and onto a Google Form. The form collects one row
-- per TEAM — a leader plus up to three more members — and captures a name, email,
-- phone number, Google Drive resume link and LinkedIn URL for each person. A separate
-- import script reads the exported sheet and writes those rows into users, teams and
-- team_members.
--
-- Applied by Flyway as hackathon_migrator, on top of an existing V2 database.
-- V1 and V2 are immutable and are not touched here — Flyway has already recorded a
-- checksum for each, and editing either would break every teammate's database on next
-- startup.
--
-- The change this migration exists to make is small but load-bearing: a form-registered
-- person has no Google identity yet, so users.google_sub cannot be NOT NULL any more.
-- Everything else here is the three extra fields the form collects.
--
-- Deliberately NOT in this migration:
--   * no `submitted` boolean on teams — submission-by-form is undecided, and adding
--     the column now would be a second place recording a fact submissions.status
--     already records. V2 removed exactly that kind of duplication; don't reintroduce it.
--   * nothing on submissions, and nothing on teams.status.

--------------------------------------------------------------------------------
-- (a) users.google_sub becomes nullable
--------------------------------------------------------------------------------
-- google_sub is Google's subject identifier for an account. It only ever comes back
-- from a real OAuth sign-in, so Google Form registration structurally cannot produce
-- one — the form knows a person's email address and nothing about their Google
-- identity. Under V1's NOT NULL there was no way to record a registered participant
-- before their first sign-in.
--
-- The row is created anyway, because the row IS the permission: AuthController looks
-- the email up in users and returns 403 if it is absent, so `users` is the sign-in
-- allowlist. Registering through the form puts someone on that list; signing in for
-- the first time fills in the google_sub by matching on email.
--
-- The UNIQUE constraint stays exactly as V1 wrote it. This is safe, and specifically
-- it does NOT collapse every pending user into one conflicting row: a Postgres unique
-- index treats NULLs as distinct from each other, so unlimited rows may hold a NULL
-- google_sub while any two non-NULL values still collide. One real Google account
-- therefore still maps to at most one user, which is the rule the constraint was
-- there to enforce.

alter table users alter column google_sub drop not null;

comment on column users.google_sub is
    'Google''s subject (sub) claim, filled in on first successful Google sign-in by '
    'matching on email. NULL means the account is registered but has never signed in '
    '— typically a participant added by the Google Form import. Still UNIQUE: NULLs '
    'do not collide in a Postgres unique index, so many pending users coexist.';

--------------------------------------------------------------------------------
-- (b) the three fields the registration form collects per person
--------------------------------------------------------------------------------
-- All three are NULLABLE, and that is a decision rather than laziness.
--
-- DO NOT "FIX" THESE TO NOT NULL.
--
-- The form requires all three of every participant, so it is tempting to mirror that
-- requirement in the schema. It would be wrong, because `users` is not the
-- participants table — it is the accounts table. Judges and admins are rows in users
-- too, and they are created by hand rather than by the form. A judge has no resume to
-- upload and no reason to give a LinkedIn URL. NOT NULL here would make it impossible
-- to add a judge without inventing values for columns that do not apply to them.
--
-- The requirement is real, but it belongs to the form, which is the only thing that
-- knows it is talking to a participant. The import script re-checks it and rejects a
-- row whose resume or LinkedIn value is not a URL, so bad data still does not reach
-- the table — enforcement simply happens one layer up from the database.
--
-- For the same reason there is no CHECK on the two URL columns. submissions.github_url
-- carries `~ '^https?://'` because the application writes that column directly; these
-- two are written by an importer that has already validated them and can report a
-- readable reason to a human, which a constraint violation cannot.

alter table users
    add column phone        text,
    add column resume_url   text,
    add column linkedin_url text;

comment on column users.phone is
    'Contact number as typed into the registration form. Nullable: judges and admins '
    'are rows in users too and are not created by the form.';

comment on column users.resume_url is
    'Google Drive link to the participant''s resume, as collected by the registration '
    'form. Nullable for the same reason as phone — a judge has no resume. The import '
    'script validates that it is a URL; the database deliberately does not.';

comment on column users.linkedin_url is
    'The participant''s LinkedIn profile URL, as collected by the registration form. '
    'Nullable for the same reason as phone. Validated by the import script, not here.';
