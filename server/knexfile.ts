import dotenv from "dotenv";
import type { Knex } from "knex";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dirname = path.dirname(fileURLToPath(import.meta.url));

// Load the repo-root .env regardless of cwd.
dotenv.config({ path: path.resolve(dirname, "../.env"), quiet: true });

// Render provides a single DATABASE_URL. Locally, fall back to discrete PG*
// vars; anything unset uses the pg driver's defaults (e.g. your OS user).
const connection: Knex.PgConnectionConfig = process.env.DATABASE_URL
  ? {
      connectionString: process.env.DATABASE_URL,
      // Managed Postgres requires SSL; set DATABASE_SSL=false for a local URL.
      ssl:
        process.env.DATABASE_SSL === "false"
          ? false
          : { rejectUnauthorized: false },
    }
  : {
      host: process.env.PGHOST || "localhost",
      port: process.env.PGPORT ? Number(process.env.PGPORT) : 5432,
      user: process.env.PGUSER,
      password: process.env.PGPASSWORD,
      database: process.env.PGDATABASE || "herofolio",
    };

// This app's tables live in their own Postgres schema so the database can be
// shared with other projects. `searchPath` points every unqualified query, and
// knex's own migration bookkeeping, at it. db/migrate.ts creates the schema.
export const schema = process.env.DB_SCHEMA || "herofolio";

const toSnake = (s: string) =>
  s.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
const toCamel = (s: string) =>
  s.replace(/_([a-z])/g, (_, c) => c.toUpperCase());

// Rows come back with camelCase keys. Only top-level keys are converted, so
// jsonb column contents are returned exactly as stored.
function camelizeRow(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(camelizeRow);
  if (value && Object.getPrototypeOf(value) === Object.prototype) {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [toCamel(k), v]),
    );
  }
  return value;
}

const config: Knex.Config = {
  client: "pg",
  connection,
  searchPath: [schema],
  // Small: the production database is shared, and its herofolio role is
  // capped at 25 connections (see docs/deploy/create-herofolio-role.sql).
  pool: { min: 0, max: 5 },
  migrations: { directory: path.resolve(dirname, "db/migrations") },
  // Write camelCase in queries; the database uses snake_case.
  wrapIdentifier: (value, origImpl) =>
    origImpl(value === "*" ? value : toSnake(value)),
  postProcessResponse: (result) => camelizeRow(result),
};

export default config;
