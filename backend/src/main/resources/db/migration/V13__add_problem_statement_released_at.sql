-- V10__add_problem_statement_released_at.sql
-- Adds independent problem_statement_released_at timestamp to event_settings.

alter table event_settings
    add column if not exists problem_statement_released_at timestamptz not null default '2026-09-18 18:00:00+08';
