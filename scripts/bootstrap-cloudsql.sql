-- scripts/bootstrap-cloudsql.sql
-- Production Cloud SQL PostgreSQL 16 Bootstrap Script

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'hackathon_migrator') THEN
        CREATE ROLE hackathon_migrator LOGIN PASSWORD 'dev_migrator_local'
            NOSUPERUSER NOCREATEDB NOCREATEROLE;
    END IF;
END
$$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'hackathon_app') THEN
        CREATE ROLE hackathon_app LOGIN PASSWORD 'dev_app_local'
            NOSUPERUSER NOCREATEDB NOCREATEROLE;
    END IF;
END
$$;

-- Grant role membership to Cloud SQL admin user (postgres)
GRANT hackathon_migrator TO postgres;
GRANT hackathon_app TO postgres;

-- Configure Schema Ownership and Privileges
ALTER SCHEMA public OWNER TO hackathon_migrator;

REVOKE ALL ON SCHEMA public FROM PUBLIC;
REVOKE ALL ON DATABASE hackathon_db FROM PUBLIC;

GRANT CONNECT ON DATABASE hackathon_db TO hackathon_app, hackathon_migrator;
GRANT USAGE ON SCHEMA public TO hackathon_app;
GRANT USAGE, CREATE ON SCHEMA public TO hackathon_migrator;

-- Ensure Flyway-created tables are accessible by the application
ALTER DEFAULT PRIVILEGES FOR ROLE hackathon_migrator IN SCHEMA public
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO hackathon_app;
ALTER DEFAULT PRIVILEGES FOR ROLE hackathon_migrator IN SCHEMA public
    GRANT USAGE, SELECT ON SEQUENCES TO hackathon_app;
