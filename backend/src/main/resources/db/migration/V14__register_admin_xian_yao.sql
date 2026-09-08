-- V14__register_admin_xian_yao.sql
-- Registers Xian Yao as an administrator in the users allowlist.

insert into users (email, full_name, role, email_verified)
values ('xlee0063@student.monash.edu', 'Xian Yao', 'admin', true)
on conflict (email) do update
set role = 'admin', full_name = 'Xian Yao';
