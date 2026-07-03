// Idempotent migration runner for netgrid.
//
// Why this exists: the project uses hand-written, idempotent SQL migrations
// in ./migrations (the drizzle-kit journal was abandoned — see meta/_journal
// only tracking the first few). Render does not apply migrations on deploy,
// so every schema change previously required someone to run the SQL by hand
// against production. Missed migrations were the recurring cause of runtime
// 500s (a table/column the code expected simply wasn't there yet).
//
// This runner is wired into Render's preDeployCommand (see render.yaml). On
// every deploy it applies any migration files not yet recorded in the
// "_netgrid_migrations" tracking table, in filename order.
//
// It is deliberately tolerant of "already in the desired state" errors
// (duplicate table/type/column, missing object on DROP). That makes the very
// first run against an already-populated production database a no-op replay:
// existing objects raise duplicate errors we swallow, genuinely-missing ones
// get created. After that first run every file is recorded and skipped.
//
// Pure Node + @neondatabase/serverless (a runtime dependency) — no tsx, no
// drizzle, so it runs even in a minimal deploy environment.

import { neon } from "@neondatabase/serverless";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), "migrations");

// Files matching this are never auto-applied — sample/dev seed data only.
const SKIP = /seed/i;

// Postgres error codes meaning "already in the desired state". Swallowing
// these is what makes a full replay against a live database safe.
const TOLERATED = new Set([
  "42P07", // duplicate_table (also duplicate index / relation)
  "42710", // duplicate_object (type, constraint, ...)
  "42701", // duplicate_column
  "42P06", // duplicate_schema
  "42704", // undefined_object (e.g. DROP TYPE on a type already gone)
  "42703", // undefined_column (e.g. DROP COLUMN already gone)
  "42P01", // undefined_table (e.g. ALTER/DROP on a table already gone)
]);

/**
 * Split a .sql file into individual statements on top-level semicolons,
 * respecting -- line comments, C-style block comments, single-quoted
 * strings, and $tag$ dollar-quoted bodies (used by DO blocks). The neon
 * HTTP driver runs one statement per round-trip, so pre-splitting is
 * required; "--> statement-breakpoint" markers are just line comments and
 * fall out naturally.
 */
export function splitStatements(sql) {
  const out = [];
  let buf = "";
  let line = false;
  let block = false;
  let single = false;
  let dollar = null;
  for (let i = 0; i < sql.length; i++) {
    const c = sql[i];
    const c2 = sql[i + 1];
    if (line) {
      buf += c;
      if (c === "\n") line = false;
      continue;
    }
    if (block) {
      buf += c;
      if (c === "*" && c2 === "/") {
        buf += c2;
        i++;
        block = false;
      }
      continue;
    }
    if (single) {
      buf += c;
      if (c === "'") {
        if (c2 === "'") {
          buf += c2;
          i++;
        } else {
          single = false;
        }
      }
      continue;
    }
    if (dollar) {
      if (c === "$" && sql.startsWith(dollar, i)) {
        buf += dollar;
        i += dollar.length - 1;
        dollar = null;
      } else {
        buf += c;
      }
      continue;
    }
    if (c === "-" && c2 === "-") {
      line = true;
      buf += c;
      continue;
    }
    if (c === "/" && c2 === "*") {
      block = true;
      buf += c + c2;
      i++;
      continue;
    }
    if (c === "'") {
      single = true;
      buf += c;
      continue;
    }
    if (c === "$") {
      const tag = /^\$[A-Za-z0-9_]*\$/.exec(sql.slice(i));
      if (tag) {
        dollar = tag[0];
        buf += tag[0];
        i += tag[0].length - 1;
        continue;
      }
    }
    if (c === ";") {
      if (!isBlank(buf)) out.push(buf.trim());
      buf = "";
      continue;
    }
    buf += c;
  }
  if (!isBlank(buf)) out.push(buf.trim());
  return out;
}

/** True when a chunk carries no executable SQL (whitespace / comments only). */
function isBlank(chunk) {
  const stripped = chunk
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/--[^\n]*/g, "");
  return stripped.trim().length === 0;
}

function rowsOf(result) {
  if (Array.isArray(result)) return result;
  if (result && Array.isArray(result.rows)) return result.rows;
  return [];
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("[migrate] DATABASE_URL is not set — cannot run migrations");
    process.exit(1);
  }

  const sql = neon(url);

  await sql.query(
    `CREATE TABLE IF NOT EXISTS "_netgrid_migrations" (
       "name"       text PRIMARY KEY,
       "applied_at" timestamptz NOT NULL DEFAULT now()
     )`,
  );

  const applied = new Set(
    rowsOf(await sql.query(`SELECT "name" FROM "_netgrid_migrations"`)).map(
      (r) => r.name,
    ),
  );

  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql") && !SKIP.test(f))
    .sort();

  let appliedCount = 0;
  for (const file of files) {
    if (applied.has(file)) continue;

    const statements = splitStatements(
      readFileSync(join(MIGRATIONS_DIR, file), "utf8"),
    );

    let skipped = 0;
    for (const stmt of statements) {
      try {
        await sql.query(stmt);
      } catch (err) {
        const code = err && (err.code || (err.sourceError && err.sourceError.code));
        if (code && TOLERATED.has(code)) {
          skipped++;
          continue;
        }
        console.error(`[migrate] ${file} — statement failed:\n${stmt}\n`);
        throw err;
      }
    }

    await sql.query(
      `INSERT INTO "_netgrid_migrations" ("name") VALUES ($1) ON CONFLICT DO NOTHING`,
      [file],
    );
    appliedCount++;
    console.log(
      `[migrate] applied ${file}` +
        (skipped ? ` (${skipped} already-present statement(s) skipped)` : ""),
    );
  }

  console.log(
    appliedCount === 0
      ? "[migrate] up to date — no new migrations"
      : `[migrate] done — ${appliedCount} migration file(s) applied`,
  );
}

// Only run when invoked directly (node migrate.mjs), not when imported.
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((err) => {
    console.error("[migrate] fatal:", err);
    process.exit(1);
  });
}
