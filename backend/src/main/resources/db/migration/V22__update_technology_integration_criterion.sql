-- V22__update_technology_integration_criterion.sql
--
-- Updates the 'Technology Integration' criterion to remove '(TBC)' and update its description
-- to match the finalized judging rubric.

update judging_criteria
set title = 'Technology Integration',
    description = 'How appropriately and effectively the chosen technologies, tools, libraries, and APIs are integrated to solve the problem, with no restrictions on tech stack.'
where title like 'Technology Integration%' or display_order = 3;
