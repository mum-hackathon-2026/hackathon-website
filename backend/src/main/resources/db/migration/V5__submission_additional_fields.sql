--------------------------------------------------------------------------------
-- V5: Add additional submission links and representative fields
--------------------------------------------------------------------------------

alter table submissions
    add column slide_deck_url text,
    add column video_demo_url text,
    add column representative_name text,
    add column representative_phone text,
    add column representative_email text;

alter table submissions
    add constraint submissions_slide_deck_url_check
        check (slide_deck_url is null or slide_deck_url ~ '^https?://'),
    add constraint submissions_video_demo_url_check
        check (video_demo_url is null or video_demo_url ~ '^https?://');
