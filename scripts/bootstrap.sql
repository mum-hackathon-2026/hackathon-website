-- scripts/bootstrap.sql
--
-- LOCAL DEVELOPMENT ONLY.
--
-- The credentials below are container-local development passwords. They exist so that
-- every teammate gets an identical local setup from one command. They are NOT secrets
-- and must NEVER be reused for any deployed environment — staging, production, or a
-- shared team database. A deployed environment gets its own roles with its own
-- passwords, supplied through environment variables and never committed.
--
-- Creates two roles with a deliberate privilege split:
--   hackathon_migrator / dev_migrator_local  — owns the schema. Used by Flyway. Has DDL.
--   hackathon_app      / dev_app_local       — the application. LOGIN + DML only, no DDL.
--
-- Run it against the local Postgres 16 container:
--
--   docker exec -i hackathon-pg16 psql -U postgres < scripts/bootstrap.sql
--
-- THIS FILE ONLY WORKS THROUGH psql. Two reasons:
--   1. CREATE DATABASE cannot run inside a transaction block, so this cannot be pasted
--      into a tool that wraps statements in a transaction.
--   2. \c is a psql meta-command, not SQL. A GUI SQL editor (pgAdmin, DBeaver, DataGrip)
--      will not understand it and will apply every grant to the wrong database.
--
-- Re-running: the role creation below is guarded and safe to repeat. The CREATE DATABASE
-- statements are not — on a second run they report 'already exists', which is harmless
-- and can be ignored.

--------------------------------------------------------------------------------
-- roles
--------------------------------------------------------------------------------
-- Neither role is a superuser and neither may create databases. hackathon_app is
-- additionally never granted CREATE on any schema, which is what removes its DDL
-- rights: it can read and write rows, but cannot create, alter or drop a table.

do $$
begin
    if not exists (select 1 from pg_roles where rolname = 'hackathon_migrator') then
        create role hackathon_migrator login password 'dev_migrator_local'
            nosuperuser nocreatedb nocreaterole;
    end if;
end
$$;

do $$
begin
    if not exists (select 1 from pg_roles where rolname = 'hackathon_app') then
        create role hackathon_app login password 'dev_app_local'
            nosuperuser nocreatedb nocreaterole;
    end if;
end
$$;

--------------------------------------------------------------------------------
-- databases
--------------------------------------------------------------------------------
-- hackathon_db      — local development
-- hackathon_db_test — integration tests; wiped and re-migrated on every test run

create database hackathon_db      owner hackathon_migrator;
create database hackathon_db_test owner hackathon_migrator;

--------------------------------------------------------------------------------
-- privileges: hackathon_db
--------------------------------------------------------------------------------
-- Privileges are per-database, so this whole block is repeated verbatim for the test
-- database below. Editing one without the other is the usual cause of "works locally,
-- fails in tests".

\c hackathon_db

alter schema public owner to hackathon_migrator;

-- Postgres grants CREATE/USAGE on public to PUBLIC by default; revoke it so that
-- access is granted deliberately rather than inherited.
revoke all on schema public   from public;
revoke all on database hackathon_db from public;

grant connect on database hackathon_db to hackathon_app, hackathon_migrator;

-- USAGE lets the app see objects in the schema. It is NOT granted CREATE, so it
-- cannot issue DDL.
grant usage on schema public to hackathon_app;
grant usage, create on schema public to hackathon_migrator;

-- Tables created by Flyway in the future are automatically readable/writable by the
-- app, without anyone remembering to re-run a grant after each migration.
alter default privileges for role hackathon_migrator in schema public
    grant select, insert, update, delete on tables to hackathon_app;
alter default privileges for role hackathon_migrator in schema public
    grant usage, select on sequences to hackathon_app;

--------------------------------------------------------------------------------
-- privileges: hackathon_db_test
--------------------------------------------------------------------------------

\c hackathon_db_test

alter schema public owner to hackathon_migrator;

revoke all on schema public   from public;
revoke all on database hackathon_db_test from public;

grant connect on database hackathon_db_test to hackathon_app, hackathon_migrator;

grant usage on schema public to hackathon_app;
grant usage, create on schema public to hackathon_migrator;

alter default privileges for role hackathon_migrator in schema public
    grant select, insert, update, delete on tables to hackathon_app;
alter default privileges for role hackathon_migrator in schema public
    grant usage, select on sequences to hackathon_app;
