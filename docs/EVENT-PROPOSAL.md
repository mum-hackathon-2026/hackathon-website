# Averis Hackathon 2026 — Event Proposal

Organised by **Google Developers Group on Campus Monash University Malaysia (GDGoC MUM)** and **Monash University Malaysia Tech Club (MUMTEC)**, in partnership with **Averis**.

Semester 2, 2026 · EMS Ref. No. `E-202610796`

---

## Event overview

| | |
|---|---|
| **Start** | 18 September 2026, 6:00 p.m. |
| **End** | 26 September 2026, 6:00 p.m. |
| **Duration** | 8 days |
| **Venue** | Plenary Theatre (26 September 2026, Final Pitch Day) |

**Description:** A collaborative industry hackathon jointly organised by GDGoC MUM and MUMTEC, in partnership with Averis, enabling students to develop innovative solutions to industry challenges through a guided build period, culminating in a final pitching event evaluated by industry professionals.

### Purpose

1. Provide students with hands-on experience solving authentic industry challenges.
2. Enhance participants' technical, teamwork, and pitching skills through a structured innovation competition.
3. Foster collaboration between students and industry while creating networking and career development opportunities.

### Targeted attendance

- **500 students** from different universities
- **Capped at 100 teams, 5 participants each**
- **50 finalists** (10 finalist teams) invited to present at Final Pitch Day

---

## Collaboration and external parties

| Role | Party | Responsibility |
|---|---|---|
| Organiser | GDGoC MUM | Overall event planning |
| Club partner | MUMTEC | Publicity efforts, oversees event execution |
| Sponsor | Averis Representatives | Main sponsor; prepares the problem statement; provides judges |

---

## Schedule

### Opening Ceremony (Virtual) — 18 September 2026

| Time | Activity |
|---|---|
| 18:00 – 18:10 | Welcome, introduction to the hackathon and organisers |
| 18:10 – 18:25 | Introduction to Averis and opening address |
| 18:25 – 18:40 | Problem statement release |
| 18:40 – 18:55 | Timeline, submission requirements and documentation briefing |
| 18:55 – 19:00 | Workshop schedule and communication channels |
| 19:00 – 19:20 | Problem statement FAQ and open Q&A |
| 19:20 – 19:30 | Closing remarks |

### Build Period — 18–22 September 2026

- **Workshop 1:** 20 September 2026
- **Workshop 2:** 21 September 2026

### Submission — 22 September 2026

| Time | Activity |
|---|---|
| 12:00 | Submission due. Organising committee checks eligibility. |

### Shortlisting — 23–24 September 2026

| Time | Activity |
|---|---|
| 23:59 | Judges score asynchronously to select the top 10 finalists |

### Finalist Announcement — 25 September 2026

| Time | Activity |
|---|---|
| 12:00 | Top 10 finalists announced via individual emails, Discord and Instagram posts |

### Final Pitch Day — 26 September 2026

| Time | Activity |
|---|---|
| 09:00 – 09:30 | Finalist registration and technical checks |
| 09:30 – 09:45 | Opening address by Monash and Averis representatives |
| 09:45 – 11:15 | Final Pitch Round 1 — 5 finalist teams (10-min pitch + 5-min Q&A each) |
| 11:15 – 11:30 | Networking break |
| 11:30 – 13:00 | Final Pitch Round 2 — 5 finalist teams (10-min pitch + 5-min Q&A each) |
| 13:00 – 15:00 | Lunch session and judging panel deliberation |
| 15:00 – 16:00 | Averis engagement session with full participant cohort while judges finalise decisions |
| 16:00 – 17:30 | Winner announcement, prize presentation, group photograph, closing remarks |
| 17:30 – 18:00 | Clean up |

---

## Budget

Estimated expenditure, inclusive of 6% tax charges.

| No. | Item | Price/Unit (RM) | Unit | Total (RM) |
|---|---|---|---|---|
| 1 | Food and Beverages | 20 | 200 | 4,000 |
| 2 | Prize | 5000 / 3000 / 1000 | 3 | 9,000 |
| 3 | Token of appreciation | 150 | 20 | 3,000 |
| 4 | Lanyard and card holder | 10 | 100 | 1,000 |
| 5 | T-shirt | 25 | 40 | 1,000 |
| 6 | Banner & bunting | — | 3 | — |
| 7 | Mock cheque | — | 4 | — |
| 8 | Instagram subscription | — | — | — |
| 9 | Certificates (Committee, Participants, Judges) | — | — | — |
| | **Total estimated expenditure** | | | **14,000** |

*Note: the line items as listed sum to RM 18,000; the document states a total of RM 14,000. Items 6–9 have no unit price. Treat the total as authoritative pending clarification.*

---

## Sign-off

| Role | Name | Position |
|---|---|---|
| Prepared by | Seah Yu Jie | Events Executive, GDGoC MUM |
| Checked by | Teh Ming Dong | Lead, GDGoC MUM |
| Checked by | Pee Yee Peen | President, MUMTEC |

---

## Notes for implementation

Facts from this proposal that map onto the hackathon website's data model.

### ✅ Team size conflict — resolved by V6

The proposal states **5 participants per team**. The implementation used to cap teams at **4**:

- `event_settings.max_team_size` was seeded at 4
- The Google Form had 4 member blocks (`Member 1` – `Member 4`)
- `TeamRow.MAX_TEAM_SIZE` was a constant rejecting any team above 4 — **this constant no longer exists**

**RESOLVED — 5 is correct, and the minimum is 2.** `V6__team_size_two_to_five.sql` updates the `event_settings` singleton to `min_team_size = 2`, `max_team_size = 5`, and the importer now reads both values from that row at import time instead of holding a constant. The form needs a fifth `Member 5: ...` block; its header aliases already follow the generic per-block rule, so no code change was needed for them. **Changing the range again is an `UPDATE` on `event_settings` plus a form change — no code, no migration.**

### Dates for `event_settings`

| Column | Value from proposal |
|---|---|
| `event_name` | Averis Hackathon 2026 |
| `submission_deadline_at` | 22 September 2026, 12:00 (MYT) |
| `results_published_at` | 25 September 2026, 12:00 (MYT) |
| `registration_opens_at` | Not specified in the proposal |
| `registration_closes_at` | Not specified in the proposal |

Registration window is undefined here and needs a decision.

### Judging

- Judges are provided by Averis.
- Scoring is **asynchronous**, 23–24 September, deadline 23:59.
- Judges select the **top 10 finalists** from all submissions — this is the shortlisting phase, matching `teams.shortlisted` and `event_settings.screening_enabled`.
- Final Pitch Day scoring (10 teams, two rounds) determines the winners — matching `team_results.outcome` and `rank`.

Three prize tiers (RM 5000 / 3000 / 1000) suggest `winner`, `runner_up`, and a third place. The current `team_results.outcome` vocabulary is `winner`, `runner_up`, `finalist`, `participant`, `disqualified` — with no distinct third-place value.

### Scale

- Up to **100 teams** and **500 participants**.
- The proposal's eligibility check happens at submission time (22 September), performed by the organising committee.
