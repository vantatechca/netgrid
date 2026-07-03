# Database migrations

These are **hand-written, idempotent SQL migrations**. The drizzle-kit journal
(`meta/_journal.json`) only covers the first few files and is no longer the
source of truth — do not rely on `drizzle-kit migrate`.

## How they get applied

On every Render deploy, the web service's `preDeployCommand` runs
`npm run db:migrate` (→ `src/lib/db/migrate.mjs`) **after build, before the new
version goes live**. If migration fails, the deploy is blocked rather than
shipping code against an un-migrated database.

The runner:

1. Ensures a `_netgrid_migrations` tracking table exists.
2. Applies every `*.sql` file in filename order that isn't already recorded
   there (skipping `*seed*` — sample data is never auto-applied).
3. Records each file it applies so later deploys skip it.

It tolerates "already in the desired state" errors (duplicate table / type /
column, or a missing object on `DROP`). That makes the **first** run against
the existing production database a safe no-op replay: objects that already
exist raise duplicate errors we swallow, and anything genuinely missing gets
created. Any other error aborts the deploy.

You can run it locally against a database too:

```bash
DATABASE_URL=... npm run db:migrate
```

## Adding a migration

1. Create the next `NNNN_short_name.sql` file (keep the numeric prefix
   monotonic).
2. **Write it idempotently** — `CREATE TABLE IF NOT EXISTS`,
   `ADD COLUMN IF NOT EXISTS`, `DROP ... IF EXISTS`, `CREATE INDEX IF NOT
   EXISTS`, and wrap `CREATE TYPE` in a `DO $$ ... EXCEPTION WHEN
   duplicate_object THEN null; END $$;` block. This keeps replays and manual
   re-runs safe.
3. Data backfills (`UPDATE`) should be guarded with a `WHERE` clause so they
   converge on re-run.
4. Deploy — the runner applies it automatically. No manual SQL step.
