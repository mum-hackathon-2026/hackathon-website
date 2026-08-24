-- Add judges_per_team column to event_settings
alter table event_settings
    add column if not exists judges_per_team integer not null default 3;

alter table event_settings
    drop constraint if exists event_settings_judges_per_team_check;

alter table event_settings
    add constraint event_settings_judges_per_team_check
    check (judges_per_team >= 1 and judges_per_team <= 10);
