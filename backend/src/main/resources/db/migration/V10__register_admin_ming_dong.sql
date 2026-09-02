-- V10__register_admin_ming_dong.sql
-- Registers Ming Dong as an administrator in the users allowlist.

insert into users (email, full_name, role, email_verified)
values ('mingdong9188@gmail.com', 'Ming Dong', 'admin', true)
on conflict (email) do update
set role = 'admin', full_name = 'Ming Dong';
