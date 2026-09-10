-- V16__restore_approved_status_for_existing_teams.sql
-- Restores status = 'approved' on registration_reviews for teams that already exist in the teams table.

update registration_reviews
set status = 'approved',
    updated_at = now()
where status in ('awaiting_review', 'needs_fix')
  and exists (
      select 1 from teams t where lower(t.name) = lower(registration_reviews.team_name)
  );
