--------------------------------------------------------------------------------
-- V7: Seed Averis Hackathon 2026 Preliminary Round Judging Criteria (70% Tech, 30% Product)
--------------------------------------------------------------------------------

delete from scores;
delete from judging_criteria;

insert into judging_criteria (title, description, max_score, weight, display_order, is_active)
values
    -- TECHNICAL — 70 POINTS
    ('System Design & Architecture', 'How well the solution is structured, including its main components, data flow, interfaces and dependencies.', 15.00, 15.00, 1, true),
    ('Working Core Prototype', 'How much of the core solution is working at the preliminary stage.', 25.00, 25.00, 2, true),
    ('Technology Integration (TBC)', 'Placeholder criterion pending sponsor alignment. It will assess how well the agreed technology or platform is used in the solution.', 15.00, 15.00, 3, true),
    ('Technical Feasibility & Validation', 'Whether key technical assumptions have been tested and the team has a realistic path to a complete solution.', 15.00, 15.00, 4, true),

    -- PRODUCT & IMPACT — 30 POINTS
    ('Problem Statement Understanding', 'How clearly the team understands the given problem statement, affected users or stakeholders, and the need being addressed.', 10.00, 10.00, 5, true),
    ('Innovation & Solution Approach', 'How original and suitable the proposed solution is for the problem statement.', 10.00, 10.00, 6, true),
    ('Practical Value & Potential', 'Whether the solution could provide useful value and has a realistic path beyond the preliminary round.', 10.00, 10.00, 7, true);
