# Contributing

Quick reference for how we work on this repo. Keep it simple — this is a 5-person team, not an open-source project.

## Workflow

1. Pick up an issue from the project board (or create one using the templates).
2. Create a branch off `main`:
   - `feature/team-registration`
   - `fix/inventory-off-by-one`
3. Commit with clear messages (see below).
4. Open a PR against `main` using the PR template. Link the issue with `Closes #123`.
5. Get at least 1 review approval. CI must pass.
6. Squash-merge once approved. Delete the branch after merge.

## Commit messages

Keep them short and descriptive. Prefix with the area if useful:

```
frontend: add team registration form
backend: fix off-by-one in inventory check
db: add index on submissions.team_id
ci: run the frontend specs on every PR
docs: bring the schema notes current
```

**No `Co-authored-by:` trailers for tools.** GitHub turns one into a second author avatar on the commit and on the PR, so an assistant that helped write a change ends up sitting beside you in the history as though it were a teammate. Credit the people; leave the tooling out of the log. Co-authoring a commit with another **person** on the team is still fine and is what the trailer is for.

## Code review expectations

- Review within 24 hours where possible — we're a small team, don't let PRs sit.
- Be direct but kind. Comment on the code, not the person.
- If you approve with minor nitpicks, say so explicitly ("approving, just a small comment below") so it doesn't block merge.

## Local setup issues

If you hit a setup problem, check `/docs` first, then ask in the team chat before opening an issue — most setup issues aren't bugs in the repo itself.
