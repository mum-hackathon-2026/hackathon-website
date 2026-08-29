-- V9__register_admin_darren.sql
-- Registers Darren Melvern as an administrator in the users allowlist.

insert into users (email, full_name, role, email_verified)
values ('darrenmelvern52@gmail.com', 'Darren Melvern', 'admin', true)
on conflict (email) do update
set role = 'admin', full_name = 'Darren Melvern';
