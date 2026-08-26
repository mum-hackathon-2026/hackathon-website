# Security Rules

These rules apply to all code generated in this project. They are non-negotiable.

> **Read the stack note first.** This file was adopted from a generic checklist written for a
> Next.js + Supabase/Firebase project. **This repo is Angular 21 + Spring Boot 4 + Postgres 16.**
> Several rules below name technologies we do not have — `NEXT_PUBLIC_`, Supabase RLS, Firebase
> Security Rules, `dangerouslySetInnerHTML`, Python `pickle`. **The principles transfer; the
> specifics need translating.** The mapping is:
>
> | The rule says | Here that means |
> | ------------- | --------------- |
> | `NEXT_PUBLIC_` / `VITE_` / `REACT_APP_` env vars | Anything under `frontend/src/` — it is all bundled and shipped to the browser |
> | Supabase Row Level Security | The `hackathon_migrator` / `hackathon_app` privilege split in `scripts/bootstrap.sql`. `hackathon_app` is DML-only and must never be granted DDL |
> | Firebase Security Rules / `request.auth` | `SecurityConfig`'s matcher chain plus `JwtAuthenticationFilter` |
> | "auth middleware before the handler" | A `requestMatchers(...)` rule in `SecurityConfig`, not an `if` inside a controller method |
> | ORM / parameterized queries | Spring Data derived queries, and `PreparedStatement` in `tools/` — never string concatenation |
> | `dangerouslySetInnerHTML` / `v-html` | Angular's `[innerHTML]` and `DomSanitizer.bypassSecurityTrust*` |
>
> **Two rules below are currently violated in this tree.** `POST /api/auth/dev-login` returns a
> signed admin JWT to any anonymous caller, and `app.webhook.secret` ships blank, which disables
> the registration webhook's only authentication check. See [docs/PROJECT-STATUS.md](docs/PROJECT-STATUS.md) §4.
>
> **`AI-CHECKLIST.md` drives the audit under `security/`.** Sixteen of its seventeen categories are
> marked PASS, and it does not mention either of the two items above — a PASS there means "reviewed
> at that commit", not "safe now".

## Secrets

- NEVER put API keys, database credentials, or tokens in frontend code (anything under src/, app/, pages/, components/, public/)
- NEVER put secret keys in environment variables prefixed with NEXT_PUBLIC_, VITE_, or REACT_APP_ (these are bundled into the client)
- NEVER hardcode credentials in source files. Use environment variables loaded server-side only
- The .env file MUST be in .gitignore before the first commit. Verify this before creating any .env file
- Use .env.example with placeholder values only, never real credentials

## Database

- Enable Row Level Security on EVERY Supabase table before deployment. Default policy: deny all. Write explicit policies scoped to auth.uid()
- NEVER set a Supabase RLS policy to `USING (true)` or `FOR ALL` without a WHERE condition
- Firebase Security Rules MUST require `request.auth != null` and scope access to `request.auth.uid`
- NEVER use `pickle.loads`, `pickle.load`, or any deserialization on user-supplied data. Use JSON for all network data exchange

## Authentication and Authorization

- EVERY API route that returns or modifies user data MUST have authentication middleware that runs BEFORE the handler, not inside it
- Unauthenticated requests to protected endpoints MUST return 401
- EVERY route that takes a resource ID MUST verify the authenticated user owns that resource: `current_user.id == resource.owner_id`. This is a SEPARATE check from authentication
- Admin endpoints MUST verify admin role and return 403 for non-admin users
- Session cookies MUST set `httpOnly: true`, `secure: true`, and `sameSite: 'lax'`

## Input and Output

- NEVER concatenate user input into SQL queries. ALWAYS use parameterized queries or ORM methods
- NEVER use `dangerouslySetInnerHTML`, `v-html`, or `innerHTML` with user-supplied content unless it is first sanitized with DOMPurify
- ALL user input MUST be validated server-side. Client-side validation is for UX only
- File uploads MUST validate file type by reading magic bytes, not by checking the filename extension. Rename all uploads to UUIDs server-side. Store on a separate domain (S3, R2, GCS), never on the app origin

## URL Fetching (SSRF Prevention)

- If the application fetches URLs provided by users (link previews, image proxies, URL validators):
  - Block requests to internal/private IP ranges (127.0.0.0/8, 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, 169.254.0.0/16, [::1], [fc00::/7], [fe80::/10])
  - Resolve DNS and validate the IP BEFORE making the request
  - Disable redirect following or re-validate every redirect URL

## Project-specific rules

These are not in the generic checklist and matter here:

- **Never edit an applied Flyway migration.** `V*.sql` files that have been merged are immutable — Flyway checksums them, and changing one breaks every teammate's database on next startup. Add a new `V<n>__description.sql`.
- **Never write a migration that deletes data to reseed.** `V7__seed_judging_criteria.sql` opens with `delete from scores;` and is the example not to follow. Update or deactivate rows instead.
- **Credentials live outside the tree.** `backend/credentials/` is gitignored at both levels and `sheets-key.json` has never been committed. Do not add a fallback that reads a key from anywhere inside `frontend/src/` or from a committed properties file.
- **Do not commit live resource identifiers into `application.properties`.** The two Google Sheet ids currently there are an existing violation, not a precedent — they cause every checkout to poll the team's live sheets on startup.
- **A new endpoint outside `/api/auth/**` is authenticated by default** (`anyRequest().authenticated()`). If you add a `permitAll` matcher, say why in the same change.
- **`users` is the sign-in allowlist.** A row must exist before a person can authenticate. There is no self-registration endpoint, and adding one changes the admissions policy — that is a decision, not an implementation detail.
