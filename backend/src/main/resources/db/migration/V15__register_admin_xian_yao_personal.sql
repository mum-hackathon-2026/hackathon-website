-- V15__register_admin_xian_yao_personal.sql
-- Registers Xian Yao's personal email as an administrator in the users allowlist.

insert into users (email, full_name, role, email_verified)
values ('leexy37@gmail.com', 'Xian Yao', 'admin', true)
on conflict (email) do update
set role = 'admin', full_name = 'Xian Yao';
