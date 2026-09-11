-- V19__register_solo_test_participant_seohyun.sql
--
-- Registers committee member Seohyun Lee as a solo demo participant for testing.

do $$
declare
    v_user_id bigint;
    v_team_id bigint;
begin
    -- 1. Insert or update user
    insert into users (email, full_name, role, email_verified, phone, resume_url, linkedin_url, github_url)
    values (
        'smwbss.shlee@gmail.com',
        'Seohyun Lee',
        'participant',
        true,
        'N/A',
        'https://example.com/dummy-resume.pdf',
        'https://linkedin.com/in/dummy',
        'https://github.com/dummy'
    )
    on conflict (email) do update
    set full_name = 'Seohyun Lee',
        role = 'participant',
        email_verified = true
    returning id into v_user_id;

    if v_user_id is null then
        select id into v_user_id from users where email = 'smwbss.shlee@gmail.com';
    end if;

    -- 2. Insert demo team if not exists
    select id into v_team_id from teams where name = 'Demo Team';
    if v_team_id is null then
        insert into teams (name, join_code, status, created_by)
        values ('Demo Team', 'DEMO9999', 'complete', v_user_id)
        returning id into v_team_id;
    end if;

    -- 3. Link user to demo team if not already linked
    if not exists (select 1 from team_members where user_id = v_user_id) then
        insert into team_members (user_id, team_id)
        values (v_user_id, v_team_id);
    end if;
end $$;
