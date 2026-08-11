-- V2__hard_delete_and_status_cleanup.sql
--
-- Applies three schema decisions the team ratified after V1 landed, plus one
-- ON DELETE rule change that follows from the first of them.
--
-- Applied by Flyway as hackathon_migrator, on top of an existing V1 database.
-- V1 is immutable and is not touched here — Flyway has already recorded its
-- checksum, and editing it would break every teammate's database on next startup.
--
-- Every table affected below is empty at the time this migration is written
-- (users, teams, submissions, assignments and team_members all have zero rows —
-- there is no HTTP API yet, so nothing can have written to them). No data
-- migration is therefore required. Where a narrowed constraint could in principle
-- reject an existing row, this migration is deliberately left to fail loudly
-- rather than silently remapping data: see the note on teams_status_check below.

--------------------------------------------------------------------------------
-- (a) users.status is removed — deletion is hard delete, not soft delete
--------------------------------------------------------------------------------
-- V1 modelled account lifecycle as a text column ('active', 'suspended',
-- 'deleted'), which made a deleted user an ordinary row that every query had to
-- remember to filter out. The team confirmed hard delete instead: a deleted user
-- is removed from the table, and the FK rules below decide what happens to the
-- rows that referenced them.
--
-- Nothing else in V1 depends on this column. It carries no foreign key, backs no
-- index, and appears in no view, trigger or generated column — the only dependent
-- object is its own CHECK constraint, dropped explicitly here for the record.
-- (DROP COLUMN would remove a single-column CHECK on its own; naming it makes the
-- intent legible in the migration rather than implicit in Postgres' behaviour.)

alter table users drop constraint users_status_check;
alter table users drop column status;

--------------------------------------------------------------------------------
-- (b) teams.status loses 'submitted' — submission state lives on submissions
--------------------------------------------------------------------------------
-- V1 recorded "this team has submitted" in two places at once: teams.status
-- 'submitted' and submissions.status 'submitted'. Two columns encoding one fact
-- can disagree, and nothing in the schema kept them in step. The team resolved it
-- in favour of submissions.status, which is where a submission's own lifecycle
-- belongs, and which is already constrained to record submitted_at whenever it
-- holds 'submitted'.
--
-- teams.status now describes only the team's own lifecycle.
--
-- submissions.status is deliberately NOT touched by this migration. It keeps its
-- full vocabulary ('draft', 'submitted', 'withdrawn', 'disqualified') — a
-- submission must still be able to record that it was submitted. Removing
-- 'submitted' from BOTH tables would leave the system unable to express the fact
-- at all.
--
-- teams is empty, so there is no data to migrate. If a database somewhere does
-- hold a team at 'submitted', ADD CONSTRAINT will fail and this migration will
-- stop. That is intended: such a row means a submission state was recorded
-- somewhere this migration cannot safely reinterpret, and a human should decide
-- what it becomes rather than a blanket UPDATE guessing.

alter table teams drop constraint teams_status_check;
alter table teams add constraint teams_status_check
    check (status in ('forming', 'complete', 'disqualified', 'withdrawn'));

--------------------------------------------------------------------------------
-- (c) assignments.judge_id becomes ON DELETE CASCADE
--------------------------------------------------------------------------------
-- This follows directly from (a). Under V1's ON DELETE RESTRICT, a judge holding
-- any assignment could not be deleted at all — the FK would refuse the delete.
-- That was tolerable while deletion was a status flip; with hard delete it means
-- a judge cannot delete their own account for as long as an assignment exists,
-- which is not a state the team wants to be in.
--
-- CASCADE makes deleting a judge remove their assignments, and scores follow
-- automatically: scores.assignment_id is already ON DELETE CASCADE in V1, so a
-- judge's scores go with the assignments they belonged to. Deleting a judge
-- therefore erases that judge's contribution to judging entirely, which is the
-- intended reading of a hard delete.
--
-- A constraint's ON DELETE action cannot be altered in place; the constraint has
-- to be dropped and recreated. assignments_judge_id_idx is a separate CREATE INDEX
-- in V1, not an artefact of this constraint, so it survives untouched and judge_id
-- stays index-backed throughout.
--
-- assignments.assigned_by keeps ON DELETE SET NULL: it records which admin made
-- the assignment, and deleting that admin should not delete other people's work.

alter table assignments drop constraint assignments_judge_id_fkey;
alter table assignments add constraint assignments_judge_id_fkey
    foreign key (judge_id) references users (id) on delete cascade;

--------------------------------------------------------------------------------
-- (d) empty teams are retained — deliberately, not by omission
--------------------------------------------------------------------------------
-- There is no DDL in this section, on purpose.
--
-- team_members.user_id is ON DELETE CASCADE, so deleting the last member of a
-- team removes that membership row and leaves the team behind with no members.
-- Nothing auto-deletes such a team, and nothing here adds a trigger, a cascade or
-- a scheduled sweep to do so.
--
-- That is the team's decision, not an oversight. An empty team keeps its name and
-- its join code — both UNIQUE — so the name stays reserved and anyone holding the
-- code can still join and revive it. Reaping empty teams automatically would free
-- those identifiers underneath people mid-event and destroy a team's history the
-- moment it briefly emptied.
--
-- If empty teams ever do need clearing up, it belongs in an explicit admin action
-- that a person triggers, not in a database-level rule that fires invisibly.
