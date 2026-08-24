-- Update default team size range to 2–5 members
alter table event_settings
    alter column min_team_size set default 2,
    alter column max_team_size set default 5;

update event_settings
set min_team_size = 2,
    max_team_size = 5
where id = 1;
