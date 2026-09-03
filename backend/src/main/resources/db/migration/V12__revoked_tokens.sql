-- V12__revoked_tokens.sql
--
-- Backs server-side JWT logout. Sessions are otherwise stateless (see the
-- SESSION_MANAGEMENT security report) - signing out on the frontend previously did
-- nothing to a bearer token already handed out, so a copied token kept working for the
-- rest of its lifetime (up to app.jwt.expiration-ms, 24h in production). This table lets
-- POST /api/auth/logout revoke the one token that was presented, and
-- JwtAuthenticationFilter checks it on every request.
--
-- One row per revoked token, keyed by its `jti` claim rather than the token text itself,
-- so a leaked table dump does not hand out live bearer tokens. `expires_at` is copied
-- from the token's own `exp` claim so a scheduled sweep can drop rows once the token
-- would have expired naturally anyway - there is no value in remembering a revocation
-- for a token that can no longer be used.
--
-- `user_id` is informational only (who logged out), not a foreign key. The filter never
-- joins through it - it checks a token's `jti` alone - and a token remains correctly
-- revoked regardless of what later happens to the user row it was issued to.

create table revoked_tokens (
    jti         text        not null primary key,
    user_id     bigint,
    expires_at  timestamptz not null,
    revoked_at  timestamptz not null default now()
);

create index revoked_tokens_expires_at_idx on revoked_tokens (expires_at);

comment on table revoked_tokens is
    'Bearer token ids (jti) invalidated by explicit logout, checked on every authenticated request until the token would have expired anyway.';
