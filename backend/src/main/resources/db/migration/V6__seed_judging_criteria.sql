--------------------------------------------------------------------------------
-- V6: Seed standard judging rubric criteria
--------------------------------------------------------------------------------

insert into judging_criteria (title, description, max_score, weight, display_order, is_active)
values
    ('Innovation', 'Novelty of the concept and creative problem-solving', 10.00, 30.00, 1, true),
    ('Technical Execution', 'Architecture, code quality, stability, and completion', 10.00, 30.00, 2, true),
    ('Impact & Feasibility', 'Real-world usability, market viability, and domain relevance', 10.00, 25.00, 3, true),
    ('Presentation & Demo', 'Clarity of presentation, demo execution, and UI/UX polish', 10.00, 15.00, 4, true)
on conflict do nothing;
