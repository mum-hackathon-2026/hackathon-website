-- V21__clear_all_current_registration_reviews.sql
--
-- Clears all registration reviews currently in the queue and records them in tombstoned_registrations
-- so the background Google Sheets sync will not re-import or re-queue them.

insert into tombstoned_registrations (team_name, member_emails, reason, created_at)
select 
    rr.team_name,
    coalesce((
        select string_agg(distinct lower(trim(m->>'email')), ',' order by lower(trim(m->>'email')))
        from jsonb_array_elements(rr.raw_payload->'members') as m
        where m->>'email' is not null and trim(m->>'email') <> ''
    ), '') as member_emails,
    'Bulk cleared registration review queue' as reason,
    now() as created_at
from registration_reviews rr
where rr.team_name is not null;

delete from registration_reviews;
