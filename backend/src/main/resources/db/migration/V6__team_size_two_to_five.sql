-- V6__team_size_two_to_five.sql

update event_settings
set min_team_size = 2,
    max_team_size = 5
where id = 1;


comment on column event_settings.min_team_size is
    'Smallest permitted team, inclusive. Read at import time by '
    'tools/FormRegistrationImporter, which rejects any registration below it. Changing the '
    'limit is an UPDATE here plus a matching change to the registration form - no code '
    'change. V6 moved this from 1 to 2, ending solo entries.';

comment on column event_settings.max_team_size is
    'Largest permitted team, inclusive. Read at import time by '
    'tools/FormRegistrationImporter, which rejects any registration above it and scans the '
    'form for exactly this many "Member N" blocks. Changing the limit is an UPDATE here '
    'plus a matching change to the registration form - no code change. V6 moved this from '
    '4 to 5.';
