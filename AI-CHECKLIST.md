# AI Security Audit

This is a prompt for your AI coding assistant. Give it this file and tell it to run the audit.

```
Run the security audit defined in AI-CHECKLIST.md against this project. Go through each vulnerability one at a time.
```

## How this works

For each vulnerability category below, you will:

1. **Investigate** the codebase thoroughly. Search every file that could be related to this problem. Check configs, routes, middleware, database schemas, environment files, frontend code, package files. Do not skim. Do not assume.
2. **Create a report** at `security/reports/{CATEGORY}_REPORT.md` documenting exactly what you found: what's vulnerable, what's safe, what's missing entirely, and severity (CRITICAL / HIGH / MEDIUM / LOW / PASS).
3. **Create a fix plan** at `security/plans/{CATEGORY}_PLAN.md` with the specific changes needed and verification goals that prove the fix works.
4. **Implement** the fixes.
5. **Verify** against every goal in the plan. Update the report with results.

Do each category fully before moving to the next. Do not batch them.

Create the `security/reports/` and `security/plans/` directories if they don't exist.
